# ADR-005: Defer Trust API public exposure

- **Status**: Accepted
- **Date**: 2026-04-26
- **Author(s)**: Jason Han + Claude

## Context

V3 设计文档提到 "Trust API" 作为 Stripe-style B2B 产品（保险公司、proptech、其他 brokerage 接入 stayloop verification）。
要做成完整的对外 API 需要：开发者门户 / API key 管理 / rate limit / 计费 / webhook / OpenAPI spec / SOC 2 / 客户支持。
保守估计：4-6 周工程 + $20-30k SOC 2 / 法务费用 + 持续维护。
**bootstrap 阶段（首个 12 个月）这些投入回报率太低**：没有外部客户主动询问、内部 stayloop 还未达到稳定规模、产品形态还在快速迭代。

## Decision

**架构上保留 L1 Capability Layer 作为内部工具层，但不对外开放**。

具体落地：
- L1 工具按"未来要开放"的标准设计：JSONSchema、错误码标准化、版本号、纯函数、`tool_executions` 审计表
- 但**不构建**：API key 系统、开发者门户、rate limit middleware、webhook 投递、公开文档站、SOC 2 Type 1
- 工具内部用，调用方仅限 stayloop 自己的 agents（L2）

## Alternatives Considered

### 一开始就做完整 Trust API
- ❌ 4-6 周工程 + 持续维护
- ❌ 没外部客户要接，是 wasted infrastructure
- ❌ 公开 API = 锁定 schema = 失去快速迭代自由

### 完全不规划 Trust API（内部硬编码）
- ❌ 未来开放时需要重写
- ❌ 失去未来 platform play 选项

### Hybrid（部分对外 / case-by-case）
- ⚠️ 这是当前选择的延伸 —— 如果未来某客户主动询价，可以一次性写一个 webhook 给他用，不开公开 API

## Consequences

### 正面
- ✅ 节省 4-6 周初期工程
- ✅ 节省 $20-30k SOC 2 / 法务一次性支出
- ✅ 内部迭代自由（工具签名错了就改，不用维护 backwards compat）
- ✅ 战略选项保留 —— 任何时候按下"开放"按钮，工具层已经 ready

### 负面
- ⚠️ 失去"Trust API as moat"的 fundraising 故事（不打算融资，无关）
- ⚠️ B2B 收入流推迟（Phase 4+）

## Re-evaluation Triggers

满足任一**就开放**：

1. **5+ 个外部公司主动询问集成**（保险、proptech、其他 brokerage）
2. **内部 ARR ≥ $300k**（产品稳定，可以分散精力）
3. **出现 anchor customer** 愿意年付 $20k+ 用 API（值得为他一个客户开 API）

到时再花 4-6 周做：
- API key + OAuth flow
- Rate limit + 计费 meter
- 开发者门户 + Stripe-style 文档
- Webhook 投递
- SOC 2 Type 1（4-6 个月并行跑）
- API 版本 v1 lock
