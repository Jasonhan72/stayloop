# Stayloop 设计稿来源 (Source of Truth)

**设计板 URL:** https://claude.ai/design/p/5d9f2e49-5a3a-431a-afd6-dd03437caf46?file=V5.3/v53-handbook-complete-zh.html

这是全站界面的权威设计稿(Claude 设计板 / artifact),标题「设计参考 · 全部界面,已内嵌」。

## 结构
- 单一打包文件:`v53-handbook-complete-zh.html`(内嵌全部 VOL)
- 分卷:**VOL 1–8 + 系统架构**
  - VOL 1 — 入口 · 广度测试 · 三个 AI(「每个角色,都有自己的 Agent」)
    - 三个 AI 助手角色:**Luna**(Tenant/租客)、**Logic**(Landlord/房东)、**Brief**(Agent/经纪)
  - VOL 2–8 — 各模块界面(房源 / 租客 / 房东 / 经纪 / 定价 / 等)
- 另有分卷源文件:`v53-vol1.html` … `v53-vol8.html`、`v53-vol3.html`(定价卷)

## 对齐范围
对齐生产环境(stayloop.ai)到此设计稿,**screening 模块除外**(已单独深度迭代)。
非 screening 生产页面 ~40 个,见 `app/**/page.tsx`。

## 待办
- [ ] 获取设计稿 HTML(导出 VOL 文件到本仓库,或逐卷截图)以便精确对比
- [ ] 逐模块对比生产 vs 设计,列差异清单
- [ ] 按设计稿修正生产页面
