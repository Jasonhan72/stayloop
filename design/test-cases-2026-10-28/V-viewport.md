# V · 视口与双语（T6 子集）· 2026-10-28（测试员 ②）

对象：10-27「手机与平板适配检查」上线的页面 + 本组公开页。375×812（手机，isMobile + touch）与 768×1024（平板）；zh；playwright 无头系统 Chrome。
判据：`document.documentElement.scrollWidth − innerWidth ≤ 0`；另记录「最右元素超出视口」（`widest`，用来区分横滑行 / 表格滚动容器与真溢出）、`h1` 数、< 16px 的文本控件数、控制台 error（排除资源加载类）。
脚本：匿名 `anon.mjs vp` → `anon-ai_vp.json.vp`；landlord-test `landlord.mjs` / `landlord2.mjs` / `landlord3.mjs` → `landlord.json.vp` `landlord2.json.hub`；截图 `shots/v-*.png`。
双语比对见 `O-legal.md` O-10（5 页 en / zh）。

## 用例

| ID | 路由 | 宽 | 期望 |
|---|---|---|---|
| V-01 | `/` | 375 | 溢出 0；四身份面板为横滑行（`home-role-*` 超出视口但容器可滑） |
| V-02 | `/` | 768 | 溢出 0 |
| V-03 | `/listings` | 375 | 溢出 0；单列卡片；「地图」浮动按钮；工具栏折行 |
| V-04 | `/listings` | 768 | 溢出 0；两列卡片 |
| V-05 | `/tools` | 375 | 溢出 0；三张表纵排；输入 ≥ 16px |
| V-06 | `/tools` | 768 | 溢出 0 |
| V-07 | `/rules` | 375 | 溢出 0 |
| V-08 | `/rules` | 768 | 溢出 0 |
| V-09 | `/agents` | 375 | 溢出 0；信号行不撑宽 |
| V-10 | `/agents` | 768 | 溢出 0 |
| V-11 | `/consumer-rights` | 375 / 768 | 溢出 0 |
| V-12 | `/listings/test-77-…` | 375 / 768 | 溢出 0；标题行分享 / 收藏换行 |
| V-13 | `/dashboard`（landlord-test） | 375 | 溢出 0；列表视图里状态 / 操作区整行落到缩略图行下、地址不截断（10-27 修）；MLS® / 分享包胶囊单行、只在胶囊间换行；分享包面板 ≤ 视口、「关闭」不被挤折；申请表在 `overflow-x-auto` 内 |
| V-14 | `/dashboard` | 768 | 溢出 0；卡片两列 |
| V-15 | `/h/1c9abb72-…`「入住 / 退租状态照片」 | 375 | 展开后 `condition-stacked` 可见、表格隐藏；每项一块，入住在上退租在下；溢出 0 |
| V-16 | `/h/1c9abb72-…` | 768 / 1280 | 展开后表格可见、`condition-stacked` 隐藏；溢出 0 |

## 执行记录

| ID | sw / iw | widest（超出视口的最右元素） | h1 | <16px 控件 | 控制台 | 截图 | 结果 |
|---|---|---|---|---|---|---|---|
| V-01 | 375 / 375 | `section[data-testid=home-role-provider]` right 1280（横滑 snap 行，容器自身可滑，文档不溢出） | 1 | 0 | 0 | `shots/v-375_.png` | 通过 |
| V-02 | 768 / 768 | — | 1 | 1 | 0 | `shots/v-768_.png` | 通过（B-D2） |
| V-03 | 375 / 375 | — | 1 | 0 | 0 | `shots/v-375_listings.png`（单列卡、「1 / 12」角标、地图浮钮、底部 tab 栏） | 通过 |
| V-04 | 768 / 768 | — | 1 | 2 | 0 | `shots/v-768_listings.png` | 通过（B-D2） |
| V-05 | 375 / 375 | — | 1 | 0 | 0 | `shots/v-375_tools.png` | 通过 |
| V-06 | 768 / 768 | — | 1 | 5 | 0 | `shots/v-768_tools.png` | 通过（B-D2） |
| V-07 | 375 / 375 | — | 1 | 0 | 0 | `shots/v-375_rules.png` | 通过 |
| V-08 | 768 / 768 | — | 1 | 0 | 0 | `shots/v-768_rules.png` | 通过 |
| V-09 | 375 / 375 | — | 1 | 0 | 0 | `shots/v-375_agents.png` | 通过 |
| V-10 | 768 / 768 | — | 1 | 3 | 0 | `shots/v-768_agents.png` | 通过（B-D2） |
| V-11 | 375 / 375；768 / 768 | — | 1 | 0 | 0 | `shots/v-375_consumer-rights.png` `v-768_…` | 通过 |
| V-12 | 375 / 375；768 / 768 | — | 1 | 0 | 0 | `shots/v-375_listings_test-77-….png` `v-768_…` | 通过 |
| V-13 | 375 / 375 | `table.min-w-[680px]`（最新申请表）right 701——在 `overflow-x-auto` 包裹内滚动，文档不溢出 | 1 | — | 0 | `shots/v-375-dashboard-rows.png`（列表视图：缩略图 + 信息列，地址「[TEST] 77 Sitetest Rd, Toronto」完整，「待经纪挂牌」胶囊单行 h21，「让认证经纪帮我挂到 MLS®」h26 单行 w164，「分享包 · 照片」h26）；`v-375-dashboard-cards.png`（卡片 335 宽单列）；`v-375-share-panel.png`（面板宽 375 = 视口，「关闭」44 高、right 351 未被挤折，页签换行，文案区可滚） | 通过 |
| V-14 | 768 / 768 | 同上表格 right 773（容器内滚动） | 1 | — | 0 | `shots/v-768-dashboard-rows.png` `v-768-dashboard-cards.png`（卡片两列 314 宽：right 406 / 740）、`v-768-share-panel.png`（面板 768 宽） | 通过 |
| V-15 | 375 / 375 | — | 1 | — | 0 | `shots/v-375-h-condition-open.png`：点「展开」后 `condition-stacked` 可见、`table` 隐藏；5 个项目块（客厅 / 卧室 / 厨房与电器 / 卫生间 / 已有损耗），每块「入住」缩略图 + 「+ 照片」在上、「退租」在下；区块 left 20 / right 355 | 通过 |
| V-16 | 768 / 768；1280 / 1280 | — | 1 | — | 0 | `shots/v-768-h-condition-open.png` `v-1280-h-condition-open.png`：表格可见（5 行、6 张缩略图、「现在上传的是：入住 / 退租」切换）、`condition-stacked` 隐藏；768 区块宽 728 | 通过 |

汇总：16 条 × 共 30 个（路由 × 宽度）组合，**文档横向溢出 0 / 30**，控制台 error 0 / 30，h1 全部 = 1。375 宽文本控件 < 16px 为 0。

## 缺陷 / 观察
- 无新溢出缺陷。
- B-D2（S3）：768 宽下 `/tools` 5 个、`/agents` 3 个、`/listings` 2 个、`/` 1 个文本控件字号 < 16px（375 为 0）；现有 globals.css 规则只覆盖手机断点。
- `/h/[id]` 的「入住 / 退租状态照片」默认折叠（「展开」按钮），手机上要先点一下才看到竖排——按设计记录。
- 10-27 修的三处（列表视图状态区整行、胶囊 `whitespace-nowrap`、分享包「关闭」`flex-none`）在 375 下都验证到位。

## 数据副作用
无（登录态只读；未上传照片，`/h/` 里 2026-10-28 的入住 / 退租照片是其他组当天上传的）。
