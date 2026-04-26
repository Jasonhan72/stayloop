# Stayloop V3 详细架构（Pitch / 投资人视角）

> 本文档是简版 [`architecture.md`](./architecture.md) 的扩展，配以图示、商业逻辑、护城河分析。
> 适合：合作伙伴 BD、投资人 pitch、合规审查、招聘解释。

## One-Liner

> Stayloop 是 AI 时代的加拿大长租房屋信任基础设施。一次认证多处可用、AI 接管所有非判断类工作、人类只做关键决定。

## 三类用户 / 三种价值

```
┌──────────────────────────────────────────────────────────────┐
│  Tenant（租客）                                              │
│  价值：Verified Passport — 一次认证、多处申请、信任凭证     │
│  痛点解决：被反复审、deposit 议价空间、本地无信用记录困境  │
├──────────────────────────────────────────────────────────────┤
│  Landlord（房东）                                            │
│  价值：AI 反欺诈 + 法庭记录 + Pipeline 排序                 │
│  痛点解决：假工资单、假雇佣信、撒网式申请、决策耗时        │
├──────────────────────────────────────────────────────────────┤
│  Agent（地产经纪）                                           │
│  价值：双语 SaaS + MLS 一键导入 + Branded reports           │
│  痛点解决：行政繁琐、信任沟通、跨房源管理                  │
└──────────────────────────────────────────────────────────────┘
```

## 8+1 Agent 架构

每个 agent 是一组 **system prompt + 工具子集 + 输出 schema + 审计规则** 的封装。
agents 共享同一组工具（L1 Capability Layer），通过组合表达不同业务能力。

| Agent | 服务对象 | 核心工具集 | 上线 Sprint |
|---|---|---|---|
| **Logic** | 房东 | forensics + court + registry + BN + ID + score | S1-3（首发） |
| **Nova** | 房东 / 经纪 | import_listing + market_data + draft_message | S4-5 |
| **Echo** | 租客 | passport_compose + listing_search + draft_message | S6-7 |
| **Analyst** | 房东 / 经纪 | market_data + comparable_analysis | S8 |
| **Mediator** | 双方 | ltb_case_search + dispute_resolve + draft_message | S10+ |
| **Onboarding** | 全部 | id_verify + bank_connect + reference_check | S6 |
| **Services** | 全部 | service_dispatch + escrow + reviews | S11+ |
| **Trust** | 全部 | passport_validate + sign_request + audit_query | S9 |
| **Ops（内部）** | Stayloop 团队 | pipeline_metrics + cost_monitor + abuse_detect | 持续 |

**为什么是 8+1 而不是 1 个大 agent**：每个 agent 有清晰职责边界 → 容易测试、容易迭代、容易给特定客户做 quota / billing。

## 核心数据原语：Verified Renter Passport

Passport 是 Stayloop 的护城河资产 —— 由多个工具产出的可验证签发凭证：

```
Passport (90 天有效期)
├── identity_verified        SIN Luhn + DL + 政府 ID 上传
├── income_verified          paystub × N + NOA + 银行流水
├── credit_verified          Equifax 直连（Phase 3+）
├── rental_history           前房东推荐信 + 公开法庭记录扫描
├── arm_length_employer      雇主在 CA federal registry 验证
├── score_band               Top 8% / 30% / Median / etc.
├── valid_until              issuance + 90d
└── hash + signature         Stayloop 签发，不可伪造
```

租客付一次（$5-15）拿到 Passport → 向多个房东 apply 时直接出示 hash → 房东登 stayloop 验真伪。

## 4 层架构 + 商业层

```
┌─ L4 Distribution & Monetization（业务层）──────────────────┐
│  Landlord SaaS    Agent SaaS    Tenant Pass    Trust API*  │
│  $29/mo           $99-299/mo     $5-15/次       (Phase 4+) │
└──────────────────────────────────┬──────────────────────────┘
                                   │
┌─ L3 Apps（用户接触面）────────────┴─────────────────────────┐
│  /chat   /screen   /dashboard   /agent-portal   /tenant     │
└──────────────────────────────────┬──────────────────────────┘
                                   │
┌─ L2 Agents（决策与对话）──────────┴─────────────────────────┐
│  Logic   Nova   Echo   Analyst   Mediator   Onboarding ...  │
└──────────────────────────────────┬──────────────────────────┘
                                   │
┌─ L1 Capability Layer（工具）──────┴─────────────────────────┐
│  Forensics · Court · Registry · BN · ID · Score · Listing · │
│  Market Data · Bank Analysis · Passport · Sign · Audit ...  │
└──────────────────────────────────┬──────────────────────────┘
                                   │
┌─ L0 Infrastructure ───────────────┴─────────────────────────┐
│  Supabase · Cloudflare · Anthropic · Stripe · Resend · CRA  │
└──────────────────────────────────────────────────────────────┘

* Trust API 暂不对外开放，见 ADR-005
```

## 护城河分析

| 护城河 | 复制难度 | 时间窗口 |
|---|---|---|
| **8+1 agent 架构 + 工具组合** | 中等：架构模式公开但 prompt + 工具组合是 know-how | 12-18 个月 |
| **CA federal registry 本地索引 + 月度刷新** | 低：数据公开，但 ingest pipeline + 模糊匹配调优是工作量 | 6-12 个月 |
| **PDF forensics 深度** | 高：需要积累伪造样本 + 多年迭代规则 | 18-24 个月 |
| **Verified Renter Passport 品牌信任** | 高：网络效应 + 第一动品牌 | 24-36 个月 |
| **双语 native UX** | 中等：竞品（Liv.rent）也双语，但 stayloop 中文 forensics 细节更深 | 持续优势 |
| **法庭记录 + LTB rulings 数据集** | 中等：CanLII 公开但需要 14k+ rulings 训练 Mediator agent | 12 个月 |

## 关键技术决定

详见 [`adr/`](./adr/) 目录：

- **ADR-001** — 为什么用 Claude 而不是 OpenAI
- **ADR-002** — 为什么自己写 agent loop 而不用 LangChain / Claude Agent SDK
- **ADR-003** — 为什么用 Cloudflare Edge 而不是传统 Node server
- **ADR-004** — 为什么本地 federal corp registry 而不是 OpenCorporates
- **ADR-005** — 为什么 Trust API 暂不对外开放

## 上线节奏

```
Phase 1（4-6 周）│ AI-Native 基础架构 + Logic agent + 现有用户验证
Phase 2（6-10 周）│ Nova + Echo + Verified Passport + 银行流水分析
Phase 3（10-16 周）│ Pipeline + 经纪 SaaS + 申诉流程
Phase 4（4-6 个月+）│ Mediator + Trust API 评估对外开放
```

12 个月内目标：$300-500k ARR + Toronto 华人房东市场可识别市场份额 + 5+ 经纪人 brokerage 试用。

## 团队节奏假设

- **现在**：1 人（创始人 + AI assistants）
- **Phase 2 末期**：考虑 hire 第 2 个人（BD/marketing 比 engineer 更紧迫）
- **Phase 3 末期**：3-5 人（创始人 + BD + engineer + ops + 兼职律师）

## 与竞品对照

| 维度 | Stayloop | Liv.rent | FrontLobby | Naborly | Realtor.ca |
|---|---|---|---|---|---|
| 双语原生 | ✅ | ✅ | ❌ | ❌ | ⚠️ |
| AI-Native | ✅ | ⚠️ | ❌ | ❌ | ❌ |
| PDF forensics 深度 | ✅✅ | ⚠️ | ⚠️ | ✅ | ❌ |
| 法庭记录 | ✅ | ❌ | ❌ | ⚠️ | ❌ |
| Verified Passport | ✅ | ⚠️ | ❌ | ⚠️ | ❌ |
| 经纪 SaaS | (Phase 3) | ❌ | ❌ | ✅ | ⚠️ |
| 房源 listing | (Phase 2) | ✅ | ❌ | ❌ | ✅✅ |
| 反欺诈定位 | ✅✅ | ✅ | ⚠️ | ⚠️ | ❌ |

## 合规与风险

- **PIPEDA**：所有租客数据可申请查看 / 删除（pending_actions 流程）
- **Ontario Human Rights Code**：禁止基于 protected grounds（种族、宗教、家庭状况）评分；prompt 中明确指令 + 算法层无相关字段输入
- **Tenant Protection Act**：租客有权对 Stayloop 错误数据申诉，Mediator agent 提供 14 天处理 SLA
- **RECO**：Stayloop **不是** brokerage，不持牌，不收交易佣金；经纪通过外部 brokerage 持牌
- **Defamation**：所有 AI 关于个人的 critical claim 必须 cite 具体 tool execution id（hard rule）
