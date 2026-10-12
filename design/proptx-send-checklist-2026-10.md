# 发给 PropTx 之前要准备的东西（2026-10-11）

## 1. 先弄清流程（已核实）
- PropTx 的 IDX / VOW 许可**不是邮件申请**：由 TRREB 会员经纪登录 **PropTx Data Syndication and Agreement System**（https://syndication.ampre.ca/sso/start）→「New Agreement」→
  每种数据各一份协议（IDX = 公开展示在售/在租挂牌；VOW = 注册用户可看的增强数据，含历史与成交；DLA = 后台 / CRM 用途）→ 选「My vendor is not in this list」→ 填 Stayloop Inc. 的公司信息。
- 然后 Stayloop 会收到 PropTx 的**自动验证邮件**，要说明用途、签供应商协议；会员签自己那份；经纪公司（Broker of Record）一并批准。PropTx 逐个审核，不保证通过。
- 供应商名下必须**始终至少有一个活跃客户**，否则数据接口会被停；每种数据类型要各自的协议。第三方指南另说「一个网址只能绑一个供应商」，发邮件时顺便确认。
- 联系人：PropTx Data Administrator，dataagreements@proptx.ca，416-443-8131。
- 邮件的作用：先把四个问题问清、让对方认识我们；发完请会员去门户发起。

## 2. 邮件里要你填的
- 发起接入的会员经纪：Sheng Chu（个人公司 Sheng Chu Realty Inc.，挂靠经纪公司 JDL Realty Inc.；416-786-2018，chu-sheng@hotmail.com）；RECO 注册号 9565987；最好先跟 JDL Realty 的 Broker of Record 打招呼（他们要签字）。
- 署名 Jason Han, Founder, Stayloop Inc. · 647-862-6518 · jasonhan72@gmail.com（已填）。
- 草稿：`design/proptx-inquiry-email-2026-10.md`（英文正文已按今天的站点状态改好）。

## 3. 门户申请时 Stayloop Inc. 要提供的（会员填或你提供给会员）
- 公司法定名 Stayloop Inc.、注册号（联邦 / 安省）、注册地址、网站 www.stayloop.ai、联系人与邮箱。
- 用途说明（一段话）：安省住宅租赁平台；公开页按 IDX 展示在租挂牌（卡片字段）；登录用户按 VOW 规则浏览完整信息与历史；只用于运营会员的 VOW / IDX，不训练模型、不转售。
- VOW 网址：https://www.stayloop.ai（会员另需在系统里报备 VOW 网址，Member VOW Website Information Form）。
- 审核用账号已建：`proptx-review@stayloop.ai`（租客身份，消费者视角；首次登录会看到条款同意弹层）。密码在本机 `.forensics-tmp/proptx-reviewer-account.txt`（不进 git）；需要时连同几张截图（房源列表、详情页、条款第 5 节、隐私 3b）一起提供给 PropTx。

## 4. 发送前的核对（都已在线上）
- /terms 第 5 节九条规则、注册勾选、登录后一次确认、确认邮件、90 天密码。
- 每张卡 / 详情页的挂牌经纪公司；页脚「被认为可靠但不保证」+ 版权 + 更正通道（hello@stayloop.ai，48 小时）。
- 来源分组与筛选；每次 ≤100 套；匿名不能直读数据库；卖方展示指令与 24 小时时效的列已就位。
- 发起会员的联系卡位（8.12）：协议签妥、feed 接入时把 `NEXT_PUBLIC_MLS_SPONSOR_NAME=Sheng Chu`、`NEXT_PUBLIC_MLS_SPONSOR_BROKERAGE=JDL Realty Inc.`、`NEXT_PUBLIC_MLS_SPONSOR_PHONE=416-786-2018`、`NEXT_PUBLIC_MLS_SPONSOR_EMAIL=chu-sheng@hotmail.com` 填进 CF Pages 环境变量（构建内联，须重新部署），卡片即显示。现在先不挂——协议未签前页面上不该出现「发起会员」。
- Supabase 后台两项（你来做）：注册验证邮件模板加一句「注册即同意服务条款」；`password_min_length` 改 8。

## 5. 收到回复后
- 按答复调整：AI 助理的用途边界、翻译的默认展示方式、混合来源的具体要求、联系路径。
- 会员在门户发起 IDX + VOW 两份协议，把 Stayloop Inc. 填为新供应商；我们回复验证邮件、签协议。
- 拿到 RESO Web API 凭证后：字段映射（InternetEntireListingDisplayYN / InternetAddressDisplayYN / AVM 相关 → `display_internet / display_address / display_avm`）、
  每次刷新盖 `feed_updated_at`、24 小时刷新任务、ListAgentFullName 回填经纪姓名、过期 / 撤牌自动下架。
