# N · 定时任务与通知（2026-10-17）

风险 R3（运维 T8）。依据：CLAUDE.md「Scheduled Jobs」「模型目录：每周自动发现」「Realtor.ca 导入房源自动下架」（已 unschedule）「V0.6 收尾」RECO 日扫、「节点 3」证照提醒、「外省租约…委托到期日扫」「V1.0 阶段 1」回访邮件、「V0.8」、「Muse 手机端」Web Push、「租金基准换源」GitHub Actions。
方法：Supabase MCP `execute_sql` 只读；`gh run list`；tenant-test JWT 调 `/api/push/test` 一次；Resend API 只读状态（不看内容）。

## 用例

| ID | 风险 | 前置 | 步骤 | 期望 | 守卫 |
|---|---|---|---|---|---|
| N-01 | R3 | — | `select jobname, schedule, active from cron.job` | 7 条活跃：agent-proactive-daily 13:00 · agent-registration-sweep 13:20 · screening-stuck-sweep 13:25 · anon-rate-cleanup 13:30 · delegation-expiry-sweep 13:15 · household-lease-promote 05:05 · model-discover-weekly 周一 13:40；`realtor-freshness` / `trreb-rent-refresh` **不在** | — |
| N-02 | R3 | — | `cron.job_run_details` 每任务最近 3 次 | status succeeded；耗时合理（<60s） | — |
| N-03 | R3 | — | `net._http_response` 最近 20 条 | 状态码 200（cron 调 `/api/agent/proactive` 等）；无连续 5xx | — |
| N-04 | R3 | gh 登录 | `gh run list --workflow` ltb-refresh / refresh-ca-corp-registry / rent-benchmarks-refresh 最近 3 次 | 最近一次 success（或 schedule 尚未到期则记录） | — |
| N-05 | R3 | — | 刷新日期：`ltb_ingest_runs` 最新、`ca_corp_registry max(last_seen_at)`、`rent_benchmarks` 最新 period / loaded_at | LTB ≤ 2026-10-03 那次；联邦 ≤ 10-05；基准 10-13/15 | — |
| N-06 | R3 | — | `model_catalog` 最近自动加入（note 含 cron / created_at 近 7 天） | 10-12 首跑 32 条可见；下一次周一 10-19 | modelAutoDiscover |
| N-07 | R3 | — | `landlord_followups` 行 + 对应审计 `landlord_followup_emailed` | 行数 ≥0；stage ∈ d3/d14；无测试号 | v1stage1_followUp |
| N-08 | R3 | tenant-test JWT | `push_subscriptions` 该用户行；`POST /api/push/test` 一次 | 200 + `sent` 数；无订阅时如实返回 0 | webPush |
| N-09 | R3 | RESEND_API_KEY | `GET https://api.resend.com/emails` 最近 20 封（只看 `last_event` / `to` 域 / `created_at`） | 近 7 天无 bounced/complained；suppressed 记录 | — |
| N-10 | R3 | — | `/api/agent/proactive` 无密钥 / 错密钥 | 401；`/api/cron/model-discover` 无密钥 401；`/api/cron/realtor-freshness` 错密钥 401（有密钥时 `disabled:true`，不发） | realtorReadsOff |
| N-11 | R3 | — | Vault `cron_secret` 存在（只查 name，不取值）；pg_cron job 命令里引用 vault 而非明文 | 命令不含明文密钥 | — |

## 执行记录（2026-10-17 晚 · 生产 · Supabase MCP 只读 SQL、`gh run list`、curl；原始输出 `sitetest1017/N/`）

| ID | 实际 | 证据 | 结果 |
|---|---|---|---|
| N-01 | `cron.job` 7 条全部 active：agent-proactive-daily `0 13 * * *`、anon-rate-limit-cleanup `30 13`、agent-registration-sweep `20 13`、household-lease-promote `5 5`、screening-stuck-sweep `25 13`、delegation-expiry-sweep `15 13`、model-discover-weekly `40 13 * * 1`；**无** realtor-freshness / trreb-rent-refresh | SQL | 通过 |
| N-02 | 六个日任务最近 3 次（10-15/16/17）全部 `succeeded`，耗时 0.00–0.06s（http_post 只入队；函数类直接完成）；`model-discover-weekly`（jobid 12，10-12 建）尚无运行记录——首次应在周一 2026-10-19 13:40 UTC | SQL | 通过（model-discover 待 10-19 复核） |
| N-03 | `net._http_response` 只剩 1 行（pg_net 默认 6 小时清理）：id 270，10-17 13:00 UTC，**200**，体 `{created:0, mode:cron, marketplace:{overdue 0,cards 0,reminders 0}, followups:{sent 0, skipped 5, reasons:{too_old 1, already_sent 2, test_account 2}}, rent:{tenant_pushed 0, overdue_cards 0, expired 0, skipped 0}}`，无 error / timeout | SQL | 通过 |
| N-04 | `ltb-refresh.yml`：10-03 schedule success（09-19 dispatch success，09-03 failure 为 09-19 已修的 lockfile 问题）；`refresh-ca-corp-registry.yml`：10-05 schedule success；`rent-benchmarks-refresh.yml`：10-15 schedule success | gh | 通过 |
| N-05 | `ltb_ingest_runs` 最新 id 7：10-03 12:25→12:26 ok，176,146 行 / 49,269 份判令，覆盖 2025-01-08 ～ 2026-06-30；`ltb_orders` 估计 176,146 一致；`ca_corp_registry max(last_seen_at)` 2026-10-05 13:12，≈1.60M 行；`rent_benchmarks` statcan 120 行至 2026-04、cmhc 208 行至 2025-10，loaded 10-13（10-15 的 Actions 运行 success，数据无新季度——统计局 2026-Q3 未发布，按设计不变） | SQL | 通过 |
| N-06 | `model_catalog` 近 8 天 32 行 created 2026-10-12、note 含「自动发现 2026-10-12」；失败项（gemini-2.5 ×3、ZHIPU ×2、kimi/kimi-k2.8、vanchin）enabled=false 并写 404 原因；SQL 总 56 / enabled 49 / user_selectable 46 | SQL | 通过 |
| N-07 | `landlord_followups` 2 行（stage d14，10-16 03:11，两位真实房东 gmail / hotmail，`test_account` false）；审计 `landlord_followup_emailed` 2 条；Resend 10-16 03:11 两封「还没录入租约？…」`delivered`；今日 cron 跳过 5（too_old 1 / already_sent 2 / test_account 2）与规则一致 | SQL + Resend | 通过 |
| N-08 | tenant-test 无 `push_subscriptions` 行（全站 3 行、0 禁用）；`POST /api/push/test`（tenant-test JWT）→ 200 `{"ok":true,"sent":0}` 如实 | N/push.body | 通过 |
| N-09 | Resend 最近 20 封：delivered 4（全部 gmail / hotmail 真实地址）、**suppressed 16（全部含 `@stayloop.ai` 测试地址）**；无 bounced / complained。被压制的包括 E 组需要的「确认是你 · 查看我的筛查档案」、申请 / 派单 / 争议通知，以及两封发给 **jasonhan72@gmail.com + admin@stayloop.ai** 的管理员告警（「消费者档案请求需要处理」「收到一条争议」）整封标 suppressed | N/resend.txt（只记状态与域名） | 失败 → N-D1 |
| N-10 | `/api/agent/proactive`、`/api/cron/model-discover`、`/api/cron/realtor-freshness` 无密钥 / 错密钥 均 401 | curl | 通过（正确密钥未发，避免触发真实扫描） |
| N-11 | `vault.secrets` 有 `cron_secret`；`cron.job` 两条 http_post 命令都用 `(select decrypted_secret from vault…)`，正则扫描无明文 20+ 位密钥 | SQL | 通过 |

**汇总**：11 条全部执行，10 通过，1 失败（N-09），缺陷 1。

### 缺陷
- **N-D1（S2 / P1）** 发往 `*@stayloop.ai` 测试邮箱的所有邮件在 Resend 被 `suppressed`（最近 20 封里 16 封），而且与真实收件人同一封的管理员告警也整封标 suppressed——「消费者档案请求需要处理 · 742e319e」（10-18 03:29 UTC）和「收到一条争议 · 1bf8ea0c」（10-17 21:25 UTC）的 `to` 是 jasonhan72@gmail.com + admin@stayloop.ai。影响：① 依赖邮件链接的流程（消费者档案「确认是你」、委托确认、租约签署、在管租约邀请）对测试号全部不可达，其他组只能从库里取 token；② 管理员告警若因共收件人被压制，真实的 s.12 / s.13 请求 48 小时时限可能无人收到。复现：`GET https://api.resend.com/emails`（只读）看 `last_event`。建议：在 Resend 控制台清掉 `*@stayloop.ai` 测试地址的 suppression（10-13 后多次 bounce 导致），并把管理员告警改为每个收件人单独一封（一人被压制不连累另一人）或在发送回执里记录 per-recipient 状态。此条**越界**部分（E / F / J 组流程）请主线程归并。

### 越界发现
- `tenant-test@stayloop.ai` 在 2026-10-18 UTC 多了一行 `landlords`（`4161c2c8…`），后台用户表标它 landlord——是本轮某测试员开通的；README 把它描述为纯租客，其他模块按「纯租客」设计的用例（筛查角色门、`/landlord/become` 跳转）会受影响，建议测完删除该行。
- `/admin/usage` 的 By model 表里新加入的 32 个模型全部 unpriced（CLAUDE.md 10-12 已记为待办，用户定「以后再研究定价」），本周成本汇总因此偏低；非本轮缺陷。

### 数据副作用
- `/api/push/test` 一次（tenant-test，无订阅，未推送）。
- admin@ 三次魔法链接登录（审计页面打开事件）。
- 无其他写入。
