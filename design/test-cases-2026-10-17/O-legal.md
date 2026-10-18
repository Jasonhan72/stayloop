# O · 法律与合规页 · 2026-10-17

风险等级 R3（页面）但内容属 T7 合规；需求来源：CLAUDE.md「消费者报告法：站上不再声明」「V0.8 第一项」（`/consumer-rights`）「V1.0 阶段 5」（条款第 7 节 API 七条）
「PropTx Article 8 逐条复核 · 第二轮」（运营主体 Stayloop Inc.、密码 90 天、隐私 3b）「PropTx 拒绝」（条款第 1 条 TRREB 删除 → 房源信息使用规则 **8 条**；任务简报写 9 条为 10-11 旧值）
「消息与沟通系统重设计 A 期」（隐私 3a）「Terminology」（背调禁语）。
执行：curl 抓 zh SSR HTML；无头 Chrome 渲染 en；grep；与源码常量比对（`lib/legal/terms.ts`）。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| O-01 | R3/T7 | 匿名 | `/terms` 七节标题 | 1 接受条款 · 2 你的承诺 · 3 服务变更 · 4 责任限制 · 5 房源信息的使用 · 6 适用法律 · 7 API 使用规则；运营主体「Stayloop Inc.」；无「Stayloop Technologies」 | `trrebReady` `v1stage5_docsTerms` |
| O-02 | R3/T7 | 匿名 | 第 5 节条数 | 渲染条数 = `LISTING_DATA_CLAUSES.length` = 8；首条不再是「TRREB 会员经纪客户关系」；含个人非商业 / 真实意向 / 不复制转发 / 不接 AI 与自动化（Stayloop 自己的除外）/ 禁抓取 / 所有权版权 / 授权核查 / 不产生费用不构成代理（不构成代表协议） | `realtorReadsOff` |
| O-03 | R3/T7 | 匿名 | 第 7 节条数与内容 | 7 条 = `API_CLAUSES`：许可范围 / 署名（CMHC · 统计局）/ 个人信息 / 禁止（含人权法典受保护特征）/ 筛查注册前不提供 / 可用性无 SLA · 日期版本 · 弃用 90 天 / 责任；zh 与 en 各 7 条 | `v1stage5_docsTerms` |
| O-04 | R3/T7 | 匿名 | `/privacy` 节 | 1 收集 · 2 怎么用（AI 服务商：Anthropic / OpenAI / Google 美国、DashScope 中国大陆 OCR 回退、Jina）· 3 控制权 · 3a 消息与沟通记录（只追加、保留 7 年、注销后对话记录保留、邮件中转）· 3b 房源数据与合规审计（姓名/邮箱/登录记录 ≥180 天、密码 90 天、同意记录与活动可能提供给协会）· 4 数据存储（蒙特利尔 ca-central-1）· 5 联系 privacy@stayloop.ai | — |
| O-05 | R3/T7 | 匿名 | `/consumer-rights` | h1「你对自己筛查档案的权利」；三节 s.12 索取 / s.13 争议更正 / s.12.1 身份警示；时限一览四条（即时 / 2 个工作日 s.12(8)；60 天通知；6 年；s.10(7) 60 天）；不收费 s.12(13)；「索取我的档案 →」链到 `/my-file`；公开记录处理说明 | `v08_consumer*` |
| O-06 | R3/T7 | 匿名 | 禁语 grep（全部公开页 HTML，zh + en） | `craWording` BANNED 六条零命中；验证一次 / 处处通行 / Verify once；六维 / six-dimension；背调 / 背景调查 / 背景核查 / 背景审查；实时挂牌；Realtor.ca 实时 / live from Realtor.ca / TRREB 官方 / TRREB 成交 / TRREB 会员经纪；「Stayloop 不是…报告机构」 | `craWording` `complianceCopy` `honestPassport` `honestPlans` `realtorCopy` `rentBenchmark` |
| O-07 | R3/T7 | 匿名 | `/rules` | 安省规则按 area 分组，含「租期中 · 2026 年新规」与「维修与进入」；指导比例文字 2026 2.1% / 2027 1.9%；每条编号可锚（`#RTA-106-deposit-cap`） | `ontarioRules2026` |
| O-08 | R3/T7 | 匿名 | 法律页三处交叉链接 | `/terms` ↔ `/privacy` 互链；`/consumer-rights` → `/privacy` 与 `/my-file`；页脚含 隐私 / 条款 / 消费者权利（若未列，记录）| — |
| O-09 | R3/T7 | 匿名 | `/terms` `/privacy` `/consumer-rights` `/rules` 在 320 / 390 / 768 / 1024 / 1440 × zh / en | 同 B-T6（溢出 0、单 h1、控制台无错） | — |

## 执行记录

（执行后填写）

### 执行记录（2026-10-17 晚，生产；curl 抓 zh SSR HTML 存 scratchpad `sitetest1017/B/html/`，分析脚本 `ssrcheck.mjs` 等）

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| O-01 | `/terms` h1「服务条款」；h2 七节 1 接受条款 · 2 你的承诺 · 3 服务变更 · 4 责任限制 · 5 房源信息的使用 · 6 适用法律 · 7 API 使用规则；正文含「Stayloop Inc.」，无「Technologies」 | html/terms.html；node 解析 h2 列表 | 通过 | — |
| O-02 | 第 5 节 `<li>` = 8 = `LISTING_DATA_CLAUSES.length`（任务简报写 9 条为 10-11 旧值，10-13 删了 TRREB 会员条）；首条「房源信息仅供你本人、非商业用途…」；节内无 TRREB / 会员经纪 | 同上 | 通过 | — |
| O-03 | 第 7 节 `<li>` = 7 = `API_CLAUSES.length`；许可范围 / 署名（CMHC）/ 个人信息 / 禁止（受保护特征）/ 筛查 / 可用性（SLA · x-api-version · 90 天）/ 责任 全部命中；英文版在浏览器核对（见 B-public 执行记录 EN 段） | 同上 | 通过 | — |
| O-04 | `/privacy` h2：1 收集 · 2 怎么用 · 3 控制权 · 3a 消息与沟通记录 · 3b 房源数据与合规审计 · 4 数据存储 · 5 联系；2 节含 Anthropic / OpenAI / Google / DashScope / Jina；3a 含「只能追加…包括 Stayloop 后台」「保留 7 年」「注销…对话记录保留」「经 Stayloop 转发」；3b 含 180 天 / 90 天 / 协会；4 含蒙特利尔 ca-central；**5 联系只写「联系页面或 in-app 聊天，30 天内回复」，页面无 privacy@stayloop.ai**（通知信与消费者权利页都以 privacy@ 为争议 / 查阅通道，隐私页本身没有列出这个邮箱） | html/privacy.html | 通过（1 条 S3 观察） | O-D1 |
| O-05 | h1「你对自己筛查档案的权利」；h2 三节 s.12 / s.13 / s.12.1 + 「我们怎么处理公开记录」「时限一览」「联系」；s.12(13) 不收费、2 个工作日 s.12(8)、60 天、6 年、s.10(7) 全部在；链接含 `/my-file` `/privacy` `/terms` `/screening` | html/consumer-rights.html | 通过 | — |
| O-06 | 21 个公开页 zh SSR 文本对 craWording BANNED 六条、验证一次 / 处处通行、六维、背调四词、实时挂牌 / Realtor.ca 实时 / TRREB 官方·成交·会员经纪·行情·均租、助手 / 管家、测试期 / 10 月 14 日 / 限时免费 全部 0 命中（`/disputes` 的「T6 维修义务申请」被 `6 ?维` 正则误报一次，是表格名，非「六维」）。`/screening` 含「Stayloop 不直连征信局」= 事实陈述（09-04 决定保留），不在禁语内 | `ssrcheck.mjs` 输出 | 通过 | — |
| O-07 | `/rules` h1「每一条规则都有编号、法条和落点。」；含「2026 年新规」「维修与进入」「2.1%…1.9%」；30 条规则 id 全部有锚点（含 `OREG516-17-key-deposit` `OREG9-18-standard-lease`） | html/rules.html | 通过 | — |
| O-08 | `/terms` ↔ `/privacy` 互链在；`/consumer-rights` → `/privacy` `/my-file` 在；隐私页 → `/consumer-rights`（「你的权利」）在；**页脚「公司」列只有 关于 / 隐私 / 使用条款 / 联系，没有「消费者权利」入口**——`/consumer-rights` 只能从隐私页第 3 节、`/my-file`、通知信到达 | html/home.html footer hrefs | 通过（1 条 S3 观察） | O-D2 |
| O-09 | 见 B-public 执行记录 T6 矩阵（四个法律页 × 5 宽 × 2 语） | matrix-results.json | 见 B | — |

### 缺陷 / 观察

| 编号 | 严重度 | 优先级 | 一句话 | 复现 |
|---|---|---|---|---|
| O-D1 | S3 | P3 | `/privacy` 第 5 节「联系」没有列出 privacy@stayloop.ai，而通知信、消费者权利页、CLAUDE.md 都把它当作查阅 / 争议 / 删除请求通道 | `curl -s https://www.stayloop.ai/privacy \| grep -c 'privacy@'` → 0 |
| O-D2 | S3 | P3 | 页脚没有「消费者权利」链接，`/consumer-rights` 从公开导航不可达（只在隐私页正文与 `/my-file`） | 任一公开页页脚 href 列表不含 `/consumer-rights` |

### 数据副作用
无（全部只读）。
