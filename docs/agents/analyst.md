# Analyst Agent

> **市场数据 + Stayloop Index agent**。Sprint 8 上线。提供租金市场对比、街区热度、最佳挂牌价位建议。

## 职责（Sprint 8 范围）

- Stayloop Index：基于 stayloop 平台数据 + Realtor.ca 公开 listing 计算街区中位租金
- Comparable analysis：给定 listing → 找 5-10 个相似 comp + 价格分布
- 三档价格建议（safer / pick / slow rent）配预期出租周期
- Portfolio analytics（Sprint 11+）：房东 6+ 房源的 cash flow 分析

## 不属于 Analyst

- 房客评估 → Logic
- listing 创作 → Nova
- 实际定价决定 —— Analyst 只提议，房东 / 经纪决定

## 待 Sprint 8 完成

- [ ] System prompt
- [ ] `market_data` / `comparable_analysis` 工具
- [ ] Stayloop Index 计算逻辑（数据点 > 100 的街区才发布）
- [ ] price_band block 渲染
