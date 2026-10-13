# 房东首发 + 向外同步 + 经纪挂 MLS（V0.8 第二项 · 方案 · 2026-10-13）

目标：Stayloop 成为房东发布房源的第一站（数据是自己的，AI 随便用），再把房源送到租客在的地方；想上 MLS 的房东在站内找认证经纪挂牌。
MLS 数据永远不回流进 Stayloop（PropTx 规则），只记「经纪 X 已挂牌 · 链接」。

## 一、极简发布（AI 代填）
- 一屏：地址（自动补全 + 省份识别）· 月租 · 照片（拖进来）。其余由 AI 从照片与地址推：户型、面积估计（标「估」）、家具、设施、楼层、交通（已有 enrich）；
  用现有引导卡一次问完缺项（宠物 / 吸烟 / 租期 / 租金包含 / 入住日 / 押金）。
- 规则不变：AI 不编事实（`sanitizeDraftListing`）、无照片不上线、发布前合规检查（`checkListingCompliance`）、管理员核验后公开。
- 文案由 `draftListingCopy` 生成中英两段，房东逐字可改。

## 二、向外同步（渠道与可行性）
| 渠道 | 官方途径 | 自动化 | 备注 |
|---|---|---|---|
| Stayloop 自己的 Facebook Page | Meta Graph API（Pages） | 可以：每套房源一条帖子（照片 + 要点 + 链接回 Stayloop） | 需 Meta Business 账号、Page、App 审核（pages_manage_posts） |
| Stayloop 自己的 Instagram 业务号 | Instagram Content Publishing API | 可以：图文帖 + 链接在简介 / 评论 | 需 IG 业务号绑定 Page，App 审核（instagram_content_publish） |
| Facebook Marketplace | 只对 Meta 的 Marketplace 合作方开放（加拿大租赁由 Zumper 做） | 不能直接；走 Rentsync → Zumper | 官方说明：房东要上 Marketplace 须经 Apartment List / Zumper |
| Facebook Groups（华人租房群） | Groups API 2024 已停 | 不能自动 | 只能给房东一键复制文案 + 图片包 |
| Kijiji | Professional Subscription 的 XML feed（按量计费） | 可以，但要开通专业账户并拿到 XML 规格 | 自动化只能走他们的 feed，不能脚本发帖（违反条款） |
| Rentals.ca 网络 / Zumper | Rentsync 的数据文件或 API | 可以，待回信 | 一次接入覆盖 Rentals.ca、Rentfaster、TorontoRentals、Zumper |
| 微信公众号 / 小红书 | 无 API | 不能自动 | 给房东「复制文案 + 下载图片包」，运营手动发 |

所以「矩阵」= 两条自动线（Meta Page + IG；Rentsync/Kijiji feed）+ 一条人工线（微信 / 小红书 / 群：一键生成文案与图片包）。
每条对外帖子都链接回 Stayloop 的房源页：看房、提问、申请仍在站内（消息中转、申请追踪、筛查）。

- **数据**：`listing_syndications(listing_id, channel, status, external_url, external_id, posted_at, last_synced_at, error)`；房东在发布时勾选渠道（同意 Stayloop 以自己的账号代发，条款加一条授权）；
  房源改价 / 下架 → 同步更新或删帖；每条帖子的文案由规则引擎过合规（OHRC / RTA）后才发。
- **界面**：房东房源管理页每套房源一行渠道状态（已发 · 链接 / 待发 / 失败 / 不支持），「复制文案 + 下载图片包」按钮。

## 三、找经纪挂到 MLS
- 房源页（房东视角）「让认证经纪帮我挂到 MLS」→ `AgentPicker`（已有）→ 建 `agent_clients` 行 + 工单对话（已有的 `agent_client` 线程）→ 经纪在自己的经纪公司系统挂牌 →
  回填「已挂牌 · MLS 号 · Realtor.ca 链接」（只存链接与编号，不拉数据）。
- 房源页显示「同时挂牌于 MLS（经纪 X）· 在 Realtor.ca 查看 ↗」。
- Stayloop 不收费、不派单、不参与交易（09-13 决定不变）。

## 顺序
1. Rentsync 询问邮件（用户发）。
2. 极简发布（无外部依赖）。
3. 经纪挂 MLS 交接（无外部依赖，复用客户表与对话）。
4. 同步记录 + 人工线（文案 / 图片包）。
5. Meta Page + IG 自动发（需用户建 Meta Business 账号与 Page / IG 业务号，App 审核约 1–3 周）。
6. Kijiji 专业账户 feed / Rentsync 接入（等回信与账户）。
