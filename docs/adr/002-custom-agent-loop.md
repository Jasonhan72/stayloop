# ADR-002: Custom agent loop, not LangChain or Claude Agent SDK

- **Status**: Accepted
- **Date**: 2026-04-26
- **Author(s)**: Jason Han + Claude

## Context

Stayloop V3 计划构建 8+1 agent 架构（Logic / Nova / Echo / Analyst / Mediator 等），需要选择 agent runtime。
约束：

- **Cloudflare Pages Edge runtime** —— bundle 大小敏感（< 1MB 推荐），不能用大量 npm 依赖
- **TypeScript 优先** —— 整个 codebase 是 TS，不想引入 Python 子系统
- **Streaming 是必需** —— 用户体验要求 token-by-token 输出
- **可观测性** —— 每次工具调用必须落地 audit trail（PIPEDA + Ontario Human Rights 合规）
- **成本控制** —— 需要分层调度 Sonnet vs Haiku，简单情况走 Haiku 省钱
- **Agent 复杂度（短期）** —— 单 agent + ~10 工具 + 同步对话流，没有 multi-agent 协作 / 后台长时任务

## Decision

**自己写 agent loop**，约 200 行 TypeScript，直接调用 `@anthropic-ai/sdk` 的 Messages API。

工具用纯 TS 函数 + JSONSchema 定义。`lib/agent/` 目录结构：

```
lib/agent/
  tools/                      # L1 capability — 每个工具独立文件
    classify-files.ts
    run-forensics.ts
    search-canlii.ts
    ...
  agents/                     # L2 agent 定义
    logic.ts                  # system prompt + 工具子集 + 输出 schema
    nova.ts
    ...
  registry.ts                 # 工具注册表
  loop.ts                     # 核心 agentic loop
  memory.ts                   # user_facts 召回 + 累积
  approval.ts                 # pending_actions 管理
```

## Alternatives Considered

### LangChain / LangGraph
- ❌ Python 为主（JS 版本 lag），CommonJS 依赖在 Cloudflare Edge 跑不动
- ❌ 抽象层重，简单 agent loop 也要拖一堆概念（Chains、Runnables、Memory）
- ❌ 当 stayloop 只有 1-2 个 agent 时是过度工程

### Claude Agent SDK
- ⚠️ 官方支持、TypeScript 友好，是合理选项
- ⚠️ 但仍是封装层，遮蔽了 streaming / token usage / error handling 的细节
- ⚠️ Edge runtime 兼容性需要额外验证
- 目前规模下，自己写 ~200 行控制力更高、调试更容易
- **未来 trigger**：当出现 multi-agent 协同、sub-agent 调用链时重新评估

### OpenAI Assistants API / Swarm
- ❌ 切换模型 provider 成本高（已经在 Claude 上调好了 prompt + 双语质量）
- ❌ Assistants API 有自己的 thread / run 概念，和我们的 conversations / messages 表 redundant
- 见 ADR-001 关于 Claude vs OpenAI 的详细论证

### Vercel AI SDK
- ⚠️ React-friendly，streaming 工具不错
- ⚠️ 但本质也是封装层，不需要为这层额外抽象付出依赖代价
- 后期前端 streaming UI 可以借鉴它的 hooks，但不全量引入

## Consequences

### 正面
- ✅ Bundle 小（核心 agent 代码 + Anthropic SDK 加起来 < 100KB gzipped）
- ✅ 控制粒度细：每次工具调用、每次 streaming chunk、每次 token usage 我们都看得到
- ✅ 调试简单：没有黑盒，所有逻辑在我们代码里
- ✅ Edge runtime 完美兼容
- ✅ 工具协议设计可以**故意 MCP-ready**（接口对齐 MCP 的 tool 定义形态），未来要变 MCP server 套层 adapter 即可

### 负面
- ⚠️ 我们维护 agentic loop 的实现细节（重试、错误处理、tool result 序列化等）
- ⚠️ 没有现成的 multi-agent orchestration 模式（如 LangGraph 的 graph）
- ⚠️ 如果 Anthropic SDK 升级有 breaking change 要自己处理

### 风险
- 短期风险低 —— 单 agent 场景下"自己写"是最干净的
- 中期风险：当 agent 数量 > 5、需要 inter-agent communication 时，可能需要重构
- 长期：MCP 标准如果广泛普及，迁移到 MCP server 模式可能是必然

## Re-evaluation Triggers

应该重新评估这个决定的情形：

1. **Agent 数量超过 5 + 需要 multi-agent 协同**（比如 Logic 调用 Analyst 的市场数据 + Nova 的房源生成同时进行，且需要协调状态）
2. **后台长时任务**（比如 Mediator 跑 14 天调解流程，需要 checkpoint / resume / 中途状态恢复）
3. **第三方开发者要接入 stayloop 工具**（这时 MCP 标准的好处变明显）
4. **Anthropic 推出官方 multi-agent 框架**且广泛社区采用
5. **维护成本超过收益** —— 如果发现自己重复实现 framework 已有功能（比如 retries、circuit breakers、structured output validation）

满足任一条件时，重新评估并写 ADR-NNN 推翻或修订本 ADR。
