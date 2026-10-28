# O · 法律与合规页 · 2026-10-28（测试员 ②）

R1 全跑（T7 合规面）；基线 `design/test-cases-2026-10-17/O-legal.md` + 10-27「筛查方法论」`/consumer-rights#method`。
环境：生产，curl zh SSR（`html/`）+ playwright 无头 Chrome 1280（`extra.mjs` → `extra.json`，`anon.mjs en` → `anon-agents_listings_en.json.en`）。

## 用例

| ID | 风险 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|
| O-01 `/terms` 节 | R1 | h2 七节；运营主体 | 1 接受条款 … 7 API 使用规则；Stayloop Inc.；无 Technologies | `trrebReady` `v1stage5_docsTerms` |
| O-02 第 5 节 | R1 | li 数与内容 | 8 条 = `LISTING_DATA_CLAUSES`；首条「仅供你本人、非商业用途」；无 TRREB | `realtorReadsOff` |
| O-03 第 7 节 | R1 | li 数与内容 | 7 条：许可范围 / 署名 CMHC · 统计局 / 个人信息 / 禁止（受保护特征）/ 筛查注册前不提供 / 可用性无 SLA · x-api-version · 90 天 / 责任 | `v1stage5_docsTerms` |
| O-04 `/privacy` | R1 | h2 与关键句 | 1 · 2（Anthropic / OpenAI / Google / DashScope / Jina）· 3 · 3a（只追加、7 年）· 3b（180 天、90 天、协会）· 4（蒙特利尔）· 5 联系含 privacy@stayloop.ai（上轮 O-D1） | — |
| O-05 `/consumer-rights` | R1 | 三节 + 时限 + 入口 | s.12 / s.13 / s.12.1；2 个工作日、60 天、6 年、s.10(7)；不收费 s.12(13)；`/my-file` 链接 | `v08_consumer*` |
| O-06 `#method` | R1 | 第 4 节内容 | 四项计分（付款能力 / 信用 / 租务与司法历史 / 核验）+ 完整度不计分；不设比例 / 信用分截止线；没有记录按「未知」；受保护特征不进评分与理由；同名规则；「已出判令」；决定由人做并记审计；锚点可直达 | `batch2Round2_20261027` |
| O-07 `/disputes` | R1 | 示范数据标签 | hero 醒目「示范数据」+ 每个虚构块都有标签；真实求助去处 LTB / LSO；无「六维」 | `disputesSample` |
| O-08 `/my-file` 入口 | R1 | 匿名打开 | 邮箱 → 发送确认邮件；三类请求（索取 / 争议 / 身份警示）说明；不收费；链回 `/consumer-rights` | `v08_consumer*` |
| O-09 禁语 | R1 | 25 页 zh SSR + 5 页 en DOM | 背调 / 法律协助 / 助手 / 验证一次，处处通行 / 六维 / 不是报告机构 / 实时挂牌 / TRREB 官方·成交 / 测试期 0 命中 | `complianceCopy` `craWording` `assistantNaming20260928` |
| O-10 双语 | R1 | `/tools` `/rules` `/consumer-rights` `/agents` `/privacy` en vs zh | en 界面 `main` 零中文；zh 界面除专名 / 法条号外无整句英文 | `listingLang20261002` |
| O-11 交叉链接 | R1 | 法律页互链 + 页脚 | `/terms` ↔ `/privacy`；`/consumer-rights` → `/privacy` `/my-file`；页脚含 隐私 / 使用条款 / 消费者权利 | — |
| O-12 视口 | R1 | 法律页 375 / 768 | 溢出 0、单 h1（`/consumer-rights` 在 V 组矩阵；其余 SSR 无宽表） | — |

## 执行记录

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| O-01 | h2：1 · 接受条款 / 2 · 你的承诺 / 3 · 服务变更 / 4 · 责任限制 / 5 · 房源信息的使用 / 6 · 适用法律 / 7 · API 使用规则；`Stayloop Inc.` 在，`Technologies` 无 | `extra.json.terms` | 通过 | — |
| O-02 | 第 5 节 8 条：本人非商业 / 真实意向 / 不复制转发 / 不接 AI 与自动化（Stayloop 自己的除外）/ 禁抓取 / 所有权版权 / 授权核查 / 不产生费用不构成代表协议；全文无 TRREB | 同上 `sec5` | 通过 | — |
| O-03 | 第 7 节 7 条：许可范围（不得转售、不得训练）/ 署名（CMHC、统计局，「非法律意见」）/ 个人信息（当前会话、不持久化）/ 禁止（限流、密钥、冒充、《人权法典》受保护特征）/ 筛查（CRA 注册前不提供）/ 可用性（无 SLA、x-api-version、90 天）/ 责任（12 个月费用上限） | 同上 `sec7` | 通过 | — |
| O-04 | h2 1 · 2 · 3 · 3a · 3b · 4 · 5；2 节 Anthropic / OpenAI / Google / DashScope / Jina 全在；7 年、90 天、蒙特利尔 ca-central 在；**5 · 联系：「查阅、更正、删除个人信息的请求也可以发邮件到 privacy@stayloop.ai。我们 30 天内回复」（上轮 O-D1 已修）** | `extra.json.privacy`、`shots/o-privacy-1280.png` | 通过 | — |
| O-05 | h1「你对自己筛查档案的权利」；h2 1 索取（s.12）/ 2 争议与更正（s.13）/ 3 身份警示（s.12.1）/ 公开记录 / 时限一览 / 联系 / 4 我们怎么评；时限：即时 · 2 个工作日 s.12(8) / 60 天 s.13 / 6 年 s.12.1 / 60 天 s.10(7)；不收费；「索取我的档案 →」「我的筛查档案 →」→ `/my-file` | `ssr.json.consumer` | 通过 | — |
| O-06 | 第 4 节原文：「把四件事分开打分…付款能力（最重）、信用状况、租务与司法历史、核验程度（最轻）。申请材料齐不齐另列一行，不计分。」「不设『租金不超过收入 30%』这类比例截止线，也不设信用分截止线（OHRC 政策、O. Reg. 290/98）」「按『未知』记，不按『差』记」「受保护特征不进评分，也不进理由」「同名的很多，没有地址佐证一律当作同名，目录也没有判决结果，只会写『已出判令』」「决定由房东或经纪本人做，理由要写具体并记入审计」；`/consumer-rights#method` 打开后 scrollY 1304、`#method` top 96（`scroll-mt-24` 生效）；链到 `/rules` 与 `/tools` | `shots/o-consumer-method-1280.png` | 通过 | — |
| O-07 | hero 眉标旁醒目「示范数据」胶囊 + 「本页内容为虚构示范，调解与律师目录尚未上线。遇到真实纠纷，请直接联系 房东与租客委员会 (LTB) 或 安省法律协会 (LSO) 转介服务」；示范指标 / 进行中的案件各带「示范数据」；SSR 文本 11 处「示范数据」；无「六维」（「T6 维修」是表格名） | `shots/o-disputes-1280.png`、`ssr.json.disputes` | 通过 | （O-D1 观察） |
| O-08 | h1「我的筛查档案」；一个邮箱框 `you@example.com` + 「发送确认邮件」；说明含「争议」「身份警示」「不收费 / 免费」；链回 `/consumer-rights`。未真发确认邮件（③ 组 `/api/consumer/request` 预算） | `shots/o-my-file-1280.png` | 通过 | — |
| O-09 | 25 页 zh SSR 全部 0 命中（含 `/screening` `/disputes` `/my-file` `/providers/professional` `/apply/[slug]`）；5 页 en 渲染 DOM 禁语 0 | `ssr.json.banned` | 通过 | — |
| O-10 | en：`/tools` `/rules` `/consumer-rights` `/agents` `/privacy` 的 `main` **零中文行**，`<html lang="en">`，h1「Check the numbers before you write anything.」「Every rule has a number, a statute and a place where it bites.」「Your rights over your screening file」「Find a RECO-registered leasing agent」「How we handle your data」；zh：拉丁串只有法条号（O. Reg. 290/98、Human Rights Code s.2(1)）、官方链接标签（ontario.ca · Residential rent increases、City of Toronto By-law 53-2025）与经纪公司名——都是专名 | `anon-agents_listings_en.json.en`、`shots/en_*.png` | 通过 | （O-D2 观察） |
| O-11 | `/terms` → `/privacy` `/consumer-rights`；`/privacy` → `/consumer-rights` `/my-file` `/terms`；页脚公司列 关于 / 隐私 / 使用条款 / **消费者权利** / 联系（上轮 O-D2 已修） | `ssr.json.terms.links` `privacy.links`、`extra.json.footer` | 通过 | — |
| O-12 | `/consumer-rights` 375 / 768 溢出 0、h1 1、控制台 0 错（V 组）；`/terms` `/privacy` 纯文本页本轮未单独量 | `anon-ai_vp.json.vp` | 通过（部分） | — |

## 缺陷 / 观察

| 编号 | 严重度 | 优先级 | 一句话 | 复现 |
|---|---|---|---|---|
| O-D1 | S3 | P3 | `/disputes` 中文导语夹英文「Stayloop 内部 dispute resolution 是非约束性的」；同页 hero 的「示范数据」胶囊正确 | 中文打开 `/disputes` 看 hero 导语 |
| O-D2 | S3 | P3 | 英文界面下 `/agents` `/privacy` 的 `<title>` 仍是中文（「找经纪 · Stayloop」「隐私政策 · Stayloop」），`/consumer-rights` `/tools` `/rules` 则两种语言都是根默认标题（见 B-D1） | `localStorage.stayloop_lang=en` 打开后读 `document.title` |

## 数据副作用
无（全部只读；`/my-file` 未发确认邮件）。
