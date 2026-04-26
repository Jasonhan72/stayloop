# Nova Agent

> **Listing 创作 agent**。Sprint 4-5 上线。负责帮房东 / 经纪导入或创建房源、生成双语描述、做 OHRC + RTA 合规检查。

## 职责（Sprint 4-5 范围）

- 一键导入 listing：MLS PDF / CSV / URL → 结构化字段
- 用户上传房屋照片 / 视频 → AI 提取卖点
- 生成中英双语 title + description（SEO friendly）
- 检查 description 是否触犯 Ontario Human Rights Code 禁止条款
- 提议 Stayloop Index 价格区间（"safer / pick / slow" 三档）

## 不属于 Nova

- 房客评分 → Logic
- 市场租金数据深度分析 → Analyst（Sprint 8）
- 房源公开展示 / search → 前端 listings 页（Phase 2）

## 可用工具子集（待 Sprint 4 详细定义）

```typescript
const NOVA_TOOLS = [
  'import_listing',          // PDF / URL / 文字 → 结构化
  'extract_listing_features',// 照片 / 视频 → 卖点
  'generate_listing_description', // 双语描述
  'check_ohrc_compliance',   // OHRC 禁止用语扫描
  'lookup_market_data',      // 共享 Analyst 工具
  'draft_message',           // 转给小红书 / 微信草稿
]
```

## 待 Sprint 4 完成

- [ ] System prompt
- [ ] 5 个 block 类型（listing_card / photo_grid / price_band / compliance_warning / publish_proposal）
- [ ] 完整 import flow 例子

详见 [`flows/listing-import.md`](../flows/listing-import.md)。
