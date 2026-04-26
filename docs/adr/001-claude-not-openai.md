# ADR-001: Use Claude (Anthropic), not OpenAI

- **Status**: Accepted
- **Date**: 2026-04-26
- **Author(s)**: Jason Han + Claude

## Context

Stayloop 的核心 AI 能力（文档分类、forensics OCR、scoring、agent 对话）需要选择基础模型 provider。
约束：
- 中英双语处理质量（华人房东市场是核心用户群）
- 长上下文（forensics report + 多文档 OCR + 对话历史会膨胀）
- Function calling / structured output 可靠性
- 成本可控（分层模型策略）
- 加拿大/美国数据驻留（隐私合规）

## Decision

**使用 Anthropic Claude 全家桶**：
- **Sonnet 4.6** —— 主推理 / agent 决策 / scoring
- **Haiku 4.5** —— OCR、文件分类、简单回复（高频低成本）
- **直接 HTTP 调 `api.anthropic.com`**，不通过聚合层

## Alternatives Considered

### OpenAI（GPT-4o / o1 / GPT-4.1）
- ⚠️ 中文质量类似但 stayloop 已经在 Claude 上调好了 prompt
- ⚠️ Function calling JSON 一致性历史上不如 Claude（已有改善但有差距）
- ❌ Anthropic 的 prompt caching 对长 context（forensics + 对话）显著省钱
- ❌ 切换成本：~2 周重新调 prompt + 测试

### Google Gemini
- ⚠️ 价格诱人
- ❌ Tool use 生态相比 Anthropic 弱
- ❌ 加拿大数据驻留情况复杂

### 开源模型自部署（Llama 3.3、Qwen 等）
- ❌ 单人团队没运维带宽
- ❌ 中文 forensics 细节质量未知 / 需要 fine-tune

## Consequences

- ✅ 全 Stack 一个 provider，API 一致
- ✅ Prompt caching 对 stayloop 长 context 场景省 30-50% 成本
- ✅ MCP 生态兼容（Anthropic 推动）
- ⚠️ Vendor lock-in 风险 —— 缓解：所有 prompt 写在 stayloop 代码里，必要时可重新调到其他模型

## Re-evaluation Triggers

- Anthropic 价格上涨 30%+
- OpenAI 出明显更好的双语模型
- 出现 vendor 服务可靠性问题（连续 SLA 违约）
