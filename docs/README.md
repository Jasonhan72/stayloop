# Stayloop 文档 / Documentation

> 这个目录存放架构、agent 规格、关键流程、技术决定记录。
> 跟代码一起 git 版本管理 —— 改代码时如果触及这里描述的设计，请同步更新。

## 导航

### 架构
- [`architecture.md`](./architecture.md) — L0-L3 分层架构（工程师视角）
- [`architecture-detailed.md`](./architecture-detailed.md) — 详细版（pitch / 投资人视角）
- [`data-model.md`](./data-model.md) — 数据 ERD + schema 解释

### Agents
每个 agent 一份规格：system prompt 大纲 + 可用工具子集 + 输出 schema + 边界规则。

- [`agents/logic.md`](./agents/logic.md) — 房东侧筛查 / 排序（Sprint 1-3 主角）
- [`agents/nova.md`](./agents/nova.md) — Listing 创作（Sprint 4-5）
- [`agents/echo.md`](./agents/echo.md) — 租客 concierge（Sprint 6-7）
- [`agents/analyst.md`](./agents/analyst.md) — 市场数据 / Stayloop Index（Sprint 8）
- [`agents/mediator.md`](./agents/mediator.md) — 纠纷调解（Sprint 10+）

### 关键 flows
端到端用户流程的 sequence + 数据流。

- [`flows/screening.md`](./flows/screening.md) — 房东上传文件 → Logic 完成完整 screening
- [`flows/verified-passport.md`](./flows/verified-passport.md) — 租客创建 Verified Renter Passport
- [`flows/listing-import.md`](./flows/listing-import.md) — 经纪导入 MLS / 房源

### 技术决定记录（ADR）
重要架构决定的"为什么"。每个 ADR 一页，决定时写、不回头改。
反思后觉得错了就写新 ADR 标记 supersedes 旧的。

见 [`adr/README.md`](./adr/README.md)。

## 写文档的规则

1. **代码是 source of truth**。文档解释意图，不重复实现细节。
2. **架构层稳定，模块层飘忽**。重点写架构 + 决定的 why，不要写每个模块的 how。
3. **改代码触及设计时，同 PR 更新文档**。文档与代码绑定 review。
4. **过时不如删除**。宁可删一段错的文档，不要保留误导后人的描述。
5. **中英可混排**。技术名词（API、tool、agent）用英文；概念解释用中文。
