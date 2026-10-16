# 「直接问 ChatGPT / Gemini 租房问题」· 通用 AI 作为租客工具的现状

抓取日期：2026-10-13
调研方法：WebFetch 实读 OpenAI / Google 公开说明页；OpenAI 的站点（openai.com、help.openai.com）对抓取一律返回 403，只能用 WebSearch 的官方页摘要（搜索结果里引用了 help.openai.com 原文，但我没有读到整页，下面都标注了）。研究与报道部分：读了 Université de Montréal 的论文 PDF 全文、Tribunals Ontario 的 AI 实务指引、安省 Landlord's Self-Help Centre 的文章、两篇 2026 年英国行业文章、一篇 LTB 案例摘要。

## 读过的 URL

成功读取：
- https://gemini.google/subscriptions/ （Gemini 套餐，加拿大价格）
- https://gemini.google/overview/ （Gemini 概览）
- https://gemini.google/overview/personalization/?hl=en-CA （Personal Intelligence / 个性化）
- https://support.google.com/gemini/answer/15637730 （个性化帮助页，被截断）
- https://support.google.com/gemini/answer/13695044 （Connected Apps：Gmail / Calendar / Maps 等）
- https://support.google.com/gemini/answer/16596215 （Gemini tasks，多步任务）
- https://9to5google.com/2026/02/26/gemini-past-chats-free/ （Past Chats 向免费用户开放）
- https://tribunalsontario.ca/documents/TO/Practice-Direction-on-AI_EN.html （Tribunals Ontario AI 实务指引，2025-04）
- https://www.cleo.on.ca/en/news/research （CLEO 研究页：GenAI 与 Guided Pathways）
- https://landlordselfhelp.com/blog/before-you-trust-chatgpt-with-your-rental-property-read-this/ （安省 Landlord's Self-Help Centre）
- https://ceur-ws.org/Vol-3435/short2.pdf （"ChatGPT as an Artificial Lawyer?"，Université de Montréal，2023）
- https://news.bloomberglaw.com/legal-ethics/legal-errors-by-top-ai-models-alarmingly-prevalent-study-says （斯坦福研究报道，2024-01）
- https://www.lawnext.com/2025/12/university-of-chicago-law-school-ai-lab-launches-leasechat-a-free-tool-to-help-renters-understand-their-leases-and-legal-rights.html （LeaseChat，2025-12）
- https://apartmentleasereview.com/guides/ai-lease-review-chatgpt （LeasePatrol 指南，2026-09 更新，商业页）
- https://www.cpshomes.co.uk/cps-blog/2026/01/29/tenants-chatgpt-and-the-private-rented-sector-a-trend-landlords-can%E2%80%99t-ignore （英国中介，2026-01-29）
- https://www.vailwilliams.com/chatlt-landlord-and-tenant-relationships-in-a-time-of-ai/ （英国律所，2026-01-13）
- https://www.aivortex.io/legal-ai-risk/cases/shakori-v-tern-2025-onltb-31233-2025-05-26/brief （LTB 案例 Shakori v Tern 的第三方摘要）

未能读取（都是 HTTP 403，内容只来自搜索结果摘要）：
- https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq
- https://help.openai.com/en/articles/8590148-memory-faq
- https://help.openai.com/en/articles/8983136 （记忆：Saved Memories vs Chat history）
- https://help.openai.com/en/articles/11752874-chatgpt-agent
- https://help.openai.com/en/articles/10291617-tasks-in-chatgpt
- https://openai.com/chatgpt/pricing/
- https://openai.com/index/memory-and-new-controls-for-chatgpt/
- https://openai.com/index/introducing-chatgpt-agent/
- https://interactions.acm.org/archive/view/november-december-2025/empowering-tenants-and-landlords-through-conversational-ai-for-housing-rights
- https://tribunalsontario.ca/?p=6200 （HTTP 404）

## 一、OpenAI 与 Google 的公开说明

### ChatGPT（OpenAI）——以下引文来自搜索结果对 help.openai.com 原文的引用，整页未读到

1. **免费版能力**（help.openai.com/en/articles/9275245 与 11909943）："Free tier users now have access to a large range of capabilities with GPT-5.5"；工具含网页搜索、数据分析、文件与图片上传、生图、500 MB 的 Library。
2. **免费版限制**："use GPT-5.5 only a limited number of times within a five hour window"；限制 "can be dynamic and may vary"；FAQ 写 "we will start to show ads in the Free Tier in certain countries"。对比：Plus / Go "up to 160 messages with GPT-5.5 every 3 hours"。
3. **记忆**（openai.com/index/memory-and-new-controls-for-chatgpt，2025-06 更新）：免费用户 "a lightweight version of memory improvements that provides short term continuity"；付费才有长期画像；可在设置里关掉 "saved memories" 或 "chat history" 引用。帮助页（8983136）另写 "Free tier users only have access to 'Saved Memories'"——两处说法不一致，以用户账号设置页为准。记忆功能在 EEA / 英国 / 瑞士等地未开放。
4. **ChatGPT agent**（openai.com/index/introducing-chatgpt-agent，2025-07-17，页面已标「outdated」）："ChatGPT requests permission before taking actions of consequence"；面向 "Pro, Plus, and Team users"，免费版不含。2026 年第三方报道说改名为 Work agent 并可能向免费用户开放有限版本，**未在官方页核实**。
5. **Tasks（定时任务）**（help.openai.com/en/articles/10291617）："schedule one-off and recurring tasks"、"check for changes and notify them"；"available for Plus, Pro, Business, and Enterprise users"——免费版没有。

### Gemini（Google）——以下页面已实读

1. **免费版**（gemini.google/subscriptions，加拿大）：CA$0，模型 "3.5 Flash-Lite"，含 Deep Research、Gemini Live、Canvas、Gems、Gemini Notebook，15 GB 存储，"standard usage limits"。**Gemini in Gmail / Docs 只在付费档**（AI Plus CA$6.99 起）。用量 "refresh every five hours until a weekly limit is reached"。
2. **记忆 / 个性化**（gemini.google/overview/personalization）：Personal Intelligence "connects the dots across your Google apps" —— 点名 Gmail、Photos、Search、YouTube，**没有 Maps**；可用过去的对话 "pick up where you left off"；beta，18 岁以上、个人账号，排除 EEA / 瑞士 / 英国 / 尼日利亚（加拿大不在排除名单）。9to5Google 2026-02-26：Past Chats 向全球免费用户开放（欧洲除外），设置页叫 "Personal context"。
3. **Gmail / Maps 集成**（support.google.com/gemini/answer/13695044）：Connected Apps 的例子是 "Summarize emails from Gmail"、在 Calendar 建事件；Maps / Flights / Hotels / YouTube 只用公开信息，"Gemini won't access your personal information or content in these services" 除非你允许；可用性 "vary by location, language, device, and Gemini app"；关闭 Keep Activity 后网页端 Connected Apps 不可用。页面没说 Gemini 能否直接**发送**邮件。
4. **多步任务 Gemini tasks**（support.google.com/gemini/answer/16596215）：能浏览网站、在 Workspace 里操作（Calendar、Gmail、Docs…）、监控价格、做研究；发送通信、改数据、购买、提交网页表单前会要确认；"Do not enter sign-in info, payment details" 到任务里；"Gemini's safeguards aren't intended to replace your active supervision"；有提示注入风险。**要 Google AI Pro 或 Ultra 订阅**、18 岁以上、开 Personal Intelligence；排除 EEA / 英国 / 瑞士 / 尼日利亚；标 "experimental"；最多 15 个任务并行。

## 二、研究与报道：用 ChatGPT 问租客权利 / 法律问题的准确性

**研究（≥2 条）**

1. **Tan, Westermann, Benyekhlef，"ChatGPT as an Artificial Lawyer?"**，Université de Montréal Cyberjustice Laboratory，AI4AJ 2023（https://ceur-ws.org/Vol-3435/short2.pdf，PDF 全文已读）。用三个魁北克房东租客模拟案例，把 ChatGPT 与专家系统 JusticeBot（与 TAL 合作建的）对比。结论："ChatGPT is not yet accurate enough to provide legal information directly to laypeople"；"It frequently 'hallucinates' answers to legal questions, generating false legal provisions and false cases"；举例 ChatGPT 坚称 Tan v. Bailey [2018 ONCA 260] 是真案（CanLII 上该编号是 R. v. Jennings），反复追问仍 "insisted that the case was genuine"；另一案给的条文 "quite close to the actual legal provisions" 但关键信息偏离，"a high probability that users will trust the information"。优点：语言理解好、能用通俗英语解释。
2. **斯坦福 RegLab / HAI（Dahl, Magesh, Suzgun, Ho）**，2024-01（报道 https://news.bloomberglaw.com/legal-ethics/legal-errors-by-top-ai-models-alarmingly-prevalent-study-says）：20 万条法律问题，ChatGPT 3.5 / PaLM 2 / Llama 2，"hallucinate at least 75% of the time" 问法院核心裁决时；判断两案是否一致 "no better than random guessing"；下级法院案例错得更多；倾向接受提问里的错误前提。作者点名风险最大的是没有律师的自诉人。
3. **芝加哥大学法学院 AI Lab 的 LeaseChat**，2025-12-03（https://www.lawnext.com/2025/12/...）：给美国租客做的免费租约分析工具，基于 ChatGPT + 分层提示；学生测试 "ChatGPT 5" 时发现叠加自建法律库 "there was no accuracy gain"；没有公开的准确率数字。说明：要让通用模型可靠回答租客法律问题，需要按辖区做提示工程和评分，而不是直接问。

**加拿大 / 安省机构的提醒**

- **Tribunals Ontario《Practice Direction on the Use of Artificial Intelligence》**（2025-04，https://tribunalsontario.ca/documents/TO/Practice-Direction-on-AI_EN.html）：适用于 Tribunals Ontario 各审裁处（LTB 在其中；页面本身没单独点名 LTB）。"AI results can be wrong"；AI "might give you incorrect or made-up legal sources"；当事人对提交的判例、法律原则、证据的准确性自己负责；要到 CanLII、法院网站等可靠来源核对。不要求披露 AI 使用。
- **LTB 实际案例 Shakori v Tern, 2025 ONLTB 31233**（2025-05-26，第三方摘要 https://www.aivortex.io/...，原判令未读）：自诉租客提交的判例由 ChatGPT 生成且 "were fictitious"，Board 记 "ChatGPT is known to create fictitious information"，不采信，未处罚。
- **Landlord's Self-Help Centre（安省，面向小房东）**（https://landlordselfhelp.com/blog/before-you-trust-chatgpt-with-your-rental-property-read-this/，无日期）：AI "simply generates answers based on data and patterns available"，会混淆辖区、引用过时立法、搞错程序；举例：混淆 L1 / L9、对现任租客错用 L10、把拟议的通知期修改说成已生效、编造判例。
- **CLEO（Steps to Justice 的运营方）**：没有找到面向公众的「别用 ChatGPT」提醒。CLEO 自己在做 GenAI 项目（2024-10-31 讨论稿、2025-11-19 进展报告，https://www.cleo.on.ca/en/news/research），方向是在受控的 Guided Pathways 里用 GenAI，并设 Claim / Story / Evidence Checker 和「Highlight Changes」等防护。Steps to Justice 页脚只有通用声明 "general information for people in Ontario, Canada. It's not legal advice."
- **ACTO / Legal Aid Ontario**：未找到关于 AI 的公开提醒。

**2026 年行业报道（非研究）**

- CPS Homes（英国中介，2026-01-29）：租客邮件引用的立法 "never existed, had been superseded decades earlier, and applied only to England"（房产在威尔士）；法庭案件中当事人引三个不存在的案例。
- Vail Williams（英国律所，2026-01-13）：一名自诉人向税务审裁处提交九份 ChatGPT 编造的裁决，案件被驳回。
- LeasePatrol（美国，2026-09 更新，商业页）：通用 AI "cites statutes that don't exist"，会混合不同州的规则、漏掉本地法规层（如纽约市住房法规）、训练截止后的新法（举例马萨诸塞 2025 年中介费法）看不到。

## 三、归纳：通用 AI 对租客能做 / 不能做的事

**能做（有证据支持）**
- 用通俗语言解释租约条款和法律术语：Montréal 论文 "ChatGPT has a good understanding of natural language"、答案 "rarely contain complex legal jargon"；LeasePatrol 也把「翻译法律语言」「定义术语」列为最可靠的用途。
- 起草给房东的信件初稿：LeasePatrol "Drafting first-pass messages to a landlord, which the user should review before sending"；LeaseChat 的 Letter Drafter 就是这个用途。
- 在付费版里做定时提醒 / 监控（ChatGPT Tasks、Gemini tasks）——但两家都把这类功能放在付费档，且 Gemini 明说 "Avoid scheduling sensitive tasks"。
- 记住你之前说过的话（两家免费版都有基础记忆：ChatGPT "short term continuity"、Gemini "Past Chats"）。

**不能做 / 不可靠（每条附依据）**
1. **没有本地房源数据**：ChatGPT 免费版的工具是网页搜索、文件分析、生图（help.openai.com 9275245 摘要），没有任何房源库；Gemini 的 Maps 集成只用 "public information"（support 13695044）。两者都不能按预算 / 户型在本地库里筛房源，也不能发看房请求。
2. **不能替你给房东发邮件或办事（免费版）**：ChatGPT agent 只对 "Pro, Plus, and Team users"（openai.com 2025-07），且 "requests permission before taking actions of consequence"；Gemini tasks 要 "Google AI Pro or Ultra subscription"，发送通信前要确认，还警告 "Do not enter sign-in info, payment details"（support 16596215）。免费版两家都没有执行通道，即使付费也没有与房东、LTB 或租约系统的对接。
3. **没有你的租约 / 申请 / 在管租约数据**：记忆只是对话里说过的内容（OpenAI "saved memories" / "chat history"；Gemini "past chats"），不是结构化的租约、账期、工单。Gemini 的 Personal Intelligence 能读 Gmail、Photos（gemini.google/overview/personalization），但这是从邮件里推断，不是事务记录；而且 beta、18+、个人账号、部分地区不可用。
4. **法律答案可能编造**：Montréal 论文 "generating false legal provisions and false cases"；斯坦福 "hallucinate at least 75% of the time"；LTB Shakori v Tern 中租客提交的判例 "were fictitious"；Tribunals Ontario 指引 "might give you incorrect or made-up legal sources"。
5. **可能过时或错省份 / 错辖区**：Landlord's Self-Help Centre 指出会「混淆辖区、依赖过时立法」、把拟议的通知期改动说成已生效；CPS Homes 案例里引用的法律 "applied only to England" 而房产在威尔士；LeasePatrol 指出训练截止后的新法看不到。对安省租客的具体风险：2026 年指导比例 2.1%、N4 终止日 7 天（2026 年新规）这类当年数字，通用模型很可能给旧值。
6. **错了也不承认**：Montréal 论文 "was less willing to modify its answers when users repeatedly asked"、"does not reflect and admit that its answers were faulty"；斯坦福发现模型倾向接受提问里的错误前提。
7. **提交给 LTB 的材料由你自己负责**：Tribunals Ontario 指引明写当事人对判例与法律原则的准确性负责；LTB 案例里 AI 编的判例被整体不采信。
8. **隐私**：把租约贴进通用聊天工具会带入身份信息（LeasePatrol 指出 "retention and training settings matter"）；Gemini tasks 警告在本地浏览器里 "may share your info with third parties"。

**对 Stayloop 的参照意义**
通用 AI 的强项（通俗解释、起草信件、对话式交互）Stayloop 的 AI 助理也要有；它做不到的四件事——本地房源与看房、代办并留痕、读你自己的租约 / 账期 / 工单、按安省当年数字答法律问题并给出法条编号——正是产品差异所在。Tribunals Ontario 指引里「核对来源」的要求，对应我们「每条规则有编号、链到法条」的做法。

## 读到的页面文字摘要

**https://gemini.google/subscriptions/**：Gemini 四档套餐（加拿大）。免费：CA$0，3.5 Flash-Lite，生图编辑、Deep Research、Gemini Live、Canvas、Gems、Gemini Notebook，15 GB 存储，标准用量。AI Plus CA$6.99：3.6 Flash、2 倍用量、视频生成、Gemini in Gmail 与 Vids、400 GB。AI Pro CA$26.99：Gemini 4 Argon / 3.1 Pro / 3.8 Flash、4 倍用量、Gemini in Gmail / Docs / Vids、Antigravity 入门额度、5 TB。AI Ultra CA$139.99 起：Pro 的 5–20 倍用量、Project Genie 等。注明所有档可能有速率限制，用量每五小时刷新直到周上限。

**https://gemini.google/overview/**：Gemini 应用概览。没有描述免费层；文件上传限制写 "Gemini Advanced only"。个性化靠 Gems（当时写 coming soon）和活动控制；可开关 Workspace、Maps、YouTube 扩展；Gmail 只在后台 AI 功能里提到；侧栏有 "Import your memory" 和 "Personal Intelligence" 条目但无解释。没有 Agent Mode 的内容。

**https://gemini.google/overview/personalization/?hl=en-CA**：Personal Intelligence 介绍。Gemini 结合你连接的 Google 应用（Gmail、Photos、Search、YouTube）、聊天历史和自定义指令给出更贴合的答案，会尽量说明用了哪些信息以便核对；可用过去的对话接着聊或总结；可查看删除对话、管理过去对话的使用。Beta，面向 18 岁以上个人账号，全球可用但排除 EEA、瑞士、英国、尼日利亚；Web / Android / iOS 都支持；未来几个月可能加更多应用。没写默认开关和套餐要求。

**https://support.google.com/gemini/answer/15637730**：个性化帮助页（被截断）。个性化的来源：过去的 Gemini 对话记忆、你连接的 Google 应用的内容和活动、你的偏好指令。"These features are not available to everyone at this time"；必须用个人 Google 账号，工作 / 学校 / 受监管账号不可用。链接到「管理 Gemini 记住的内容」「连接你的 Google 应用」等文章但未展示内容。

**https://support.google.com/gemini/answer/13695044**：Connected Apps 说明。例子：总结 Gmail 邮件、在 Calendar 或第三方应用建事件、经你许可编辑管理其他应用的内容。Maps、Flights、Hotels、YouTube 不算 Connected Apps，Gemini 自动用它们的公开信息，不会访问你在这些服务里的个人内容（需开 Keep Activity）。另支持 YouTube Music、Spotify、Google Home、Android 上的 Phone / Messages / WhatsApp，可经 MCP 服务器加自定义应用。可用性因地区、语言、设备而异；关掉 Keep Activity 后网页 / iOS / 手表上 Connected Apps 不可用。没写能否发邮件、没写套餐和配额。

**https://support.google.com/gemini/answer/16596215**：Gemini tasks（原名 Spark）。能处理多步目标、按计划运行、使用 Connected Apps、技能、对话和已登录的网站：管理收件箱、建待办、监控机票酒店价格、带引用的研究并输出 PDF / 表格 / 演示、浏览网站购物订餐、在 Workspace 里操作。发送通信、修改数据、购买、提交网页表单、Google 登录前要确认；浏览任务前展示计划和要用的网站；私有 Google Tasks 的批量操作例外。警告：别在任务里输密码和支付信息、避免安排敏感任务、本地浏览器可访问已登录网站并可能把信息给第三方、可随时接管或停止、防护不替代主动监督、存在提示注入风险。要求 18+、个人账号、Google AI Pro 或 Ultra、开 Keep Activity 与 Personal Intelligence；排除 EEA、尼日利亚、瑞士、英国；标 experimental；最多 15 个任务并行。

**https://9to5google.com/2026/02/26/gemini-past-chats-free/**：2026-02-26，Google 向全球免费 Gemini 用户开放 "Past Chats"（欧洲稍后），付费用户 2025 年已有。开启后 Gemini 用早先对话调整回复，不必重述背景。设置页叫 "Personal context"，下有 "Your past chats with Gemini" 开关和 "Instructions for Gemini"。Google 计划把 Personal Intelligence（连 Gmail、Photos 等）也给免费用户，没有时间表。文中无 Google 直接引语。

**https://tribunalsontario.ca/documents/TO/Practice-Direction-on-AI_EN.html**：Tribunals Ontario 2025 年 4 月的 AI 实务指引。如果用 AI 做研究或准备文件必须谨慎；AI 结果可能错，用 AI 找法律来源或分析信息时要复核；AI 可能给出错误或编造的法律来源，要通过法院 / 审裁处网站、官方出版物、CanLII 等核实；书面和口头陈述即使由 AI 协助仍由当事人负责；对提交的判例、法律原则、证据的准确性自己负责。不要求披露 AI 使用。页面没有单独点名 LTB。

**https://www.cleo.on.ca/en/news/research**：CLEO 研究页。两条 GenAI 相关：2024-10-31 讨论稿（用 GenAI 为自诉人做更好的文件组装工具）、2025-11-19 三年研究计划的进展报告，说 GenAI 可以「安全且有意义地改善自诉人的司法可及性」。没有风险、防护或对通用聊天机器人的警告；页脚只有「本网站为安省居民提供一般信息」的通用声明。

**https://landlordselfhelp.com/blog/before-you-trust-chatgpt-with-your-rental-property-read-this/**：安省 Landlord's Self-Help Centre 文章（无日期）。要点：自信不等于准确，AI 只是按数据和模式生成答案、不知道信息是否正确或最新；不理解法律，会混淆辖区、用过时立法、误读程序而不提示；程序不容错，一张通知错了就输；AI 不承担责任。举例：对现任租客错用 L10 被五分钟驳回、混淆 L1 和 L9、建议可能构成歧视或恶意的「变通」、漏掉 N5 作废期、编造判例、把拟议的通知期修改说成已生效。

**https://ceur-ws.org/Vol-3435/short2.pdf**：Tan、Westermann、Benyekhlef（Université de Montréal Cyberjustice Laboratory），AI4AJ 2023（2023-06-19，葡萄牙布拉加）。用 ChatGPT 生成并人工调整三个魁北克房东租客模拟案例（欠租、虫害扣租、禁宠养狗），以外行身份与 ChatGPT 对话，并与专家系统 JusticeBot（与魁北克住房行政法庭合作建、2021 年起超 2 万用户）对比，按语言理解、准确、完整、可信、无害、易用六项评估。结果：ChatGPT 语言理解和交互体验很好、能主动补充相关信息；但准确性是最大短板，经常编造条文与案例，一个案例里正确识别了 TAL，另一个案例条文编号接近真实但关键内容偏离，还有把 ONCA 260 编成假案并在追问下坚称为真；JusticeBot 信息经专家核验、确定性高但覆盖范围有限。结论：ChatGPT 还不够准确、不能直接给外行提供法律信息；可做通信层，由 JusticeBot 这类工具注入核验过的知识。

**https://news.bloomberglaw.com/legal-ethics/legal-errors-by-top-ai-models-alarmingly-prevalent-study-says**：2024-01-12 报道斯坦福研究（Daniel Ho、Matthew Dahl 等）：对 ChatGPT 3.5、PaLM 2、Llama 2 问 20 万条法律问题，问法院核心裁决时幻觉率至少 75%；判断两案关系不比随机好；下级法院案例、很新和很老的最高法院案例错得更多；模型倾向接受错误前提。作者警告最受影响的是请不起律师的自诉人，建议有法律知识的人核对输出。

**https://www.lawnext.com/2025/12/university-of-chicago-law-school-ai-lab-launches-leasechat-...**：2025-12-03，芝加哥大学法学院 AI Lab 十名学生在 Kimball Dean Parker 带领下发布 LeaseChat：免费，帮美国租客分析租约（标红异常押金等）、按租约条款引用回答问题、按所在地给租客法律权利、起草给房东的信，有西班牙语版。团队本想自建房东租客法律库提高准确率，测试 ChatGPT 5 等推理模型后发现「没有准确率提升」，改为评分答案与优化提示；没有公开的准确率数字。

**https://apartmentleasereview.com/guides/ai-lease-review-chatgpt**：LeasePatrol（美国租约审查公司）2026-09-23 更新的指南，推广自家产品。通用 AI 的问题：混合不同州规则、漏掉本地法规层、引用不存在的法条、训练截止后的新法看不到（举马萨诸塞 2025 年中介费法）、只答所问不主动找风险条款、对错答案语气一样自信、贴租约有隐私问题。做得好的：翻译法律语言、定义术语、起草给房东的初稿。建议条款合法性用基于法条的工具或律师判断。

**https://www.cpshomes.co.uk/cps-blog/2026/01/29/...**：英国 CPS Homes 的 Nikki Lewis 2026-01-29 文章。观察到租客邮件明显由 ChatGPT 生成，争议中措辞更长更强硬、带「准法律」语言；一封邮件引用的立法从不存在、几十年前已被取代、且只适用于英格兰而房产在威尔士；法庭案例中应诉方引三个不存在的案例，法官虽认定非故意误导但质疑证据可靠性。没有统计数据。

**https://www.vailwilliams.com/chatlt-landlord-and-tenant-relationships-in-a-time-of-ai/**：英国律所 Vail Williams 的 David Thomas 2026-01-13 文章。三个事件：一名自诉人向税务审裁处提交九份 ChatGPT 编造的裁决被驳回；高等法院就 AI 提交材料中的假引用警告律师；一名律师把未核对的错误案例归咎于 Google。提醒 AI 会「幻觉」案例引用，建议不要用 AI 谈判商业租约条款或处理 1954 年法下的续约。

**https://www.aivortex.io/legal-ai-risk/cases/shakori-v-tern-2025-onltb-31233-2025-05-26/brief**：第三方摘要（原判令未读）。Shakori v Tern, 2025 ONLTB 31233，2025-05-26。自诉租客承认提交的判例由 ChatGPT 生成且为虚构；Board 记「ChatGPT 以制造虚构信息著称」，不采信、按其他证据裁决，未处罚。实体结论：RTA 自 2024-10-13 起适用于该租赁。
