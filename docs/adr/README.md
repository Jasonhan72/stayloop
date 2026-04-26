# Architecture Decision Records (ADR)

> 关键架构决定的记录。每个 ADR 是一份**写完就不改**的快照 —— 反映决策时的认知 + 当时的权衡。
> 后悔了 / 决定改了 → 写新 ADR 标记 `Supersedes: ADR-XXX`，旧的保留作为历史。

## 为什么写 ADR

1. **决策依据可追溯** —— 6 个月后回头看不会忘"当初为什么这么决定"
2. **新人 onboarding 加速** —— 不用反复解释为什么不用 LangChain / 不开放 API
3. **避免无意义反复讨论** —— 已决定的事翻案需要新 ADR 明确推翻
4. **强迫思考权衡** —— 写 ADR 的过程本身就是决策质量的提升

## 写法

每个 ADR 一个 markdown 文件，命名 `NNN-short-slug.md`（NNN 三位序号）。

模板：
```markdown
# ADR-NNN: 标题

- **Status**: Proposed | Accepted | Deprecated | Superseded by ADR-XXX
- **Date**: YYYY-MM-DD
- **Author(s)**: 名字

## Context（背景）
为什么需要做这个决定？什么触发的？什么约束？

## Decision（决定）
我们选择了什么方案。具体方案描述。

## Alternatives Considered（考虑过的备选）
列出至少 2-3 个其他选项，每个写 1-2 句"为什么没选"。

## Consequences（后果）
- 正面：选择带来的好处
- 负面：放弃的东西、新增的债务
- 风险：未来可能后悔的点

## Re-evaluation Triggers（重新评估的触发条件）
什么情况下应该重新讨论这个决定？
```

## 现有 ADR

| # | 标题 | Status | Date |
|---|---|---|---|
| 001 | [Use Claude (Anthropic), not OpenAI](./001-claude-not-openai.md) | Accepted | 2026-04-26 |
| 002 | [Custom agent loop, not LangChain or Claude Agent SDK](./002-custom-agent-loop.md) | Accepted | 2026-04-26 |
| 003 | [Cloudflare Pages edge runtime, not traditional Node server](./003-cloudflare-edge.md) | Accepted | 2026-04-26 |
| 004 | [Local CA federal corp registry, not OpenCorporates](./004-local-corp-registry.md) | Accepted | 2026-04-24 |
| 005 | [Defer Trust API public exposure](./005-defer-trust-api.md) | Accepted | 2026-04-26 |
