# Mediator Agent

> **纠纷调解 + 申诉 agent**。Sprint 10+ 上线。处理租客对 stayloop 报告的申诉、双方对 lease 条款的分歧、押金退还纠纷。

## 职责（Sprint 10+ 范围）

- 租客申诉 stayloop 报告中的某项 flag
- 租客 / 房东对 lease 条款解释分歧
- 押金退还争议（结合 14k+ LTB rulings 训练）
- 14 天 SLA 提议解决方案

## 关键合规属性

- Mediator 是 stayloop 合规的**核心**：PIPEDA + Ontario Human Rights 要求租客有 challengeable 申诉机制
- Mediator 输出**只是建议**，没有法律约束力 —— 双方仍可走 LTB
- 所有对话录入 audit trail（特别敏感）

## 不属于 Mediator

- 实际诉讼代理 → 律师（stayloop 不持牌）
- 法律咨询 → 必要时引导到合作律师

## 待 Sprint 10+ 完成

- 长时间任务支持（14 天对话）—— 可能触发 ADR-002 重新评估
- LTB rulings dataset ingestion + RAG
