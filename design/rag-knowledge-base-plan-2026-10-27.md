# 租房行业知识库（RAG）建设计划 · 2026-10-27

> 用户 2026-10-27：「能说说我们这里如何构建 RAG 专门的租房的相关行业知识库，先说个计划，不实施。」
> 2026-10-27 用户批准开工：第 0 期 + 第 1 期站内部分已上线（见 `design/history/2026-10.md`「知识库（RAG）第 0–1 期上线」）。§2 语料、§3 架构、§8 路径与实现一致；§7 的人审队列与 `effective_from` 还没做。

## 0. 先说结论

- 我们已经有「第一层知识」：`lib/ontario/rules.ts`（46 KB）、`lib/provinces/rules.ts`（12 省，182 KB）、`lib/ontario/screeningQuestions.ts`、`lib/ontario/noticeForms.ts`。这些是人工整理的**结构化规则**，确定性、带引文与官方链接，已经喂给助理（`GUIDELINE_TEXT` 口语版）和开放 API 第一档。**这一层不改成向量检索**，它是判断题的单一来源。
- 缺的是「第二层知识」：**官方长文本原文**（RTA 全文、O. Reg. 516/06、LTB 解释指南与程序规则、安省标准租约指南、N 表官方说明、OHRC 租房政策、多伦多市条例、CMHC 报告、12 省的法规原文）。现在助理遇到规则表没覆盖的问题，只能靠模型自己的记忆，容易编条款号。RAG 就是补这一层：**检索到原文段落再回答，每句引用来源**。
- 第三层（判例要点、用户自己的文件）放到后面做，各有许可与隐私门槛。
- 技术上不引新服务：Supabase 开 `pgvector`，嵌入经现有 `llmChat` 同款的记账层，检索走 向量 + 全文（`tsvector` / 已有 `pg_trgm`）混合，接入点只有 `app/api/agent/turn/route.ts` 一处 + 回执卡。

## 1. 目标与边界

**要回答的问题类型**（按四顶帽子）：
- 租客：涨租是否合法、N 表收到后怎么办、押金 / 钥匙押金 / 保险、维修责任、退租通知期、转租、入住检查。
- 房东：N1 / N4 / N12 的程序与时限、标准租约必填项、什么能问什么不能问、LTB 申请流程与费用、Toronto RentSafeTO / 翻新许可。
- 经纪：TRESA 下的披露义务、RECO 广告规则、代表协议。
- 服务商：工单相关的省级许可（ESA、TSSA）与安省住宅维修标准（O. Reg. 517/06）。
- 跨省：同类问题的外省版本（只用 `lib/provinces/` 的省份事实 + 该省原文）。

**不做的**（与现行不变量一致）：
- 不给法律意见、不代填 / 代选表（LSA s.1(5)），回答仍带 `decisionNoticeFooter` 那类免责句。
- 不检索含个人姓名的判决全文来评价某个人（CRA 注册前的红线；`ltb_orders` 路径照旧）。
- 不抓 Realtor.ca / MLS，不碰 CanLII 网页（API 许可另议）。
- 外省回答里不出现 RTA / LTB / N 表 / OHRC / RECO / TRESA。

## 2. 语料清单（第一批 = 安省）

| 来源 | 内容 | 许可 | 更新频率 |
|---|---|---|---|
| Ontario e-Laws | RTA 2006 全文（现行合并版）、O. Reg. 516/06（一般规定）、O. Reg. 517/06（维修标准）、O. Reg. 9/18（标准租约） | Open Government Licence – Ontario，可用 | 法规修订时（e-Laws 有合并日期） |
| Tribunals Ontario / LTB | 解释指南（Interpretation Guidelines 1–21）、程序规则（Rules of Procedure）、实践指引、各表格的官方说明页、费用表 | Crown copyright，非商业转载需注意；先以「引用 + 链接」为主，原文段落只用于检索与短引 | 季度核对 |
| 安省住房厅 | 标准租约指南（Guide to Ontario's Standard Lease）、年度租金指导比例公告、Bill 60 等法案说明 | OGL-Ontario | 每年 6 月（指导比例） |
| OHRC | 租房中的人权政策（Policy on human rights and rental housing）、「这个能问吗」依据 | 可引用 | 年 |
| 多伦多市 | RentSafeTO、翻新许可条例（Rental Renovation Licence By-law）、Chapter 354 等 | 市政开放许可 | 季度 |
| CMHC / 统计局 | 租赁市场报告、空置率与基准租金（已有 `lib/market/rentBenchmark.ts` 的数据来源） | 开放数据 | 年 / 月 |
| 12 省 | 各省住宅租赁法与条例原文、各省仲裁机构（RTB / RTDRS / TAL 等）的官方指南 | 各省开放许可（逐省核对，Quebec 法文 + 英文） | 第二批 |
| RECO / TRESA | 2023 年新法与条例、广告指引、信息指南（RECO Information Guide） | 可引用 | 第二批 |

每份语料入库时记：权威等级（法条 > 条例 > 官方指南 > 市政 > 二手解读）、生效日期 / 合并日期、省份、语言、原始 URL、内容哈希、抓取时间。**同一条问题优先返回权威等级高、日期新的段落。**

## 3. 架构

```
语料 (PDF / HTML)
  → scripts/kb/ingest.mjs：抽文本（过 stripNul）→ 按章节 / 条号切块（法条按 section，指南按小标题，块 300–600 token，带 2 级标题路径）
  → 嵌入（lib/llmEmbed.ts，槽位 app_config.models.embed，记账进 ai_usage）
  → Supabase：knowledge_sources / knowledge_documents / knowledge_chunks(embedding halfvec, tsv tsvector, meta jsonb)

问题（turn 路由）
  → 要不要检索？（规则：法规 / 程序 / 表格 / 权利义务类问题才检索；找房、闲聊、草稿不检索。先用关键词 + 现有 classify 槽位，不另起一次模型调用）
  → 查询改写：中文问题 → 中英双语检索词 + 省份过滤（leaseProvince / listingProvince / 用户资料）
  → 混合检索：向量 top-20 ∪ 全文 top-20 → 重排（先用 RRF，第二阶段试 Jina reranker）→ 取 top-6，约 1,500 token
  → 注入提示词「参考资料」段，每块带 [K1]…[K6] 编号 + 来源名 + 条号 + 日期
  → 模型回答必须引用 [Kn]；guardrail 新增一步：回答里出现的条号 / 指南号必须能在本轮参考资料里找到，找不到就改写成「以官方页面为准」并记 flag
  → 回执卡 read 行：「查了 RTA s.116、LTB 解释指南 8」，点开可看原文段落与链接
```

**表结构（草案）**
- `knowledge_sources(id, key, title, authority_level, province, lang, url, licence, refresh_every)`
- `knowledge_documents(id, source_id, version_hash, effective_date, consolidated_date, fetched_at, status)`
- `knowledge_chunks(id, document_id, ord, heading_path text[], section_ref, text, tokens, embedding halfvec(1024), tsv tsvector generated, meta jsonb)`
- RLS：三张表对 anon / authenticated 只读（经视图或 RPC `kb_search(query_embedding, query_text, province, k)`，SECURITY DEFINER，锁到 service_role + authenticated 调用），写入只用 service role。
- 索引：HNSW on halfvec（Micro 实例 1 GB 内存，第一批安省语料估计 2–4 万块，halfvec 把索引压到几十 MB，可行；若 12 省全量后吃紧，再考虑升 Small）。

**嵌入模型**：中文提问、英文原文，必须用多语种模型。候选（都已有密钥）：Gemini `gemini-embedding-001`、Jina `jina-embeddings-v3`（8k 上下文、多语种）、OpenAI `text-embedding-3-large`。第 0 期用同一份 golden set 离线比 hit@5 后定，槽位化（`app_config.models.embed`），换模型 = 重嵌一遍（脚本支持按 document 增量）。

## 4. 评测与守卫

- **Golden set**：先 150 条（zh / en 各半；按帽子与省份分层；来源：10-17 测试用例、`ai_usage` 里匿名化的真实问题、规则表每条规则至少 1 问）。每条标注：应命中的来源段落 + 标准答案要点 + 不该说的话。
- 指标：检索 hit@5、引用正确率（引的条号确实在返回段落里）、忠实度（LLM 评审对照段落）、拒答正确率（该说「以官方为准」的有没有说）。
- 守卫测试（vitest）：每块必有 source URL 与 section_ref；外省问题的返回段落里没有安省法条；提示词里参考资料段不超过预算；guardrail 条号核对有单测。
- 发布门槛：hit@5 ≥ 现有无检索基线明显提升、引用错误为 0 才接入生产；先只对 landlord-test / tenant-test 开 `app_config.features.kb` 标志。

## 5. 分期

| 期 | 内容 | 产出 |
|---|---|---|
| 0（约 1 周） | 语料许可逐条核对、golden set、离线评测脚本、嵌入模型对比 | `design/kb-eval-2026-11.md`、`scripts/kb/eval.mjs` |
| 1（1–2 周） | 安省核心语料入库（e-Laws 四件 + LTB 指南 / 规则 + 标准租约指南 + N 表说明 + OHRC + 多伦多条例）、三张表 + RPC、`llmEmbed`、ingest 脚本、turn 路由接入（租客 / 房东）、引用核对、回执卡、功能标志 | ship，默认只对测试号开 |
| 2 | 12 省法规原文 + 各省仲裁机构指南；经纪（TRESA / RECO）；服务商（维修标准、许可） | 全帽子、全省 |
| 3 | 判例要点：先 LTB 解释指南里引用的代表案例（官方已摘要，无需抓判决）；CanLII API 按许可条款再定；**用户自己的文件**（租约 PDF、工单、聊天记录）做个人级检索（按用户 RLS，不进公共库） | 「按我的租约第几条」能答 |
| 4 | 开放 API 第一档加 `GET /api/v1/knowledge/search`（带引用）与 MCP 工具；`/rules` 页每条规则链接到原文段落 | 对外 |

**自动更新**：GitHub Action 每月（与 `ltb-refresh.yml` 同款：schedule + workflow_dispatch，唯一 secret 不变）拉取各来源、比哈希、只重嵌变动的文档；变动进 `RULES_CHANGELOG` 候选清单由人确认后再更新规则表（规则表仍是人工单一来源）。

## 6. 成本与风险

- 嵌入成本一次性（几万块文本），每次提问多一次嵌入调用 + 约 1,500 token 的上下文，走 `ai_usage` 记账，按槽位可换便宜模型；检索关闭开关在 `app_config`。
- 风险 1：Crown copyright 材料的转载范围——处理方式是只存段落用于检索与短引，页面上展示原文不超过短引并带链接；法条本身是 OGL，可全文。
- 风险 2：中英语义漂移——查询改写双语、评测集双语，上线前看中文提问的 hit@5 不低于英文。
- 风险 3：模型仍编条款——guardrail 条号核对是硬门；回执卡让用户能点开原文自查。
- 风险 4：Micro 实例内存——halfvec + 分省分区；不够再升级，不在 Worker 上做检索。

## 7. 更新机制（用户 2026-10-27 追问：「法规和 rules 都可能随时更新」）

两层知识的更新方式不同，先分清：

| | 第二层：官方原文语料 | 第一层：结构化规则（`rules.ts` / `provinces`） |
|---|---|---|
| 谁改 | 脚本自动 | 只有人改（代码 + 守卫测试 + `RULES_CHANGELOG`），和现在一样 |
| 为什么 | 回答时引用的是原文段落，原文变了答案自然跟着变，风险低 | 规则是判断题的单一来源（合规核对、N 表日期、指导比例），错一条影响所有页面与 API，必须人看过 |
| 延迟 | 检测到即入库（小时级） | 人审 + 一次部署（ship 约 5 分钟）；法规类 7 天内，指导比例当天 |

### 7.1 监测：按来源各有信号，不靠「定期全量重抓」

- **e-Laws（安省法条与条例）**：每部法的页面有合并日期（currency date）与「最近修订」行，还有逐版本历史。监测器每周抓现行合并版，比对合并日期与**逐条（section）哈希**，只有变动的条才重切、重嵌。e-Laws 同时标出「尚未生效」的条款，照样入库但标 `in_force: false` + 生效日期。
- **提前预警**：安省议会的修法法案（名字里带「Residential Tenancies Act」的 Bill）与 Ontario Gazette 的新条例，比 e-Laws 合并早几周到几个月。监测器只记「有一条修法在路上」进审核队列，不改任何东西。
- **LTB / Tribunals Ontario**：解释指南与程序规则页面有修订日期；表格 PDF 页脚有版本号（如 N4 的新版、旧版 2026-11-30 起不收，现在是 `N4_OLD_FORMS_REJECTED_AFTER` 常量）。抓正文哈希（去掉导航），变了进队列。
- **有日历的数字**：租金指导比例（每年 6 月公布下一年）、LTB 费用表、表格版本、送达推定天数。做一张「预期变动日历」：预期日期、去哪核、对应哪个规则 id；到期前后那几天**每天**看，其余时间每周。`RENT_GUIDELINE` 已按年份存、`guidelineFor` 对未公布年份返回 `published: false`，这套继续用。
- **12 省 / 市政 / CMHC**：每月哈希比对（第二批再上）。
- **跑在哪**：GitHub Action（和 `ltb-refresh.yml` 同款，schedule + workflow_dispatch，唯一 secret 不变），不用 pg_cron——抓网页、解析 PDF、切块在 Node 里做比在 Postgres 里顺手。抓取失败不当成「没变化」，连续两轮失败才告警（沿用「外部失败不缓存」的规则）。

### 7.2 版本：只追加，不覆盖

- `knowledge_documents` 每个版本一行（`version_hash`、`consolidated_date`、`effective_from` / `effective_to`、`superseded_by`），旧版本**不删**：2024 年签的租约、2025 年送的 N4，按当时的规则判，e-Laws 的逐版本历史可以回填。
- 检索默认取现行版本；问题里带日期（租约起始日、通知送达日、`rental_matters` 的时间线）时取该日期生效的版本，并在回答里说明「按 X 年 Y 月生效的条文」。
- 「尚未生效」的段落可以被检索到，但注入时带标签「将于 X 生效」，模型只能说「从 X 起会变成…」。

### 7.3 从原文变动到规则表：人审队列，中间态自动降级

1. 监测器发现某条原文变了 → 生成一条**规则变动候选**：来源、检测时间、前后 diff、一段中文摘要（模型写，只是帮人看，不进生产）、**受影响的规则 id**（规则表每条都有 `statute` 字段，反查即可）、受影响的页面（`/rules`、`/tools`、N 表工具箱、合规核对 API）。
2. 候选进 `/admin/knowledge` 队列（后台新页，`is_stayloop_admin()` 门禁）+ 一封邮件给创始人账号；状态：待看 / 已看无影响 / 需改规则 / 已上线。每个决定留审计行。
3. **人审之前，系统自动降级而不是答错**：受影响的规则在提示词与 `/rules` 页上自动挂一句「该条所依据的 RTA s.X 于 日期 有修订，规则表待核对，以官方页面为准」（`officialLinkFor` 已有链接）。合规核对 API 对这些规则的结果加 `stale: true` 字段。候选关闭后降级句自动撤掉。
4. 人改规则：改 `rules.ts`（或 `provinces/rules.ts`）→ 加 `RULES_CHANGELOG` 条目（`/rules` 页已显示）→ 守卫测试 → ship。**不把规则搬进数据库做热更新**：规则带函数（`n4EarliestTermination`、`persistentLatePayment`），靠测试守着；一次部署 5 分钟，比热更新丢掉守卫便宜。
5. 可以**提前上线、到期生效**：给 `Rule` 加可选 `effective_from` / `effective_to`，`ruleById` 与两个合规核对函数接 `asOf` 参数（`RENT_GUIDELINE` 按年份、`N4_OLD_FORMS_REJECTED_AFTER` 按日期已经是这个思路，这是把它推广到所有规则）。6 月公布的 2028 年指导比例可以当天上线、1 月 1 日自动切换。

### 7.4 变了之后怎么告诉人

- 回答里的引用带版本日期：「RTA s.116（合并至 2026-09-01）」；`/rules` 每条规则显示「核对于 日期」。
- `RULES_CHANGELOG` 最近 90 天的条目注入助理提示词，助理能说「从 X 起这条变了」。
- 主动扫描（`/api/agent/proactive`）可选：规则变动影响到某类用户（例如 N4 表格换版、指导比例公布）时给相关房东 / 租客推一条，和现有「催租 / 到期」推送同一通道。第 2 期再定要不要。

### 7.5 更新本身也要测

- 每次语料更新后在 Action 里跑 golden set（含「2027 年指导比例是多少」这类**日期敏感题**，数据一更新答案就得变），hit@5 或引用正确率下降即不合并。
- **新鲜度守卫**：每个来源有 `refresh_every`，`fetched_at` 超期就在后台首页亮「语料过期」横幅并发告警，不静默。
- 守卫测试：规则表里每个 `statute` 都能在语料里找到对应章节；每条 `RULES_CHANGELOG` 的 `source.url` 可达；`effective_from` 在未来的规则不会出现在今天的合规核对结果里。

## 8. 有了 RAG 之后，一轮回答的路径（用户 2026-10-27 追问）

现在 `app/api/agent/turn/route.ts` 一轮是：鉴权（登录 / 匿名预览）→ 读客户端带来的记忆与文件 → `buildUserContextDetailed` 读用户数据快照 → `buildSystemPrompt`（人设 + 口语版规则 `GUIDELINE_TEXT`）→ 抓用户贴的链接 → 一次模型调用（JSON）→ `applyGuardrail` → 续约行情卡 / 找房卡 → 回执 → 返回。RAG 只在「抓链接」之后、「模型调用」之前插入一步，其余不动。

```
用户：「房东说明年要涨 4%，合法吗？」（租客帽子，租约在管，安省）

① 鉴权与快照（不变）
   登录用户 → lifecycle 快照：在管租约 1 份（2026-08-01 起，$2,450，安省），省份 = ON

② 要不要查知识库（新，确定性，不调模型）
   触发条件任一：问题含法规 / 程序 / 表格 / 权利义务类关键词（涨租、N 表、押金、驱逐、维修、通知期、违约…）
   或 上一轮已经在查（追问延续）。
   不触发：找房、写草稿、闲聊、纯数据查询（「我有几份租约」）。
   → 本例命中「涨租」→ 查

③ 先查第一层：结构化规则（已有，不变）
   `ONTARIO_RULES` 里 area=renewal 的规则 + `guidelineFor(2027)` → 2027 年指导比例 1.9%，N1 需提前 90 天
   这是判断题的答案来源，不靠检索。

④ 再查第二层：原文段落（新）
   查询改写（确定性模板，不调模型）：中文问题 + 快照事实 → 中英检索词
     「rent increase above guideline / 涨租 超过指导比例 / RTA s.120 s.126 / N1 N2」
   过滤：province = ON、in_force = true（或按租约日期取当时版本）
   混合召回：向量 top-20 ∪ 全文 top-20 → RRF 重排 → 取 top-6，≤ 1,500 token
   本例返回：RTA s.120（指导比例）、s.126（超额涨租申请 AGI）、s.116（90 天通知）、LTB 解释指南 10（AGI）、标准租约指南「涨租」小节、安省住房厅 2027 年指导比例公告

⑤ 组提示词（改一处）
   system = 人设 + 口语规则 + 【参考资料】
     [K1] RTA s.120 · 合并至 2026-09-01 · https://…  「…」
     [K2] RTA s.126 · … 
     …
   规则：回答只能引用 [Kn]；条号只许写参考资料里出现过的；没有依据就说「以官方页面为准」。
   预算：参考资料段占总 prompt 不超过约 1/3，超了按权威等级从低到高裁。

⑥ 一次模型调用（不变）
   仍是一次 JSON 输出，不多调一次。多的只是输入 token。

⑦ 守卫（加一步）
   现有：歧视、越权、外省术语、「实时」措辞、去「办完了」
   新增：条号核对——回答里出现的 s.xxx / 指南编号 / 表格号 若不在本轮 [K] 里 → 改写为「具体条文以官方页面为准」并记 flag `kb_uncited`
   新增：引用展开——把 [K1] 换成可点的来源名 + 链接（页面上是小字引用，不是脚注墙）

⑧ 回执（加一行）
   read: 「查了 RTA s.120 / s.126 / s.116、LTB 解释指南 10（合并至 2026-09-01）」 → 点开看原文段落
   did: 不变（出卡 / 草稿 / 无）

⑨ 返回与渲染
   回答示例：「4% 超过 2027 年的指导比例 1.9%。房东要涨超过指导比例只能向 LTB 申请（RTA s.126），
   且不论涨多少都要提前 90 天用 N1 书面通知（s.116）。你的租约 2026-08-01 起，最早的涨租生效日是 2027-08-01。
   参考：RTA s.120、s.126、s.116；LTB 解释指南 10。」
   最后一行按现行收尾规则：这轮不等确认、不缺信息 → 不写收尾句。
```

**几个边界**
- 匿名预览也能查第二层（公开法规），但不读用户快照，和现在一样。
- 外省用户：② 的触发一样，③ 用 `lib/provinces/`，④ 过滤 province = 该省，参考资料里不会有 RTA。
- 查不到（召回分数低于阈值）：不注入空段落，提示词改为「本轮没有找到对应原文，只按规则表回答，并提醒用户核对官方页面」，回执写「没查到对应原文」，不装作查到了。
- 延迟：多一次嵌入调用（几十毫秒）+ 一次 RPC（pgvector HNSW，几十毫秒）+ 输入 token 变多；目标整轮增加 < 300 ms。检索在 Worker 里调 Supabase RPC，不在 Worker 内存里放索引。
- 成本：每次命中 ② 多约 1,500 input token；不命中零成本。按槽位记进 `ai_usage`（kind = `embed`）。
