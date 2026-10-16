# 申请包（乙 #7）· 三组共用契约 · 2026-10-16

研究稿 `design/research/v1/tenant-tools-2026-10.md`「建议的申请包」一节是依据。原则：申请包里的每一项都是**申请人自己提供或自己授权第三方出具**的；
Stayloop 不替任何人去查任何人；不收 SIN；不问受保护特征；**不做「信用 + 法庭章」**（CRA 注册前）；租客永远免费（产品决定，不写成「法律禁止」）；
魁北克房源不收证件复印件（`fileKindsFor` 规则沿用）。

## 数据（G13 建表；G14 / G15 只按此读写）

`public.applicant_profiles`（`auth_id uuid primary key references auth.users(id) on delete cascade`，本人 RLS select / insert / update / delete，anon 无权，`revoke … from public, anon, authenticated` 后 grant 四种给 authenticated）
```
first_name text, last_name text, phone text, current_address text, date_of_birth date null,
employment_status text, employer_name text, job_title text, employment_start_date date null, monthly_income integer null,
employer_phone text, employer_email text,
num_occupants integer default 1, has_pets boolean default false, pet_details text, is_smoker boolean default false, additional_notes text,
consent_version text null, consent_at timestamptz null,
created_at timestamptz default now(), updated_at timestamptz default now()   -- updated_at 由触发器刷新
```
文本列长度 CHECK ≤ 200（notes ≤ 2000）。

`public.applicant_profile_history`（本人 RLS 四种；`position integer` 排序，0 = 最近一段）
```
id uuid pk, auth_id uuid not null, position integer not null default 0,
prev_address text, prev_landlord_name text, prev_landlord_phone text, prev_landlord_email text,
prev_rent integer null, prev_move_in date null, prev_move_out date null, reason_for_leaving text,
created_at, updated_at
```
Stayloop 内双方确认的在管租约**不落这张表**，由 `lib/profile/history.ts stayloopHistory()` 按 `/p/<token>` 同一判定（`households.verified` 或双签租约）现算成 `source:'stayloop'` 的段，带按时付租计数（只取 `rent_payments.status in paid|late`，不含金额）。

`public.applicant_profile_files`（本人 RLS **select / delete**；insert 只由服务端路由（service role）写）
```
id uuid pk, auth_id uuid not null, kind text check (kind in ('id','paystub','bank_statement','employment_letter','credit_report','reference','other')),
path text not null unique, name text (≤160), size integer, mime text (≤80), sha256 text (^[0-9a-f]{64}$),
as_of date null, uploaded_at timestamptz default now()
```
存储：桶 `tenant-files`，路径 `profile/<auth_id>/<kind>/<sha8>-<safe-name>`（首段固定词 `profile`，与 `application_upload_allowed`（首段 uuid）和 `agent-intake` 互不冲突）。
新 definer 助手 `profile_file_readable(p_name)` = `foldername[1]='profile' and foldername[2]=auth.uid()::text` → storage policy **select** 给 authenticated（客户端签 URL 预览）；
**没有客户端 insert 策略**（上传经路由）；delete 经路由（删行 + 删对象）。

## 同意（`lib/profile/consent.ts`，G13）
`APPLICANT_PROFILE_CONSENT_VERSION = 'profile-v1-2026-10'`；`APPLICANT_PROFILE_CONSENT_TEXT {zh,en}`：目的（只用于向我选择的房东 / 经纪出示、申请租房）、内容（我填写的资料与我上传的文件）、
谁看（只有我出示给的对象；Stayloop 不主动提供给任何人）、保留（我可随时删除任一项或整个申请包）、撤回（删除即撤回，已出示给房东的副本由房东保管）。
每次出示写审计 `applicant_pack_presented`（metadata `{ to: 'application'|'share'|'pdf', application_id?, scope: string[] }`）。

## 新鲜度（`lib/profile/freshness.ts`，G13，纯函数）
`freshness(kind, asOf | uploaded_at, today)` → `{ days, state: 'fresh'|'aging'|'stale', suggestZh, suggestEn }`：工资单 / 对账单 >90 天 aging、>180 stale；在职信 >180 / >365；征信报告 >90 / >180；证件按 as_of（到期日）过期即 stale；reference / other 不判。

## 路由（G13）
- `POST /api/profile/files`（multipart `kind, file, as_of?`；登录；每用户每小时 30 次 fail-closed；类型 jpeg/png/webp/heic/pdf ≤ 25 MB；服务器算 SHA-256；同 sha+kind 幂等；上限每种 kind 6 份、总 20 份）→ `{ ok, file: {id, kind, path, name, size, mime, sha256, as_of, uploaded_at} }`，审计 `applicant_pack_file_added`。
- `DELETE /api/profile/files?id=<uuid>` → 删对象 + 删行，审计 `applicant_pack_file_removed`。
- `POST /api/profile/attach { application_id, file_ids[] }`（登录）：校验 `applications.id` 存在、`lower(email) = jwt email`、`created_at > now()-1h`、`files` 为空；把每份文件复制到 `<application_id>/<kind>/<sha8>-<name>`（service role `storage.copy` 或 download+upload）；返回 `ApplicationFile[]`（`{ kind, type, path, name, size, mime, uploaded_at }`，与 `/apply` 现有形状一致）；**不调用 `attach_application_files`**（页面把它和自己上传的文件合并后再调）；审计 `applicant_pack_presented`（to:'application'）。

## 页面
- G14：`/tenant/passport` 改为真实的申请包页（见 G14 任务）。
- G15：`/apply/[slug]` 顶部「用我的申请包填写」（见 G15 任务）。
- 文案一律叫「申请包 / Application pack」；页面标题「租客护照」保留为「租客护照 · 申请包」。
