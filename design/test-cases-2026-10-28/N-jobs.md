# N · 定时任务与自动化（2026-10-28）

风险 R3。依据：CLAUDE.md「数据库与迁移」（8 个 pg_cron + 3 个 GitHub Actions）、「知识库（RAG）」（`kb-refresh.yml` 每周一）、`design/history/2026-10.md` 10-26「月度简报」（`agent_routines` kind `monthly_brief`）。
方法：Supabase MCP `execute_sql` 只读；`gh run list / gh run view --log-failed`。测试员 ④（HIJNL 组）。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| N-01 | R3 | — | `cron.job` 全部行 | CLAUDE.md 列的 8 个任务都在且 active；多出来的任务要能解释 | — |
| N-02 | R3 | — | 每个任务最近一次 `cron.job_run_details` | 全部 `succeeded`；日任务近 3 天每次都成功 | — |
| N-03 | R3 | — | `net._http_response` 最近 10 条 | 全 200，无 5xx / timeout | — |
| N-04 | R3 | gh 已登录 | `gh run list --limit 12` | 最近运行 success；失败的要有已知原因与修复 | — |
| N-05 | R3 | — | `agent_routines` 按 kind 计数 | 有 `monthly_brief` 行（10-26 上线） | batch1Cards20261026 |
| N-06 | R3 | — | `model_catalog` 近 7 天新增、周一 model-discover 运行 | 10-26 周一跑过，有新增；失败模型记原因 | modelAutoDiscover |
| N-07 | R3 | — | 知识库刷新状态：`knowledge_sources / knowledge_chunks / knowledge_documents.max(fetched_at) / knowledge_changes pending` | 46 份来源、块数 ≥ 1,318、本周有抓取、pending 队列可解释 | kb20261027 |
| N-08 | R3 | — | `ai_usage` 近 30 天 `ok=false` | 只有 `slot=test`（模型目录探测）或已知的 402 / 429；`turn` 槽无失败 | — |

## 执行记录（2026-10-28 18:30–18:50 UTC · 生产 · 只读）

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| N-01 | `cron.job` **9 条**全部 active：agent-proactive-daily `0 13`、delegation-expiry-sweep `15 13`、agent-registration-sweep `20 13`、screening-stuck-sweep `25 13`、anon-rate-limit-cleanup `30 13`、household-lease-promote `5 5`、model-discover-weekly `40 13 * * 1`、verify-sweep `50 * * * *`，另有 **`agent-routines-sweep` `10 * * * *`（jobid 14，每小时，跑 `/api/cron/agent-routines`，10-25 例行任务上线时加的）**——CLAUDE.md「8 个 pg_cron」没有列它（见 N-D1 文档缺陷） | SQL | 通过（文档待补） |
| N-02 | 9 个任务最近一次全部 `succeeded`（10-28 05:05 / 13:00 / 13:15 / 13:20 / 13:25 / 13:30、17:50、18:10；model-discover 10-26 13:40）；六个日任务 10-26/27/28 共 18 次全部 succeeded，耗时 0.00–0.05 s | SQL | 通过 |
| N-03 | 最近 10 条 `net._http_response`（10-28 13:50–18:10）全部 **200**：agent-routines `{"ran":0,"results":[]}`（每小时）、verify-sweep `{"ok":true,"bank":null,"purged":0}` 交替；无 5xx | SQL | 通过 |
| N-04 | `gh run list`：10-28 18:30 `Knowledge base refresh`（workflow_dispatch）**success**；**10-26 13:27 `Knowledge base refresh`（schedule）failure**——`--log-failed` 显示 `ENOENT: open '.env.local'`（`scripts/kb/eval.ts` 在 CI 没有 `.env.local` 时读文件崩掉），仓库 `53efbfe` 已修（try/catch），10-28 的手动运行通过，下一次周一 11-02 06:30 UTC 自动验证；10-15 rent-benchmarks / 10-05 CA corp registry / 10-03 LTB 三个月度 Action 全部 success | `gh run list`、`gh run view 40330740308 --log-failed` | 通过（10-26 失败已修，待 11-02 复核） |
| N-05 | `agent_routines`：`monthly_brief` 1 行（landlord-test，10-25 建，enabled）、`renewal_window_check` 1 行；模块 I 里「现在运行」后 `last_run_at` 更新到 10-28 18:42、`last_result.count=2` | SQL + I-15 | 通过 |
| N-06 | `model_catalog` 近 7 天新增 8 行，最新 10-26 13:40:29（与 model-discover-weekly 10-26 13:40 一致）；`ai_usage slot=test` 里同一分钟有 5 条 `ok=false`（stepfun / MiniMax / kimi-k3.1：400「product not activated」、429 overloaded）= 探测失败项如实记录 | SQL | 通过 |
| N-07 | `knowledge_sources` 46、`knowledge_chunks` 1,318、`knowledge_documents.max(fetched_at)` = 10-28 18:30:48（就是 N-04 那次手动刷新）、`knowledge_changes` pending 0；`app_config.kb` = `enabled:true, audience:all, top_k 6, max_chars 6000, gemini-embedding-001 1024 维` | SQL | 通过 |
| N-08 | 近 30 天 `ok=false` 只有 `slot=test`（10-26 模型探测 ×5、10-24 deepseek-v4-flash 402）；`turn` 槽无 `ok=false`。**但** `turn` 槽有「ok=true 却 output_tokens≈156」的空回复（tenant-test 10-28 18:41、18:43 两次，见 I-D1）——记账口径看不出模型输出格式失败 | SQL | 通过（口径见 I-D1 备注） |

**汇总**：8 条全部执行，8 通过；缺陷 1（文档）。

## 缺陷

- **N-D1 · S3 / P3 · 文档**：CLAUDE.md「数据库与迁移」写「8 个 pg_cron」，生产实际 9 个（多 `agent-routines-sweep` 每小时 :10，10-25 例行任务上线时加）。建议补一行。
- 观察（非缺陷，已修待验）：`kb-refresh.yml` 10-26 周一首跑失败（eval 脚本读 `.env.local`），`53efbfe` 已修；10-28 手动跑成功。11-02 周一那次要再看一眼。

## 越界发现

- `ai_usage` 对「模型返回了但解析不出 JSON」的 turn 记 `ok=true`（只有 156 个输出 token），后台用量页看不出这类失败；建议 turn 路由在走 fallbackReply 时给 `ai_usage` 或审计加一个标记（见 I-D1）。

## 数据副作用

无（全部只读；`gh run list` 只读）。
