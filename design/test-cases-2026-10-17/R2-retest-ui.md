# R2 复测 · 页面层（2026-10-18 凌晨，生产 www.stayloop.ai，桌面 1280）

脚本与截图：`scratchpad/sitetest1017/R2/`（t1*.mjs … t7*.mjs，`t*-*.png`）。

| 缺陷 | 步骤 | 实际 | 证据 | 结论 |
|---|---|---|---|---|
| B-D1 | 首页，点「›」/「‹」/切身份后立刻空提交（拦住 AI 请求，只记 pushState 的目标） | 三种操作发出的 prompt 都与当时输入框里看到的示例一致、身份为当前身份；自动轮换（6 秒）后 0.5 秒内空提交发的是轮换前那条（设计如此） | t1.mjs / t1b.mjs 输出，t1-next/prev/rolechange.png | 已修复 |
| D-07 | 未登录，`/apply/test-200-test-qa-lane-qa2` 姓名 `[TEST] Retest`、邮箱 tenant-test+r2@stayloop.ai、勾第一个同意、真实提交 | `POST /rest/v1/applications` 201，出「✓ 申请已提交」，`/api/notify-landlord` 200，无 42501 | t2b.mjs，t2-filled.png / t2-after.png | 已修复 |
| D-F-04 | tenant-test 登录 `/tenant/payments`；对照 `/h/1c9abb72…?tab=rent` | 「MY RENT」列出 4 期：11-01「Due · not recorded」、10-01 与 09-01 已记录、08-01「Overdue · not recorded」；`/h` 也是这 4 期（11-01 / 10-01 / 09-01 / 08-01），期数一致。本次是英文界面，标签为英文，中文串未直接看到 | t3-payments.png、t3-h-rent.png | 已修复（中文标签未看，英文标签符合） |
| D-F-01 | landlord-test `/landlord/notices` → 选租约 → 选 N4，读「送达日」默认值 | 当前真实时间多伦多与 UTC 同为 10-18，无法区分，故把页面 Date 平移到 UTC 2026-10-18 01:00（多伦多 10-17 21:00）重测：默认值 2026-10-17（旧逻辑会是 10-18）。真实时间下 `TZ=America/Toronto date +%F` = 2026-10-18 = 页面默认值 | t4c.mjs，t4-real.png / t4-shim.png | 已修复 |
| E-D2 | landlord-test 打开 `[TEST] Second Applicant`（6dfc8aa7…，申请人邮箱为测试号别名）→「Approve · draft the notice」→ 卡上「Approve · Execute for me」 | 批准后没有发信：出现黄条「Acceptance notice approved but not sent yet. Just approved and still inside the 60-second undo window…」，带「Send now」「Withdraw this notice」；点撤回后黄条消失，提示「The acceptance notice was not sent and the application's decision is unchanged」。网络里没有 `/api/agent/execute`；库里 `send_decision` 行 status=expired、executed_at 为空，application 仍 `new`、`decision_notified_at` 为空 | t5e.mjs，t5-approved.png / t5-withdrawn.png | 已修复 |
| I-D1 | 未登录 `/landlord/agent` 发「帮我发一个房源：28 Avondale Ave #1203，1+1，$2450，11 月 1 日」（共跑 3 次，见下） | 草稿卡可见描述三次均为「28 Avondale Ave #1203, 1 Bedroom + Den(condo). Available November 1…」，没有采光 / 朝向 / 地段 / 装修年份；回复里是「发布前补几项」的提问。但卡片描述在 DOM 里就被截断，看不到全文（编辑需登录）。新出现：第 3 次卡片多了「1 浴」，并标「Willowdale · North York」（用户没说卫浴数；社区名由地址推出） | t6.mjs / t6b.mjs / t6c.mjs，t6-landlord-agent.png、t6-edit.png | 部分（可见部分已修复；全文未能核对） |
| I-D2 | 找房回复不再说「实时」 | 没有按预算再发找房对话（匿名预算用完）。顺带：房东发布草稿回复里模型自己写了「我会实时更新草稿内容」「我会实时更新卡片」 | t6c 输出 | 未执行（预算）；见新发现 N-1 |
| 文案-1 | 未登录 `/screening/app` | 「注册后即可开始筛查，免费档每月 3 单；历史记录云端保留。」 | t7.mjs，t7-screening.png | 已修复 |
| 文案-2 | `/settings` 中文免费档说明 | landlord-test 在 Pro 试用期（试用至 11 月 14 日），页面不显示免费档说明；线上 JS 包 `5571-79d402eb…js` 里 `acct.langplan.planFreeDesc` zh =「每月 3 次租客筛查，另送 1 次深度核查；新账号免费试用 Pro 30 天。升级后不限次数。」 | t7-settings-zh.png；curl 包内文本 | 部分（包内已上线，页面渲染未能触发） |
| 文案-3 | `/intake/<假token>` 眉标 | 假 token（及两个已撤销的真 token）只显示「链接无效」，不渲染眉标；线上页面包内字串为「租赁申请材料 · 经纪代收」 | t7-intake.png；`app/intake/[token]/page-ef70…js` | 部分（包内已上线；页面渲染需一条有效链接，库里没有） |
| T6-D1 前端 | tenant-test 登录后打开 `/settings` 找升级按钮 | 租客设置页没有升级 / 订阅按钮（只有导航的「产品」和推送档位），无法触发 | t3 输出 `---SET`；t8-settings.png | 不可达（landlord 设置页有「现在订阅 Pro →」，未点） |

## 新发现
- N-1 S3/P3：匿名房东发房源对话里，模型自己写「我会实时更新草稿/卡片」，与 I-D2 同类用词（那条守卫针对找房回复）。
- N-2 S3/P3：草稿卡无用户说明时多出「1 浴」「Willowdale · North York」（第 3 次运行），属推断字段；是否算「用户没说的话」由主线程定。描述全文在卡片上被截断，匿名预览里看不到。
- N-3 说明：D-F-01 在多伦多 20:00–24:00 之外无法在真实时间下区分 UTC 与多伦多，已用 Date 平移法复核。

## 预算与偏差
- 匿名 AI 对话用了 3 次（超出 ≤2 一次，为读取 I-D1 描述全文重跑；两次是空等或无全文）。I-D2 因此没再发。
- 登录后模型调用 0 次（E-D2 的决定通知走模板，无模型）。邮件 0 封实际发出（E-D2 已撤回；D-07 的 `notify-landlord` 会通知房东，见下）。

## 数据副作用（全部 `[TEST]` / 测试号）
- 新增 1 条 applications：`[TEST] Retest`，tenant-test+r2@stayloop.ai，挂在 `[TEST] 200 Test QA Lane`；`/api/notify-landlord` 触发一封给 muse-landlord 的通知邮件（测试号）。
- `[TEST] Second Applicant` 新增 1 条 `agent_pending_actions`（send_decision，已 expired，未发送）；application 状态未变。
- 为登录铸了两条魔法链接（tenant-test、landlord-test），用后即弃。
- 临时文件：`scratchpad/sitetest1017/R2/`（含 chrome-9350* 用户目录与 chunks 缓存）；Chrome 进程已退出。
