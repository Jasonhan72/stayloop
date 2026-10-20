# 银行验证（Flinks）生产接入清单

日期：2026-10-19 · 现状依据：代码 `lib/verify/providers/flinks.ts`、`app/api/verify/[token]/{start,bank}`、`app/verify/[token]/page.tsx`；审计 `design/verification-flows-audit-2026-09.md`；Flinks 官方文档（链接在文末）。

## 现状

- 链路代码已完整：申请人在 `/verify/<token>` 同意后，页面嵌 Flinks Connect（iframe），拿到 `loginId` 由服务端换 90 天流水，只存确定性摘要（机构、末四位、持有人、余额、循环入账、月收入估算、NSF 次数），原始交易不落库。结果进评分时，银行核验收入优先于工资单推算的收入。
- 生产没开：Worker 上没有任何 `FLINKS_*`，银行这一步显示「未开通」。不配置时代码默认走 Flinks 公共沙箱（`toolbox`），结果打「沙箱数据 · 不计分」。
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

## 二、拿到凭证后代码侧要做的

### A. 配置（拿到凭证当天）

- 密钥：`FLINKS_INSTANCE`、`FLINKS_CUSTOMER_ID`、`FLINKS_AUTH_KEY`、`FLINKS_API_SECRET`；API 域名不是 `<instance>-api.private.fin.ag` 时加 `FLINKS_API_BASE`。先写进 `.env.local`，再把这几个键加进 `scripts/worker-secrets-sync.sh` 的清单，由你在终端跑同步脚本。
- iframe 域名不是 `<instance>-iframe.private.fin.ag` 时设 `NEXT_PUBLIC_FLINKS_CONNECT_URL`。它是 `NEXT_PUBLIC_*`，要写进 `.env.local`、在本机构建时内联，Worker 上设了不生效。
- 配好后实例名不再是 `toolbox`，`sandbox` 自动变成 false，结果开始计分；完成判定会自动把银行这一步算进去。

### B. 上线前必须补的（09-12 审计提出，10-19 复核仍未做；用沙箱就能先做）

1. **postMessage 校验来源**：页面收到 `REDIRECT` 事件时没检查 `e.origin`。要只接受 Connect iframe 域名发来的消息，防止伪造 `loginId`。
2. **读完就删连接**：摘要算完后调用 Flinks `DeleteCard`。按 Flinks 的说法，`loginId` 不会过期、凭它可以再次拉数据，留着就等于长期访问权。库里不再明文存 `loginId`（现在写在 `steps.bank.session_id`），改存哈希或不存。
3. **公共 token 路由限流**：`/start`、`/bank` 现在没有限流，按 token、按 IP 都要加，防止有人刷 Flinks 的计费调用。按项目规则，成本类限流 fail-open，但要有全站总闸。
4. **保留期限**：银行摘要、持有人、余额目前无限期保留（`verification_requests.steps` 和 `screenings.verification` 各存一份）。要定期限、加清理 job，并和隐私页、`/my-file` 消费者档案对齐。
5. **审计事件**：授权、读取成功、读取失败、DeleteCard 都写进 `agent_audit_events`。
6. **长耗时读取**：现在在一次请求里最多轮询 6 次 × 3 秒，大银行可能读不完就失败，用户关页面也会中断。改成先存 RequestId，由页面轮询一个状态接口（或接第 7 项的 webhook）。
7. **Flinks 错误码的提示**：例如 `CARD_IN_USE`，以及银行要求补充验证、读取超时等情况，给申请人看得懂的提示，不要只显示 502。

### C. 上线验证

1. 沙箱回归：B 项改完后在 `toolbox` 实例走完整流程，确认 origin 校验、DeleteCard、限流、审计都生效。
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
