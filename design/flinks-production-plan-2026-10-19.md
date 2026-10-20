# 银行验证（Flinks）生产接入清单

日期：2026-10-19 · 现状依据：代码 `lib/verify/providers/flinks.ts`、`app/api/verify/[token]/{start,bank}`、`app/verify/[token]/page.tsx`；审计 `design/verification-flows-audit-2026-09.md`；Flinks 官方文档（链接在文末）。

## 现状

- 链路代码已完整：申请人在 `/verify/<token>` 同意后，页面嵌 Flinks Connect（iframe），拿到 `loginId` 由服务端换 90 天流水，只存确定性摘要（机构、末四位、持有人、余额、循环入账、月收入估算、NSF 次数），原始交易不落库。结果进评分时，银行核验收入优先于工资单推算的收入。
- 生产没开：Worker 上没有任何 `FLINKS_*`，银行这一步显示「未开通」。不配实例名时代码默认走 Flinks 公共沙箱（`toolbox`），结果打「沙箱数据 · 不计分」；但**沙箱也要 Flinks 发的 `FLINKS_AUTH_KEY` / `FLINKS_API_SECRET`**（帮助页上的公开 token 已失效），所以没有凭证时连沙箱也跑不起来。
- 生产上 `verification_requests` 只有 09-12 的 1 行，银行这一步从没真实跑过。

## 一、要你去办的外部事项（按顺序）

1. **签合同、开生产实例**（找 Flinks 销售 / 客户代表）。说明用途：申请人本人授权、只读近 90 天、用于租房申请的收入与余额核验；报一个预计月量。要问清的：
   - 计费方式（按连接还是按请求）、有没有最低消费；
   - 调用 DeleteCard 删掉连接后还计不计费；
   - 生产实例的 authorize token、白名单是否要重新配一遍（官方文档没写清）。
2. **在 Dashboard 拿凭证**（Settings → 选生产实例）：实例名（instance）、Customer ID、API 域名、Connect iframe 域名、`flinks-auth-key`（只用于生成 Connect 要的短效 Authorize Token）、`x-api-key`（API secret）。如果 Flinks 给的是 Bearer 方式，也一起记下。
3. **让 Flinks 把我们的回跳域名加白名单**：`www.stayloop.ai`。完整回跳地址是 `https://www.stayloop.ai/verify/<token>?step=bank&returned=1`。不加白名单 Connect 可能加载失败，走 OAuth 的银行也跳不回来。
4. **确认 API 不做 IP 白名单**：网站现在跑在 Cloudflare Workers 上，没有固定的出口 IP。如果 Flinks 要求按 IP 放行 API 调用，就是阻断项，要提前谈（例如请他们只对 Dashboard 登录开 IP 白名单）。
5. **律师确认一句话**：「申请人本人授权，把银行摘要交给他指定的这位房东」符合《消费者报告法》s.8(1)(b) 的形态。`design/cra-compliance-without-registration-2026-10.md` 里这条标着「仍要律师确认」。
6. **问清 Flinks 自己的数据保留**：调用 DeleteCard 后删哪些数据、备份保留多久（官方 FAQ 和安全页的说法不一致），答复要写进隐私页。
7. **（可选）登记 webhook**：Flinks 可以在数据读完后推送 `GetAccountsDetail` 结果，要开支持工单并指明生产实例；沙箱里测不了。可以先不做，沿用现在的轮询。
8. **准备一个真实银行账户做首次生产验证**：需要你本人在 `/verify/<token>` 走一遍（我不能替你登录网银）。
9. **顺带要一套沙箱凭证**：有了它，上线前可以先在沙箱实例走一遍真实往返（见下文 C.1）。

## 二、拿到凭证后代码侧要做的

### A. 配置（拿到凭证当天）

- 密钥：`FLINKS_INSTANCE`、`FLINKS_CUSTOMER_ID`、`FLINKS_AUTH_KEY`、`FLINKS_API_SECRET`；API 域名不是 `<instance>-api.private.fin.ag` 时加 `FLINKS_API_BASE`。写进 `.env.local` 后由你在终端跑 `bash scripts/worker-secrets-sync.sh`——这几个键已列在脚本的可选清单里（10-19），`.env.local` 有就同步。
- iframe 域名不是 `<instance>-iframe.private.fin.ag` 时设 `NEXT_PUBLIC_FLINKS_CONNECT_URL`。它是 `NEXT_PUBLIC_*`，要写进 `.env.local`、在本机构建时内联，Worker 上设了不生效。
- 配好后实例名不再是 `toolbox`，`sandbox` 自动变成 false，结果开始计分；完成判定会自动把银行这一步算进去。

### B. 上线前必须补的（09-12 审计提出）——**10-19 已全部完成并上线**

实现：`lib/verify/bankFlow.ts`（读取 / 续跑 / DeleteCard / 清理）、`lib/verify/bankErrors.ts`、`lib/verify/bankMessage.ts`、`lib/verify/limits.ts`、`app/api/verify/[token]/bank/poll`、`app/api/cron/verify-sweep`（pg_cron `verify-sweep` 每小时 :50）、迁移 `20261019_verify_bank_hardening.sql`；测试 `tests/verifyBankHardening20261019.spec.ts`（模拟 Flinks 响应，没有真实往返——见 C.1）。逐项：


1. ✅ **postMessage 校验来源**：只接受 Connect iframe 自己的 origin、`REDIRECT` 事件、格式正确的 loginId（`connectRedirectLoginId`）。
2. ✅ **读完就删连接**：摘要存好就调 `DeleteCard`；刚授权完 Flinks 常回 `CARD_IN_USE`，请求内重试一次，仍失败就记进只有 service role 能读的 `verification_bank_reads`（phase `delete`），由每小时的清理任务补删。`verification_requests`（房东可读）里不再有 loginId，只留 `login_ref`（sha256 前 16 位）；迁移已清掉旧行里的 `session_id`。
3. ✅ **公共 token 路由限流**：`/start`、`/bank`、`/bank/poll` 各自按 token、按 IP、全站三档计数（`VERIFY_LIMITS`），fail-open。
4. ✅ **保留期限**：`verification_requests` 的明细 90 天后只留状态（`purgeVerificationDetails`，默认 90 天，**天数待你确认**）。`screenings.verification` 那份是筛查自己的记录（筛查模块，未动），随筛查删除。隐私页已写明。副作用：护照接口 `/api/v1/passport/verify` 90 天后仍会答「银行已核验」，但收入估算、NSF 次数变成空。
5. ✅ **审计事件**：`verify_bank_authorized / verify_bank_read / verify_bank_failed / verify_bank_connection_deleted / verify_bank_delete_deferred`，元数据只有 `login_ref`、沙箱标记、账户数、错误码。
6. ✅ **长耗时读取**：首次读取回 202 就把 RequestId 存起来，页面每 5 秒调 `/bank/poll`（约 10 分钟），关掉页面由每小时的清理任务续跑，2 小时还没读完判超时（`READ_TIMEOUT`）。
7. ✅ **Flinks 错误码的提示**：按 Flinks 官方错误码表给中英文提示（`bankErrorInfo`），未知错误给通用提示；页面不再显示原始报错。

### C. 上线验证

1. 沙箱回归（**等拿到沙箱凭证**）：在 `toolbox` 实例走完整流程，确认 Connect 的 origin、DeleteCard 的真实返回、202 续跑、审计都生效。特别要核对两处我按文档推断、没实测过的细节：错误响应里错误码字段叫 `FlinksCode`；DeleteCard 是 `DELETE …/BankingServices/DeleteCard/{loginId}`。
2. 配生产凭证 → 部署 → 你用本人账户走一次：确认结果 `sandbox:false`、进评分、报告里显示「银行 ✓」，库里没有原始流水和明文 `loginId`，Flinks 那边连接已删除。
3. 更新 CLAUDE.md 的「待外部」一行和隐私页的保留说明。

## 来源

- Flinks Connect 参数（redirectUrl 白名单）：https://docs.flinks.com/docs/parameters
- Getting Started with Connect（DeleteCard、OAuth 回跳）：https://docs.flinks.com/guides/connect/getting-started
- Authorize Token：https://docs.flinks.com/api/authorize/getting-started
- Event Listener（REDIRECT 事件、loginId 的保管）：https://docs.flinks.com/docs/events
- Retrieve Account Data（loginId 不过期）：https://docs.flinks.com/guides/connect/retrieve-account-data
- Webhooks：https://docs.flinks.com/api/connect/webhooks
- 凭证位置：https://help.flinks.com/support/solutions/articles/43000646259-fetching-your-api-credentials
- 数据保留 FAQ：https://help.flinks.com/support/solutions/articles/43000681817-for-how-long-flinks-holds-data-and-ids-
- IP 白名单：https://help.flinks.com/support/solutions/articles/43000674250-2fa-ip-whitelisting
