# B · 公开页与营销（含 T6 视口 × 双语 × 可访问性矩阵）· 2026-10-17

风险等级 R3（营销页与 SEO、定价与文案事实）；T6 矩阵按策略 §3 每次发布抽样，本轮公开路由全量。
需求来源：CLAUDE.md「首页 V0.7」「首页讲一个故事」「首页按 muse.ai / america.gov 实测重排尺寸」「首页登录块换成 America.gov 式对话框」「首页第二屏以后…方案 A」
「手机首页缩短」「平板首页缩短」「首页第二屏陈述句重写」「首页文案保持原样」「全站统一叫 AI 助理 / AI Agent」「V1.0 阶段 5」（定价）「免费模型」「EliseAI 对照研究」（角色页）。
执行环境：生产 `https://www.stayloop.ai`，无头 Chrome（playwright 全局 + 系统 Chrome），curl；脚本与截图在 scratchpad `sitetest1017/B/`。
语言切换：`localStorage.stayloop_lang`（**不是** `sl-lang`——`lib/i18n.tsx:643` 与 `app/layout.tsx:53` 的首屏脚本都读 `stayloop_lang`）。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| B-01 | R3 | 匿名 | 读 `/` 预渲染 HTML + 1440 渲染，按注释锚 / testid 取节顺序 | HERO(`home-hero`) → STATEMENT(`home-statement`) → `#how-it-works`(`home-film`+`home-flow`) → `home-roles`（四面板 tenant/landlord/agent/provider）→ `home-rules` → VERIFY 深色带 → `#faq`(`home-faq`) → START；无 TILES / DEMO / 「一条流程」四卡（10-03 删除） | `homeRoles20260927` `homeV10` |
| B-02 | R3 | 匿名 zh | 首屏 H1 / 导语 / 第二屏陈述句逐字核对 | H1 =「租房的事，交给AI助理」（任何宽度一行）；导语「找房到续约，它去办，你来批准。」；陈述句以「Stayloop 用 AI 把租房的每一步办完：」开头、含「须经你审批」「平台中转」「不可删改」；不含 催收 / 法律协助 / 代收 | `homeStatement20261003` `homeV10` |
| B-03 | R3 | 匿名 | 对话框身份选择器 `home-ask-role` 默认 tenant；切到 landlord | 占位示例只在该身份的示例池内轮换（不再出现「试试（租客）」）；sessionStorage `sl-home-ask-role` 记住；切回 tenant 示例为租客题 | `homeAsk20261001` |
| B-04 | R3 | 匿名 | 对话框空着回车 | 跳转到当前示例自己身份的 `/<role>/agent?prompt=<示例>&send=1`（不消耗对话预算：到达预览页即停，用 CDP 拦截导航或只读 href） | `homeAsk20261001` |
| B-05 | R3 | 匿名 | 对话框输入自定义文字 + 身份 landlord 后提交 | href = `/landlord/agent?prompt=<文字>&send=1`；**不实际发送**（预算 2 次留给 B-14） | `homeAsk20261001` |
| B-06 | R3 | 匿名 | 三方动画 `home-film`：章节按钮数、暂停、减少动态模式 | 五个章节按钮 + 暂停；`prefers-reduced-motion: reduce` 下不播、显示关键帧；`inert` + `aria-hidden` 在动画容器上；手机里真实 `AgentChat`（`[data-chat-thread]`）存在 | `threeRoleFilm20260928` |
| B-07 | R3 | 匿名 | 四身份面板（桌面 4 面板 / 平板 2×2 / 手机横滑行） | 四个 `data-testid=role-*`；`role-modules` 每面板 3 个链接且目标页存在（`app/<route>/page.tsx`）；服务商面板 `provider-facts` 四条；不出现 六维 / 四枚章 / 验证一次 / 按时收租 / 佣金结算 / soon | `homeRoles20260927` |
| B-08 | R3 | 匿名 | `home-rules` 列表 | 桌面 10 条（手机 6 条）、每条有编号 + 法条号；「全部 N 条规则 →」N = `ONTARIO_RULES.length`；指导比例数字与 `GUIDELINE_TEXT` 一致（2026 2.1% / 2027 1.9%） | `homeV10` |
| B-09 | R3 | 匿名 | VERIFY 数字带 + `GET /api/public/stats` | 四个数字非负整数、与接口一致（筛查数 / 房源数（排除 is_test）/ LTB 判令估算 / 季度数）；接口带 `ltbOrdersEstimated:true`、`x-stats-cache` 头 | `publicStats20261009` |
| B-10 | R3 | 匿名 | FAQ JSON-LD | `<script type=application/ld+json>` FAQPage，4 问（不登录能试吗 / 房源行情来源 / 一票否决 / 数据放哪），name 无 `​`；页面 `<details>` 数与之相等 | `homeV10` |
| B-11 | R3 | 匿名 | 页脚 | 版本 `V0.7`；slogan「你说一句，它去办，你来批准。」；产品列含 租房全流程 / Stayloop API / 服务商；logo href `/` | `logoHome` `threeRoleReport` |
| B-12 | R3 | 匿名 | `/tenant` `/landlord` `/agent` 角色页 | 事实 chip 行不含 `%` / ★ / SOC 2 / 客户数；三张收益卡各带一句真问题链到 `/?role=&ask=`（308 → `/<r>/agent?prompt=…&send=1`）；一个真数来自 `/api/public/stats` 标来源；FAQ 6–7 问 + FAQPage JSON-LD；h1 42/600；主按钮 → `/onboarding/name?role=<r>`；经纪页不再写「有委托才能代客筛查」 | `eliseai20260922` `homeBenchmark`「agent screening copy」 |
| B-13 | R3 | 匿名 | `/pricing` | 房东免费档「每月 3 次」+ 首次深度核查 1 次；「新注册房东 Pro 免费 30 天」；Pro $19 CTA「升级到专业版」→ `/dashboard?upgrade=1`；经纪 $29/$59「即将推出」；团队档 $39 无功能清单、「功能清单待定」；API 两卡（第一档免费无密钥 → docs；机构档 联系我们）；不含「测试期 / 10 月 14 日 / 限时免费」 | `freeWindow` `honestPlans` `v1stage5_docsTerms` |
| B-14 | R3 | 匿名 | `/?role=landlord&ask=测试` 深链 + 真实发一次匿名对话（预算 2 次中的 1 次） | 308 到 `/landlord/agent?prompt=…&send=1`；预览页到达即发出、收到回复、无报错、不出示范待批卡（Sarah Wang）；预算第 2 次留作备用 | `homeV10` |
| B-15 | R3 | 匿名 | `/platform` `/stayloop-api` `/services` `/partners` `/about` `/rules` `/screening` 内容核对 | platform：两产品、租前/租中/租后项全部链到真实页；stayloop-api：七端点 + MCP 端点、三档说明、第三档注册前关闭；services：工种 × 资质表来自 `TRADES`、不含公开目录承诺；partners：Realtor.ca 标「已停用」、无 RBC/Aviva、无「成为合作伙伴」；about：原则二「记录可以带走」；rules：含 `tenancy` `maintenance` area；screening：对照表、四项维度、无「六维」 | `realtorCopy` `honestPassport` `servicesEntry` `platform20260923` |
| B-16 | R3 | 匿名 | `/contact` 表单真发一封（预算 1 封） | 前端校验 → `POST /api/contact` 200 → 「已收到」；蜜罐 `website` 非空 → 200 但不发；缺字段 → 400 | `contactRoute` |
| B-17 | R3 | 匿名 | 全部公开页 HTML（zh SSR + en 渲染后 DOM）grep 禁语 | 不含：不是消费者报告机构 / not a consumer reporting agency / 验证一次 / 处处通行 / 六维 / 背调·背景调查·背景核查·背景审查 / 实时挂牌 / Realtor.ca 实时 / live from Realtor.ca / TRREB 官方·成交·会员经纪 / 助手·管家（中文）/ assistant（英文用户可见）/ 测试期 | 各 copy 守卫 |
| B-T6-01 | R3 | 矩阵 | README 列的全部公开路由（20 条）× 320 / 390 / 768 / 1024 / 1440 × zh / en | 横向溢出 = 0（`scrollWidth − innerWidth ≤ 1`）；被 `overflow:hidden` 祖先裁掉的可交互元素 = 0 | `scripts/mobile-audit.mjs` |
| B-T6-02 | R3 | 矩阵 | 同上 | 控制台 error = 0（特别是 React #418 / #423）；首屏 `<html lang>` 与 `data-lang` 一致（zh → `zh-CN`，en → `en`） | — |
| B-T6-03 | R3 | 320 / 390 | 文本类表单控件 | `input:not([type=checkbox,radio,range,file]), textarea, select` 计算字号 ≥ 16px | `mobileForms` |
| B-T6-04 | R3 | 矩阵 | 可访问性 | 有且只有一个 `h1`；`img` 都有 `alt` 属性（装饰图 `alt=""` 可）；`button` / `a[role=button]` 可读名非空 | `siteTest20261002_g*` |
| B-T6-05 | R3 | 矩阵 zh | 中文标题断行 | `.sl-type-head`、h1–h3 无词中硬断行（按 `keep-all` 规则：只在标点 / 空格 / 零宽空格处断）、行首无标点；横滑行内卡片不算 | `homeBenchmark` WebKit 脚本（本轮 Chromium） |
| B-T6-06 | R3 | — | TTFB 记录 | `/` `/pricing` `/listings` `/screening` `/stayloop-api/docs` 各 3 次 curl `time_starttransfer`，记录中位数（本机走 VPN，只记录不判定） | — |

## 执行记录

（执行后填写）

### 执行记录 · 第一部分：curl / SSR（2026-10-17 晚，生产；HTML 存 scratchpad `sitetest1017/B/html/`，脚本 `ssrcheck.mjs` `home.mjs`）

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| B-01 | 预渲染 HTML 里 testid 位置递增：home-hero(9795) → home-statement(16925) → home-film(18546) / home-flow → home-roles(21486，含 home-role-tenant / landlord / agent / provider + provider-facts) → home-rules(38964) → `section.text-white` 数字带 → home-faq(44873) → START；`id="how-it-works"` `id="faq"` 在；无 home-tiles / home-demo / home-login（已删节） | home.mjs 输出 | 通过 | — |
| B-02 | h1 = 「租房的事，交给AI助理」（`<em>` 包「AI助理」）；导语「找房到续约，它去办，你来批准。」；陈述句「Stayloop 用 AI 把租房的每一步办完：找房、筛查、签约，入住后的物业管理、维修、催租，到期续约，全程按当地法规把关。涉及他人的操作须经你审批，沟通经平台中转，记录不可删改。」逐字一致；无 催收 / 法律协助 / 代收 | home.mjs | 通过 | — |
| B-07 | 四面板 testid 在；`role-modules` 链接：租客 `/listings` `/tenant/applications` `/tenant/maintenance`；房东 `/screening` `/dashboard/listings/new` `/landlord/leases`；经纪 `/agent/clients` `/agent/agent` `/rules`；服务商 `/provider/onboard` `/provider/jobs` `/services`——12 个 `app/<route>/page.tsx` 全部存在；`provider-facts` 4 条；文本无 六维 / 四枚章 / 验证一次 / 按时收租 / 佣金结算 / 即将。注：hero 上没有「服务商 · 维修与服务网络 →」文字入口（10-03 删 pill 行后随之消失，服务商入口在第四面板）——按设计 | home.mjs | 通过 | — |
| B-08 | `home-rules` 桌面 10 条 `<li>`；「全部 30 条规则 →」= `ONTARIO_RULES` 30 条；指导比例「2026 年 2.1%、2027 年 1.9%」 | home.mjs | 通过 | — |
| B-09 | `GET /api/public/stats` 200 `{screenings:240, ltbOrders:176146, listings:0, benchmarkQuarters:30, trrebQuarters:30, ltbOrdersEstimated:true}`，`x-stats-cache: hit`、`cache-control: public, max-age=3600`；四个数非负整数；listings=0 是 10-13 全部在架房源标 `is_test` 后 `public_stats()` 排除的结果（按设计）；页面数字带在浏览器核对（第二部分） | curl -D | 通过 | — |
| B-10 | SSR 内 FAQPage JSON-LD 1 份，4 问：不登录能试吗？/ 房源和行情从哪里来？/ 筛查报告会不会一票否决申请人？/ 我的数据放在哪里，谁能看到？；name 无 `​`；页面 `<details>` = 4 | home.mjs | 通过 | — |
| B-11 | 页脚「V0.7」；slogan「你说一句，它去办，你来批准。」；产品列：租房全流程 / Stayloop API / 维修与服务网络 / 定价 / 租客筛查 / 租客护照 / 争议解决；logo href 在浏览器核对 | home.mjs | 通过 | — |
| B-12 | `/tenant` h1「说出你想要的生活, AI 替你找到家。」FAQ 6 问 = `<details>` 6；`/landlord` h1「空置的每一天都在烧钱。让 AI 替你租得快、选得准。」FAQ 7；`/agent` h1「把杂活交给 AI, 把佣金和关系留给自己。」FAQ 6；每页 3 条 `/?role=<r>&ask=…` 收益卡链接；CTA 都是 `/onboarding/name?role=<r>`；文本无 `\d+%` / ★ / SOC 2 / 客户数 / 8 维 / 按收入倍数 / 验证一次 / 有委托才；「一个真数」行带「来源 /api/public/stats · 每小时更新」（SSR 为「—」，加载后填数） | 角色页 node 解析 | 通过 | — |
| B-13 | `/pricing`：「每月 3 次租客筛查…首次深度核查免费 1 次」「新注册的房东账号 Pro 功能免费试用 30 天，不要信用卡，到期自动降回免费档」「租客永久免费 · 房东免费档永久免费」；Pro $19 CTA「升级到专业版」→ `/dashboard?upgrade=1`；团队 $39「尚未开售」「功能清单待定」无功能清单；API 两卡（「无需密钥」→ `/stayloop-api/docs`、「机构档」→ `/contact`）；无 测试期 / 10 月 14 / 限时免费；经纪 $29/$59 在角色 tab 里（SSR 默认房东 tab），浏览器核对见第二部分 | pricing 解析 | 通过 | — |
| B-14（308 部分） | `/?role=landlord&ask=测试` → 308 `/landlord/agent?prompt=%E6%B5%8B%E8%AF%95&send=1`；`/?role=tenant&ask=hi` → `/tenant/agent?…`；`/?role=provider&ask=hi` → 回退 tenant（按设计：role 不是三者之一 → tenant）；`/?ask=hi` → tenant；`/?role=landlord`（无 ask）→ 200 | curl -w redirect_url | 通过 | — |
| B-15 | `/platform` h1「两个产品，一条流程：租前 · 租中 · 租后，加一个可调用的 API。」含 Stayloop 全流程 / Stayloop API / 维修派单，27 个站内 href 的 page.tsx 全存在；`/stayloop-api` 含「七个端点」「MCP」「/api/mcp」「注册…前」三档，无 20k / 99.95% / npm SDK / api.stayloop.ai；`/stayloop-api/docs` 列 7 个 v1 端点 + openapi + passport/verify + screen，含「claude mcp add」「300」限流；`/services` 工种 × 资质表（Skilled Trades Ontario C of Q / ESA / TSSA / WSIB / CGL）、「没有公开的服务商目录」「不经手任何资金」、入口 `/landlord/providers` `/provider/onboard`；`/partners` Realtor.ca 与「TRREB Rental Market Report」都标「已停用」、CMHC / 统计局在、无 RBC / Aviva / 成为合作伙伴 / Plaid / Persona；`/about` 「记录可以带走」「发通知」在、无「签约、付款」；`/screening` h1「租客筛查,几分钟出一份经得起追问的报告」、对照表、四项维度、申请人本人授权核验、CTA `/screening/app` + `/tenant/passport`、无六维 / 背调 / CanLII 检索 | 各页解析 | 通过 | — |
| B-16 | `POST /api/contact` 缺字段 → 400；坏 JSON → 400；GET → 405；蜜罐 `website` 非空 → 200 `{ok:true}`（不发信）；真发一封（name `[TEST] Site test B-16`、reply-to tenant-test@stayloop.ai、topic Other）→ 200 `{ok:true}`，计 1 封邮件预算 | curl 输出 | 通过 | — |
| B-17 | 21 个公开页 zh SSR 禁语 0 命中（同 O-06）；en 渲染后 DOM 见第二部分 | ssrcheck.mjs | 通过 | — |
| B-T6-06 | TTFB（curl `time_starttransfer`，3 次）：`/` 0.121 / 0.050 / 0.045 s；`/pricing` 0.086 / 0.174 / 0.087；`/listings` 0.067 / 0.064 / 0.085；`/screening` 0.135 / 0.081 / 0.412；`/stayloop-api/docs` 0.092 / 0.084 / 0.092；首次全量抓取 21 页里只有 `/platform` 0.80 s（冷缓存），其余 0.08–0.22 s | curl -w | 记录 | — |

### 执行记录 · 第二部分：无头 Chrome（playwright 全局 + 系统 Chrome，`matrix.mjs` `interact2.mjs` `en.mjs` `b14.mjs` `inspect.mjs`；结果 `matrix-results.json`，截图 `shots/`）

| ID | 实际 | 证据 | 结果 | 缺陷 |
|---|---|---|---|---|
| B-03 | 默认身份 tenant，占位「试试「房东要我付一个月押金加钥匙押金，合法吗？」」；切 landlord → 占位立即换成房东示例，sessionStorage `sl-home-ask-role=landlord`；点「下一个」四次只在房东池 3 条内轮换，没有「（租客）/（经纪）」标注；切 agent → 「帮我给 King West 的两房定个挂牌价」；切回 tenant → 租客示例 | interact.mjs / interact2.mjs 输出 | 通过 | — |
| B-04 | 空着提交：**切身份后 2.5 s 再提交** → `/landlord/agent?prompt=帮我发一个房源…&send=1`（正确）；**切身份后 0.3 s 内提交** → `/tenant/agent?prompt=房东要我付一个月押金…`（发的是切换前那个身份的示例、去了切换前身份的页面）；**点「下一个」后 0.25 s 内空着提交** → 发的是上一条示例而不是屏幕上这条。根因：`show()` 对所有变化（自动轮换 / 身份跳转 / 上一个下一个 / 手机点示例）都记 `changed.current`，`submit` 的 1.5 s 宽限（本意只针对「自动换掉访客正在读的那条」）对访客自己触发的变化同样生效 | interact2.mjs (a)(b)(c)；`components/home/HeroComposer.tsx:135,187` | **失败** | B-D1 |
| B-05 | 身份 landlord + 输入「测试问题 B-05」→ `/landlord/agent?prompt=测试问题 B-05&send=1`（请求被拦截读取，未实际发送） | interact2.mjs | 通过 | — |
| B-06 | `home-film`：5 个章节按钮（租前 · 委托定价 / 找房看房 / 申请筛查 · 租中 · 签约 · 租后 · 续约）+「暂停动画」；容器 `inert` 1 个、`aria-hidden` 13 个；三条泳道各有真实 `[data-chat-thread]`（上传文件 / 语音输入 / 发送按钮都是真 `AgentInputBar`）；`sr-only` 说明 428 字；减少动态模式下矩阵全部页面无报错。三个头像按钮（cat / panda / owl）没有可读名，但都在 `inert` 容器内、不暴露给辅助技术 | interact2.mjs、inspect.mjs | 通过（1 条 S3 观察） | B-D4 |
| B-09 | 数字带 DOM：「240 份筛查报告已生成」「176,146 份 LTB 判令已入库可查」「30 个季度的统计局挂牌租金数据」「**0 套公开房源**，房东直租 · 平台核验」= 接口值；0 是 10-13 全部在架房源标 `is_test` 的结果（按设计），但首页公开展示「0 套公开房源」是营销上的尴尬点 | interact2.mjs | 通过（1 条 S3 观察） | B-D5 |
| B-11 | 页头与页脚 logo href 都是 `/`（10-04 决定）；页脚「Stayloop API」→ `/stayloop-api` | interact2.mjs | 通过 | — |
| B-13（经纪 tab） | 定价页三枚身份按钮 租客 / 房东 / 经纪；经纪 tab：免费档（RECO 徽章 + 目录 + AI 助理基础功能、「看房排程 + 现场记录（即将推出）」）、专业 $29 / 月「尚未开售 · 即将推出」、团队 $59 / 月「尚未开售 · 即将推出」 | interact2.mjs | 通过 | — |
| B-14（对话部分） | `/?role=landlord&ask=房东要我付一个月押金…` → 落 `/landlord/agent`，一次 `POST /api/agent/turn` 200，25 s 内收到回复（「在安大略省，这两个要求基本是合法的…一个月租金押金（LMR）只能作为最后一个月租金…」），页面无 Sarah Wang / Unit 1207 示范卡，预览横幅在，h1 = 1，控制台无错。**预算：匿名对话 1/2** | b14.mjs、`shots/b14-landlord-agent.png` | 通过 | — |
| B-17（en） | 21 页 en 渲染 DOM：禁语 0 命中（正则命中的「AI Agent」是规定的英文名）；**英文界面残留中文**：`/tenant` `/landlord` `/agent` `/services` 眉标「TENANT · 租客 · AI 助理」「LANDLORD · 房东」「PROVIDER · 服务商」；`/platform` 「LEASING · 租前 / LIVING · 租中 / RENEWAL · 租后」；`/screening` 英文页里整段中文「安省租客筛查 · 几分钟出报告 · 注册即可免费试用」「LTB 判令目录(安省开放数据)」「安省法院公开门户」「确定性文件取证引擎」「信用报告转录与核验」；`/listings` 卡片设施芯片「厨房 / Kitchen」「水电气暖全包 / Utilities I…」（房东写的双语串未按界面语言拆分——详情页 10-02 已拆，卡片没拆） | en.mjs | 通过（禁语）/ 观察 | B-D2 B-D3 |
| EN 内容 | 首页 h1「Leave renting to an AI Agent」、FAQ JSON-LD 4、陈述句「Stayloop uses AI to get every step of renting done: search, screening and signing; property management, repairs and rent reminders once you’ve moved in; renewal at the end of the term, all checked against local tenancy rules.」、页脚 V0.7 + 「You say it, it does the work, you approve.」；`/pricing` 「3 tenant screenings a month」「30 days」；`/terms` 第 5 节 8 条、第 7 节 7 条、Stayloop Inc.；`/tenant` FAQ 6 / `/landlord` 7 / `/agent` 6；`<html lang="en" data-lang="en">` | en.mjs | 通过 | — |
| B-T6-01 | 21 路由 × 320 / 390 / 768 / 1024 / 1440 × zh / en = 210 组合全部加载成功；**横向溢出 0 / 210**；「裁掉的可交互元素」脚本报 `/listings` 1024 / 1440 共 4 组——人工核对是列表列的纵向滚动容器（`overflow-y:auto`，scrollHeight 1606 > clientHeight 776）里折叠线以下的卡片，可滚动不是裁掉，误报；真裁掉 = 0 | matrix.log、matrix-results.json、inspect.mjs | 通过 | — |
| B-T6-02 | 控制台 error 0 / 210（含 pageerror；已排除 favicon / 地图 key 类资源错误后仍为 0，未排除前也无 #418 / #423）；`<html lang>` / `data-lang`：zh 组合全部 `zh-CN` / `zh`，en 组合全部 `en` / `en` | matrix-results.json | 通过 | — |
| B-T6-03 | 320 / 390 × zh / en × 21 路由：字号 < 16px 的文本类控件 0 | 同上 | 通过 | — |
| B-T6-04 | 210 组合 h1 全部 = 1；`img` 缺 `alt` 属性 0；无可读名的 `button`：只有首页三方动画里 3 个头像按钮（手机 1 个），全部在 `inert` 容器内（见 B-06） | 同上 | 通过（观察见 B-D4） | — |
| B-T6-05 | zh 105 组合：所有 h1–h3 / `.sl-type-head` **行首标点 0**；首页（唯一用 `keep-all` 的页面）词中断行 0；其他页面标题是普通 CJK 逐字换行（脚本记为 mid-word 70 处，如 `/pricing` 320「合规检|查」），不是 keep-all 规则的适用范围，不计缺陷。本轮只有 Chromium；WebKit 断行要用 scratchpad `webkit/` 脚本另跑（10-03 坑） | matrix-results.json `breaks` | 通过 | — |
| B-T6-06 | 页面完整加载（networkidle）中位 2.9 s / 210 组合 | 同上 | 记录 | — |

### 缺陷 / 观察

| 编号 | 严重度 | 优先级 | 一句话 | 复现要点 |
|---|---|---|---|---|
| B-D1 | S2 | P2 | 首页对话框「空着回车试示例」在访客**自己**切身份或点「下一个」后 1.5 s 内提交时，发出的是**上一条示例**、去的是上一条示例的身份页（例如选了「房东」立刻回车却进了租客 AI 问租客问题） | 1440 匿名 `/` → 身份选「房东」→ 0.3 s 内点发送 → 落 `/tenant/agent?prompt=房东要我付一个月押金…`；等 2.5 s 再点 → 正确 `/landlord/agent?prompt=帮我发一个房源…`；点「›」后立刻发送同样发上一条。`HeroComposer.tsx` `show()`(135) 对一切变化记 `changed`，`submit`(187) 的 `CHANGE_GRACE_MS` 宽限没有区分自动轮换与访客操作 |
| B-D2 | S3 | P3 | 英文界面里角色页 / 服务页 / 产品页的眉标仍带中文（「TENANT · 租客 · AI 助理」「LEASING · 租前」「PROVIDER · 服务商」） | `localStorage.stayloop_lang=en` 打开 `/tenant` `/landlord` `/agent` `/services` `/platform`，读眉标 |
| B-D3 | S3 | P3 | `/screening` 英文界面整段中文：「安省租客筛查 · 几分钟出报告 · 注册即可免费试用」、数据源卡「LTB 判令目录(安省开放数据)」「安省法院公开门户」「确定性文件取证引擎」「信用报告转录与核验」；`/listings` 英文卡片设施芯片显示房东写的双语串「厨房 / Kitchen」「水电气暖全包 / Utilities…」（详情页已按语言拆，卡片未拆）。注：`/screening` 营销页在 DO NOT TOUCH 目录下，改前先确认 | en.mjs 输出 `cjk` 列 |
| B-D4 | S3 | P3 | 首页三方动画三个头像按钮无可读名（`aria-label` 空、内部 span `aria-hidden`）；因整段动画 `inert` + `aria-hidden`，辅助技术看不到，仅为代码卫生 | inspect.mjs |
| B-D5 | S3 | P3（产品决定） | 首页数字带与 `/tenant` 角色页「一个真数」显示「0 套公开房源」——10-13 全部在架房源标 `is_test` 后的真实值，但在营销首页公开展示 0 很尴尬；建议在没有真实房源前改显示别的真数或隐藏该格 | `GET /api/public/stats` → `listings:0` |

### 未执行 / 限制
- WebKit（Safari / iPhone）断行与渲染未跑（本轮只有 Chromium；10-03 记录的 WebKit 断行坑需用 scratchpad `webkit/` 的 Playwright WebKit 另测）。
- B-04 / B-05 的跳转用请求拦截读取 href，没有真的到达预览页（预算）；B-14 真发 1 次。
- 减少动态模式只用于矩阵截图与加载；动画实播只核对了章节按钮与结构，没有逐帧核对剧本。

### 数据副作用
- `/api/contact` 真发 1 封邮件到 privacy@stayloop.ai（主题来自 name「[TEST] Site test B-16」，reply-to tenant-test@stayloop.ai）。
- 匿名 AI 对话 1 次（`/landlord/agent` 预览，不落库）。
- 无任何数据库写入。
