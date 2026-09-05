# 租客授权核验链路（2026-09-04 · 竞品对照 P0-2 / P0-3 / P1-1）

## 一句话

房东在一条筛查记录上点「邀请申请人核验」→ 生成一条以 token 为凭证的公开链接
`/verify/<token>` → 申请人本人在链接里**先同意、再授权**三件事：身份（Veriff 活体 +
证件）、银行流水（Flinks Connect 直连）、征信（本人授权直拉，供应商待签）→ 结果回落
到该筛查，进评分与报告，标为「第三方核验事实」而不是「模型推断」。

## 为什么是这个形状

- **申请人自己授权，不是房东替他取**：liv.rent 的免注册路径。我们仍是「帮申请人把
  自己的证据交给房东的平台」，不变成《消费者报告法》意义上的报告机构（法务节声明不动）。
- **三步共用一条同意流**：同意文本 v1 一次说清目的、内容、谁看、保留多久、如何撤回；
  每一步各自可跳过，跳过=事实缺失，评分照旧走文件推断（取证层不变）。
- **付费门与深度核查同一扇**：Pro 或该筛查已单次解锁才能发起（供应商按次收费）。

## 数据

`verification_requests`（迁移 `20260904_verification_requests.sql`）：token 唯一、
screening_id、landlord_id、tenant_name/email、status
（pending / consented / complete / expired / declined）、consent jsonb、
steps jsonb `{ id | bank | credit → { status, provider, session_id, result, updated_at } }`、
expires_at（7 天）。RLS：房东只读自己的行；**所有写入走服务端 service role**，公开页
只通过 `/api/verify/<token>` 拿脱敏状态。完成后快照写到 `screenings.verification`。

## 供应商（全部 env 门控，缺 key = 该步显示「未开通」）

| 步 | 供应商 | 沙箱 | env |
|---|---|---|---|
| 身份 | Veriff（托管会话 URL，决策 webhook HMAC-SHA256） | 注册即有 test integration | `VERIFF_API_KEY` `VERIFF_SECRET_KEY` |
| 银行 | Flinks Connect（iframe → loginId → Authorize → GetAccountsDetail，Days90） | 公共 toolbox 沙箱，无需账号 | `FLINKS_INSTANCE` `FLINKS_CUSTOMER_ID` `FLINKS_API_BASE` `NEXT_PUBLIC_FLINKS_CONNECT_URL` |
| 征信 | 本人授权直拉（待签供应商） | — | `CREDIT_PULL_PROVIDER`（未设=未开通） |

沙箱结果一律带 `sandbox: true`，UI 打「沙箱数据」标，评分层**不采信**沙箱结果。

## 结果如何进评分（第三阶段）

- 银行：`lib/verify/income.ts` 确定性识别循环入账（同一对方、7–35 天间隔、≥2 次）→
  月均工资入账、账户持有人、期末余额、NSF 次数。进 `ability_to_pay` 的收入事实；
  持有人 ≠ 申请人则按现有「非本人账户」规则处理。
- 身份：Veriff approved + 姓名/生日与文件一致 → `verification` 维度的事实项；declined
  → 硬标记。
- 报告页：核验事实单独成「已核验」栏，与「文件推断」分列——这就是 P1-2 的第一步。
