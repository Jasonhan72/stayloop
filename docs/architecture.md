# Stayloop V3 架构（工程师视角）

> 简版，给团队成员、新 hire、审计律师、自己 6 个月后回头看用。
> Pitch / 投资人视角的详细版见 [`architecture-detailed.md`](./architecture-detailed.md)。

## 核心理念

**AI-Native 架构**：AI 是主交互层，传统表单 / 按钮是经典模式 fallback。
**4 层分离**：L0 基础设施、L1 工具能力、L2 Agents、L3 应用。每层只与相邻层交互。
**工具是契约**：所有能力以 JSONSchema 工具形式暴露给 agents。同样的工具可以被多个 agents 复用。

## 4 层结构

```
┌─ L3 Apps（用户接触面）─────────────────────────────────────────┐
│  /chat            AI-native 主入口（Logic / Echo / Nova driver）│
│  /screen          经典模式（form-driven，给老用户 / fallback）  │
│  /dashboard       Pipeline 视图（多 applicant ranking）         │
│  /agent-portal    经纪 SaaS（多 listing + bulk operations）     │
│  /tenant          租客侧（Verified Passport + 找房）            │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌─ L2 Agents（决策与对话）───────┴────────────────────────────────┐
│  Logic        房东侧筛查 + applicant ranking      [Sprint 1-3]  │
│  Nova         Listing 创作 + 双语 SEO 描述         [Sprint 4-5] │
│  Echo         租客 concierge + Passport guidance   [Sprint 6-7] │
│  Analyst      Stayloop Index + 市场数据            [Sprint 8]   │
│  Mediator     LTB-trained 纠纷调解                 [Sprint 10+] │
│  + Onboarding / Services / Trust 等（Sprint 8+）                │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌─ L1 Capability Layer（工具 / 能力）────────────────────────────┐
│  classify_files          文件类型识别                           │
│  run_pdf_forensics       PDF 元数据 + 结构 + OCR                │
│  search_canlii           CanLII 全 ON 数据库                    │
│  search_ontario_portal   Civil & Small Claims Court             │
│  lookup_corp_registry    CA federal corp 注册查询                │
│  lookup_bn               CRA Business Number 反查公司            │
│  validate_id_numbers     SIN Luhn / Ontario DL / OHIP           │
│  compute_screening_score scoring + hard gates + red flags       │
│  generate_narrative      bilingual screening explanation        │
│  analyze_bank_statement  入账 vs 工资单交叉验证   [Sprint 4]    │
│  import_listing          MLS / URL / PDF → 结构化 listing       │
│  draft_message           邮件 / 拒绝信 / 申请回复                │
│  market_data             租金 comparable 查询    [Sprint 8]     │
│  + 持续扩展                                                     │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌─ L0 Infrastructure ────────────┴────────────────────────────────┐
│  Supabase           Postgres + Auth + Storage + RLS             │
│  Cloudflare Pages   Edge runtime + Pages Functions              │
│  Anthropic API      Sonnet 4.6（推理）+ Haiku 4.5（高频）        │
│  Stripe             订阅 + 计费                                 │
│  Resend             事务邮件                                    │
│  GitHub Actions     月度 corp registry 刷新                     │
└─────────────────────────────────────────────────────────────────┘
```

## 跨层规则

### 严格自上而下
| 调用方向 | 是否允许 |
|---|---|
| L3 → L2 | ✅ 唯一推荐路径 |
| L3 → L1 | ⚠️ 经典模式可用（`/screen` 直接调工具）但新功能不推荐 |
| L3 → L0 | ✅ 直接读 Supabase（前端 RLS' supabase client） |
| L2 → L1 | ✅ Agent 调工具，主流程 |
| L2 → L2 | ⚠️ 一个 agent 把另一个 agent 当工具调（最小化使用） |
| L2 → L0 | ✅ Agent 写 conversations / messages / user_facts |
| L1 → L0 | ✅ 工具读写自己的数据 |
| L1 → L1 | ✅ 工具内部组合其他工具 |
| L1 → L2 | ❌ 禁止 |
| L0 → L1 / L2 / L3 | ❌ 禁止 |

### 关键约束
- **Hard gates 永远在 L1 工具内决定**，不让 agent 推理决定。SIN Luhn、BN 校验、income_severe、court_record_defendant 这些都是 deterministic 代码。
- **每次工具调用都写 `tool_executions` 表**，构成审计 trail。PIPEDA + Ontario Human Rights 合规所必需。
- **Agent 的输出永远 cite tool execution id**。critical claim（"此人有 LTB eviction"）必须能 trace 回具体工具执行结果。
- **L3 不直接渲染 L1 输出**。所有数据展示组件由 L2 agent 决定渲染哪个 block，L3 只负责按 block kind 渲染。

## 信任边界

- **租客数据** 只能被对应房东 / 租客本人看到（Supabase RLS 强制）
- **AI 决策** 全部可追溯（tool_executions + messages 表）
- **mutation 类操作** 必须经 user 批准（pending_actions 表 + 显式 UI confirmation）
- **跨用户聚合** 只允许匿名化数据（"本街区 50% 租客年收入 $60k+" 类型）

## Tech Stack

| 层 | 选择 | 原因 |
|---|---|---|
| Frontend | Next.js 14 App Router + React 18 + TypeScript | Cloudflare Pages 原生支持 |
| Styling | Inline styles + Tailwind 基础工具类 | 避免 Tailwind compiler 依赖 |
| AI SDK | `@anthropic-ai/sdk`（直接调 Messages API）| 见 [ADR-002](./adr/002-custom-agent-loop.md) |
| Schema | Zod + `zod-to-json-schema` | 类型安全 + 给 Sonnet 的 tool schema |
| Runtime | Cloudflare Pages Functions（edge）| 全球低延迟 + 0 cold start |
| DB | Supabase Postgres + RLS | 已有，扩展性够 |
| Storage | Supabase Storage | 文件 + signed URL |

## 演进路径

| Sprint | 周次 | 主要交付 |
|---|---|---|
| S1 | 1-2 | L1 工具注册 + 把现有 9 个能力包成 tool（forensics / court / registry / BN / ID / score / classify） |
| S2 | 3 | L2 Logic agent backend：agentic loop、conversations / messages / user_facts schema、SSE streaming |
| S3 | 4-5 | L3 `/chat` 前端 + 5 个 block 组件（text / screening_card / document_viewer / action_proposal / files_upload） |
| S4-5 | 6-9 | Nova agent + listing import 工具 + 经纪 onboarding |
| S6-7 | 10-13 | Echo agent + 租客 chat UI + Verified Renter Passport |
| S8 | 14-15 | Analyst agent + Stayloop Index + 市场数据工具 |
| S9-10 | 16-19 | Pipeline 视图 + 经纪 SaaS（multi-listing） |
| S11+ | 20+ | Mediator + Trust API 内部稳定 + 评估对外开放窗口 |

详细见 [ADR-005](./adr/005-defer-trust-api.md) — 为什么 Trust API 暂不对外开放。

## 相关文档

- 数据模型：[`data-model.md`](./data-model.md)
- 详细 pitch 版：[`architecture-detailed.md`](./architecture-detailed.md)
- 关键决定：[`adr/`](./adr/)
- Agent 规格：[`agents/`](./agents/)
- 流程图：[`flows/`](./flows/)
