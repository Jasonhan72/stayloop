# Stayloop Screening 系统审计报告

**审计日期**：2026-06-02
**版本**：main 分支 commit `1dea07b`
**审计范围**：完整 screening 流程（5147 行 TypeScript，分布在 13 个文件）

---

## 1. 算法总览

### 1.1 数据流（端到端）

```
租户上传文件
    ↓
[/api/classify-files]  Haiku/Sonnet 分类每个文件 → kinds[] + 月租提取
    ↓
[screenings 表]        存 file paths + form fields (monthly_rent / monthly_income / notes)
    ↓
[/api/screen-score POST]
    │
    ├─ Stage 1  签名所有文件 URL (Supabase Storage)
    ├─ Stage 2  并行: 法院查询 (CanLII + Ontario Portal) ‖ 取证 (lib/forensics)
    ├─ Stage 3  Sonnet 4.5 调用：传递所有文件 + 表单 + 法院结果 + 取证报告
    │           → 返回 5 维 0-100 分 + hard_gates + red_flags + extracted_names
    ├─ Stage 3.5 取证驱动的维度归零（伪造文件 → 对应维度=0）
    ├─ Stage 4  应用 hard gates（封顶） + red flag 惩罚（减分） + 证据覆盖率
    ├─ Stage 5  映射回 legacy 6 列（向后兼容旧 dashboard）
    └─ Stage 5.5 给 AI 抽出的额外姓名跑补充法院查询
    ↓
[写回 screenings]      ai_score + ai_summary + 取证细节 + tier 决策
```

### 1.2 评分公式

```
5 个维度（v3 模型）权重总和 = 100%：
  ability_to_pay   40%   收入/租金 + 收入稳定性 + 应急储备
  credit_health    25%   征信分数 + 债务比 (DTI)
  rental_history   20%   前房东推荐 + LTB/小额法庭
  verification     10%   雇主验证 + 文件真实性
  communication     5%   申请完整度 + 主动披露

baseScore = Σ s[dim] × V3_WEIGHTS[dim]
penalty   = ΣRED_FLAG_PENALTIES[flag] + forensicsPenalty
gateCap   = min(HARD_GATE_CAPS[gate])  // 多 gate 取最严的
overall   = clamp(0..100, min(baseScore − penalty, gateCap))
```

### 1.3 决策分层（tier）

```
evidenceCoverage < 0.4              → conditional (证据不足)
任意 hard_gate                       → decline
0.4 ≤ evidenceCoverage < 0.6         → conditional (低置信)
overall ≥ 85                         → approve
70 ≤ overall < 85                    → conditional
overall < 70                         → decline
```

### 1.4 Hard Gate 封顶值

| Gate | 封顶 | 触发条件 |
|---|---|---|
| `pdf_is_screenshot` | 30 | PDF 是图片 + 截图工具元数据 |
| `court_record_defendant_multi` | 25 | 2+ 法庭被告记录 |
| `court_record_active` | 20 | 进行中的法庭被告案件 |
| `court_record_defendant` | 35 | 1 个法庭被告记录 |
| `paystub_math_impossible` | 35 | YTD inflated >2.5× 或 hourly×hours ≠ stated |
| `bn_employer_mismatch` | 35 | 雇主 BN 与文件不符 |
| `ltb_eviction` | 40 | 确认的 LTB 驱逐 |
| `cross_doc_collision` | 40 | 申请人电话 == 雇主/HR 电话 |
| `employer_fraud` | 45 | 公司不存在 |
| `producer_consumer_tool` | 50 | PDF Producer 是 Preview/Word/Skia 等 |
| `identity_mismatch` | 50 | 同名但 DOB/地址/ID 不匹配 |
| `self_issued_employment` | 50 | 自己开公司给自己开工资 |
| `doc_tampering` | 55 | AI 视觉判断有 PS/字体异常 |
| `affordability_severe` | 55 | 租金 > 40% 收入 |
| `income_severe` | 65 | 收入/租金 < 2.0× |

### 1.5 Red Flag 惩罚（减分，会叠加）

```
self_issued_employment_letter    -15
hr_phone_is_applicant            -10
cross_doc_contradictions          -8
rent_ratio_high                   -8
id_format_invalid                 -6
rush_move_in                      -4
no_linkedin_for_professional_role -3
volunteered_sin                   -2

+ forensics 惩罚: critical=-10, high=-5, medium=-2 (每个 flag 累加)
+ Sonnet 标记的 "forensics_<code>" 也会 stack 进 red_flags
```

---

## 2. 关键 Bug 列表（按优先级）

### 🔴 P0 严重：负担能力 hard gate 用的是**自报**收入，不是文件提取的收入

**位置**：`screen-score/route.ts:651-652` + `:1290-1297`

```typescript
// Line 651-652  —— 用表单里写的 monthly_income
const monthlyIncome = Number(screening.monthly_income) || 0
const incomeRatio = monthlyRent > 0 ? monthlyIncome / monthlyRent : 0

// Line 1290-1297  —— gate 用的就是这个
if (monthlyRent > 0 && incomeRatio > 0 && incomeRatio < 2.0 && ...) {
  hardGates.push('income_severe')
}
if (monthlyRent > 0 && incomeRatio > 0 && incomeRatio < 2.5 && ...) {
  hardGates.push('affordability_severe')
}
```

**问题**：申请人在表单里写月入 $10,000，但工资单实际 $4,000。`incomeRatio` 用的是 $10,000，gate 不触发；下游虽然算了 `effectiveIncome = detectedIncome ?? monthlyIncome` (line 1651)，但只用于展示，不影响 gate 判定。

**修法**：把 `effectiveIncome / monthlyRent` 用作 gate 的判断依据。表单值仅在 AI 没提取出收入时 fallback。

---

### 🔴 P0 严重：AI 返回的 5 维分数**只校验了第一个**

**位置**：`screen-score/route.ts:1116-1120`

```typescript
const s: V3Scores = parsed.scores || {}
if (typeof s.ability_to_pay !== 'number') {
  return NextResponse.json({ error: 'Missing v3 scores' }, { status: 500 })
}
```

**问题**：
1. 只检查 `s.ability_to_pay` 是 number，其余 4 维（credit_health / rental_history / verification / communication）没检查
2. 没有把分数 clamp 到 0–100。AI 偶尔会返回 150、-30、字符串、NaN
3. 一旦某维度是 undefined，`s.dim × weight` = `NaN`，整个 baseScore = NaN，覆盖一切

**修法**：
```typescript
const ALL = ['ability_to_pay','credit_health','rental_history','verification','communication'] as const
for (const k of ALL) {
  if (typeof s[k] !== 'number' || !isFinite(s[k])) {
    return error('Missing v3 scores')
  }
  s[k] = Math.max(0, Math.min(100, Math.round(s[k])))
}
```

---

### 🟠 P1 高优先级：prompt 里 `detected_document_kinds` 列表里**没有 lease**

**位置**：`screen-score/route.ts:894`

```typescript
- detected_document_kinds (subset of [employment_letter, pay_stub, bank_statement,
  id_document, credit_report, offer_letter, reference, other])
```

**问题**：跟我刚修的 classify-files 同一类 bug 的另一个落点。Sonnet 看完租约后只能选 `other`，下游评分流程对"是否有租约证据"无感知。租金、入住日期、押金这些直接来源于租约的字段都没锚点。

**修法**：把 `lease` 加进这个 prompt 的合法 kind 列表。

---

### 🟠 P1 高优先级：法院被告角色一刀切

**位置**：`screen-score/route.ts:814-822` + `:1418-1456`

```typescript
- Portal cases where applicant is DEFENDANT or DEBTOR → rental_history MUST be 20 or below
- 1 Small Claims case as Defendant → trigger "court_record_defendant" hard gate
```

**问题**：所有"被告"角色按同等程度惩罚，没区分案件类型。常见误伤：
- 家事法庭（离婚/抚养）— 跟租户质量无关
- 保险纠纷被告 — 大多被保险公司起诉
- 房东侵权诉讼（applicant 是申请租金保护的租户）— 反而是正向信号
- 工伤索赔反诉

**修法**：限制 hard gate 仅对 `onscsm`（小额法庭）+ `onsc`（民事，债务案）+ `onltb`（LTB 被告）生效。`oncj`（刑事）走 reviewer_note 不自动扣分（已实现）。`onhrt` 已正确排除。

---

### 🟠 P1 高优先级：取证惩罚三重计数

**位置**：`screen-score/route.ts:1319-1333` + `:1470-1478`

同一个高 severity forensics flag 会：
1. 进 `hardGates`（封顶得分）
2. 进 `red_flags` 作为 `forensics_<code>`（再减分）
3. 进 `forensicsPenalty`（再再减分）

**问题**：一个 critical forensics flag 等于：封顶 + 减 N + 再减 10。对真伪造案件影响不大（反正都封顶到低分），但对中等严重度信号过度惩罚。

**修法**：选择一种主渠道。建议保留 hardGates + forensicsPenalty，移除 `forensics_<code>` 加入 redFlags 的逻辑（line 1329-1333）。

---

### 🟡 P2 中优先级：Self-issued employment 检测仅靠 AI

**位置**：`screen-score/route.ts:872-879`（prompt）+ `lib/forensics/arm-length.ts`

**问题**：Prompt 让 AI 自己判断"申请人是否给自己开雇主信"，但这是个**确定性检查**应该做（姓氏匹配、公司是否数字公司、应聘人是否在公司注册资料里）。`lib/forensics/arm-length.ts` 里已经写好了完整的确定性检查，但只在 "Deep Check" 按钮触发时跑（Pro 用户默认，Free 用户要手动激活）。

**修法**：把 arm-length 的姓氏匹配 + 数字公司检测设为**默认跑**（cheap，无外部 API），只把 ON Corporate Registry 查询放在 Deep Check（贵）。

---

### 🟡 P2 中优先级：`mapV3ToLegacy` 中 court_records 用 rental_history

**位置**：`screen-score/route.ts:584`

```typescript
court_records: v3.rental_history  // v3 bundles LTB into rental_history
```

**问题**：v3 的 `rental_history` = "前房东推荐 (10%) + LTB/小额法庭 (10%)" 的混合。
旧 UI 的 `court_records` 列直接拿这个值，会把"没记录但前房东推荐良好"=85 和"有 1 个 LTB 但没前房东推荐"=40 混在一起，显示语义模糊。

**修法**：取证报告里已有 `courtDetail.total_hits`，可以基于 hit 数直接算 court_records: 0 hits → 95, 1 hit → 50, 2+ hits → 20。

---

### 🟡 P2 中优先级：DTI 跟 income_rent_ratio 概念重叠

**位置**：`screen-score/route.ts:846-848`

```
1. ability_to_pay (40%) — 收入/租金 (25%), income stability (10%), emergency reserves (5%)
2. credit_health (25%) — credit score (15%), DTI (10%)
```

**问题**：`income_rent_ratio` 和 `DTI` 都在衡量"租金占收入比例"。DTI 标准定义包含所有月债务（车贷、信用卡、租金/房贷），所以 25% 权重的 income_rent_ratio + 10% 权重的 DTI 实际上对 rent vs income 这件事的总权重是 35%（>= 1/3 整体得分）。如果信用报告显示低 DTI，但收入/租金比也低 — 模型可能给个折中分数，掩盖了实际风险。

**修法**：要么把 DTI 重新定义为 "non-rent debt / income"（剔除租金避免重复），要么把 income_rent_ratio 改为 "rent / income"（更纯粹的负担能力），分开度量。

---

### 🟢 P3 低优先级问题（按位置列表）

| # | 位置 | 描述 |
|---|---|---|
| L1 | `route.ts:1490-1512` | `subCov` 默认 "measured"（1.0）— token 省了但容易制造虚假高置信度 |
| L2 | `route.ts:1535` | `identityMatch` 默认 70 — AI 没给值时落到一个无来源的"软及格" |
| L3 | `mapV3ToLegacy:586` | `behavior_signals = 100 − redFlagCount × 15` 跟 overall penalty 在 UI 上看着像双重计数（实际不是） |
| L4 | `types.ts:45` | 注释说 text_sample 是 200 chars，实际代码用 50k chars — 注释过期 |
| L5 | `route.ts:1483` | overall 多次 Math.round，精度损失累积 |
| L6 | `pdf-text.ts` | text density 阈值 50 chars/page 硬编码 — 中文租约可能正常情况下也低于这个值（图片渲染 + 少量 metadata 文字） |
| L7 | `classify-files` (legacy) | 没有重试逻辑，单次 Sonnet 调用失败 → 整批 fail，依赖前端 fallback 到 filename heuristic |

---

## 3. 推荐的修复优先级

**Phase 1 — 立即修（影响打分正确性）**

1. P0：affordability gate 改用 `effectiveIncome`（line 651, 1290-1297）
2. P0：5 维分数全部校验 + clamp 0-100（line 1116-1120）
3. P1：prompt 中 `detected_document_kinds` 加 `lease`（line 894）

**Phase 2 — 算法精炼（1-2 周内）**

4. P1：法院被告 gate 按 court database 类型区分（line 1418-1456）
5. P1：去掉 forensics 的三重计数（line 1329-1333）
6. P2：把 arm-length 的廉价部分（姓氏匹配 + 数字公司）默认启用

**Phase 3 — 改进可解释性（择期）**

7. P2：`mapV3ToLegacy` 的 court_records 列直接从 `courtDetail.total_hits` 算
8. P2：DTI 与 income_rent_ratio 重新分工（DTI 改为 "non-rent debt"）
9. P3：subCov 默认改成 "inferred"（0.6）而不是 "measured" — 让 AI 必须显式确认才给满信心
10. P3：失败重试 — Sonnet JSON 解析失败时自动用更简 prompt 重试一次

---

## 4. 测试缺口

`lib/forensics/__tests__/` 里有 severity 测试，但**没有覆盖**：
- `screen-score/route.ts` 的端到端集成测试（Stage 1-5）
- `mapV3ToLegacy` 的输出映射
- Hard gate cap 在多 gate 同时触发时的 min 选择
- AI 返回畸形 JSON 的容错路径（已经有 `extractJson()` 但没测）
- "lease 文件出现 + 租金提取正确"的 happy path

建议加 8-12 个集成测试用例覆盖上述场景。

---

## 5. 已完成（2026-06-02 当天部署）

| Commit | 修复内容 |
|---|---|
| `60ecd14` | OCR 回灌给 source-specific（扫描件信用报告不再误判）+ 删掉"任一文件造假 → 全维度=0"级联 |
| `1dea07b` | classify-files v2：加 `lease` 类型 + 逐文件 rent 提取 + 服务器只采用 lease 文件的租金 |

这两个提交解决了用户报告的三个 bug。本审计文档列出了**剩余的**潜在问题。

---

*审计人：Claude (Cowork)*
*下次复审建议：Phase 1 修完后立刻复审 — 那时大部分严重 bug 应已解决。*
