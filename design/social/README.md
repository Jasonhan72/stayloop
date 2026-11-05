# Stayloop 社交媒体账号资料包

2026-11-04 整理。注册本身（建账号、设密码、过人机验证、同意平台条款）由你本人操作；这里是注册时照着填的全部内容。

## 1. 用户名

统一用 **`stayloopai`**。`stayloop` 在能查到的四个平台都已被别人占用。

| 平台 | `stayloop` | `stayloopai` | 说明 |
|---|---|---|---|
| Instagram | 已被占（空号，1 个粉丝） | 可用 | Threads 跟 Instagram 同名，注册后顺手开通 |
| X | 已被占（@StayLoop） | 可用 | |
| YouTube | 已被占（频道名 Stayloop） | 可用 | 这里说的是 `@handle` |
| TikTok | 已被占（私密账号） | 可用 | |
| Facebook 主页 | 未登录查不到 | 未登录查不到 | 建主页后在「用户名」里试 `stayloopai` |
| LinkedIn 公司主页 | 未登录查不到 | 未登录查不到 | 建主页时的公开网址填 `stayloopai` |
| 小红书 | 不适用 | 不适用 | 昵称可重名；小红书号可改一次，改成 `stayloopai` |
| 微信公众号 | 不适用 | 不适用 | 名称查重在注册页进行；微信号填 `stayloopai` |

「可用」指 2026-11-04 公开主页不存在，最终以注册页提示为准。

## 2. 通用资料

| 项目 | 填什么 |
|---|---|
| 显示名称 | `Stayloop` |
| 用户名 | `stayloopai` |
| 注册 / 登录邮箱 | `social@stayloop.ai`（只用于登录与平台通知，不对外公开） |
| 对外联系邮箱 | `hello@stayloop.ai`（主页上公开显示的联系方式填这个） |
| 网站 | `https://www.stayloop.ai` |
| 地区 | Ontario, Canada（中文平台填「加拿大 安大略省」） |
| 行业 / 类目 | LinkedIn：Technology, Information and Internet；Facebook：Real Estate Service + Software Company；Instagram：Product/Service |
| 公司规模、成立年份、注册地址、公司类型 | 按公司实际情况填，这里不代写 |

## 3. 图片素材

都在 [`assets/`](assets/)，由 `build.sh` 从 `banner.template.html` / `avatar.template.html` 生成（字标、配色、首页渐变底、首页主图与主副标题都取自线上站点）。要改文案或尺寸就改模板再跑一次：

```bash
bash design/social/build.sh
```

| 文件 | 用在哪里 |
|---|---|
| `avatar-1024.png` | 全部八个平台的头像。一行字标、白底，四周留白按圆形裁切算过 |
| `x-header-1500x500-en.png` / `-zh.png` | X 顶部横幅。左下角留给头像 |
| `linkedin-cover-1128x191-en.png` / `-zh.png` | LinkedIn 公司主页封面 |
| `facebook-cover-1640x624-en.png` / `-zh.png` | Facebook 主页封面。内容在中间 67%，手机端不会被裁掉 |
| `youtube-banner-2560x1440-en.png` / `-zh.png` | YouTube 频道横幅。内容在中间 1546×423 安全区 |

建议：LinkedIn、X、YouTube、Facebook 用英文版；小红书主页背景用 `facebook-cover-1640x624-zh.png`。

头像沿用现在的站点图标（一行「Stayloop.AI」字标）。在评论区这种 40 像素左右的小尺寸下字会很小，这是字标型头像的通病；如果以后想要一个单字母或图形的小尺寸版本，再单独定稿。

## 4. 各平台：在哪注册、填什么

### Instagram（含 Threads）

- 注册：<https://www.instagram.com/accounts/emailsignup/>，邮箱 `social@stayloop.ai`
- 注册后在设置里切换成「专业账户 → 商家」，类目 Product/Service
- 简介（上限 150 字符）：

```
Leave renting to an AI Agent · 租房的事，交给AI助理
For tenants, landlords and realtors in Ontario
Free for tenants
```

- 链接：`https://www.stayloop.ai`

### X

- 注册：<https://x.com/i/flow/signup>，邮箱 `social@stayloop.ai`
- 简介（上限 160 字符）：

```
Leave renting to an AI Agent. From search to renewal: it does the work, you approve. For tenants, landlords and realtors in Ontario.
```

- 位置：Ontario, Canada；网站：`https://www.stayloop.ai`

### TikTok

- 注册：<https://www.tiktok.com/signup>，选「使用邮箱」，邮箱 `social@stayloop.ai`
- 简介（上限 80 字符）：

```
Leave renting to an AI Agent. Ontario rentals, from search to renewal.
```

- 先占名即可，内容可以晚一步

### YouTube

- 需要一个 Google 账号。两种做法任选：用已有的 Stayloop 专用 Gmail；或在 <https://accounts.google.com/signup> 选「改用现有邮箱」，用 `social@stayloop.ai` 建一个不带 Gmail 的 Google 账号
- 建频道：<https://www.youtube.com/create_channel>，频道名 `Stayloop`，`@handle` 填 `stayloopai`
- 频道说明（上限 1000 字符）：

```
Stayloop is an AI rental platform built for Ontario. Every tenant, landlord and realtor gets their own AI Agent: from search and applications to leases, repairs and renewals, it does the work and you approve.

Free for tenants. Landlords can start free.

Stayloop 是面向加拿大安省的 AI 租房平台。每位租客、房东和经纪都有自己的 AI 助理：从找房、申请到签约、报修和续约，它去办，你来批准。租客永久免费，房东可以免费开始。

https://www.stayloop.ai
```

### Facebook 主页

- 主页必须挂在个人 Facebook 账号下面：用你本人的账号登录后打开 <https://www.facebook.com/pages/create>
- 主页名称 `Stayloop`；类别 Real Estate Service、Software Company
- 简介（上限 101 字符）：

```
Leave renting to an AI Agent. From search to renewal: it does the work, you approve.
```

- 联系邮箱 `hello@stayloop.ai`，网站 `https://www.stayloop.ai`
- 建好后在「主页访问权限」里再加一位有完全控制权的人，避免只挂在一个个人账号上

### LinkedIn 公司主页

- 同样挂在个人 LinkedIn 账号下面：登录后打开 <https://www.linkedin.com/company/setup/new/>，选 Company
- 名称 `Stayloop`；公开网址 `stayloopai`；网站 `https://www.stayloop.ai`；行业 Technology, Information and Internet
- Tagline（上限 120 字符）：

```
The AI Agent for renting in Ontario: it handles search to renewal, and you approve every key step.
```

- About（上限 2000 字符）：

```
Stayloop is an AI rental platform built for Ontario. Every tenant, landlord and realtor gets their own AI Agent that handles the day-to-day work of renting, from search and applications to leases, repairs and renewals. The Agent prepares each step, and you approve the decisions that matter.

What it covers
• Tenants: find a place, put together an application, and keep track of your lease, rent records and repair requests. Free for tenants, always.
• Landlords: publish listings, screen applicants, send leases for signature and handle maintenance. Free to start; Pro is $19 CAD a month.
• Realtors: client intake links and tenant screening for RECO-registered agents.
• Service providers: a pilot marketplace for repair jobs in Toronto and the surrounding area.

Along the way the Agent checks against Ontario tenancy rules and shows its sources. Stayloop does not handle rent money and does not take a cut.

https://www.stayloop.ai
```

- 建好后在 Admin tools → Manage admins 里再加一位 Super admin

### 小红书

- 只能在 App 里用手机号注册；企业号认证在 <https://pro.xiaohongshu.com>，需要营业执照
- 昵称 `Stayloop`；小红书号改成 `stayloopai`（只能改一次）
- 简介（上限 100 字）。小红书对简介里的外部网址和联系方式管得严，这一段不放网址：

```
租房的事，交给AI助理。
找房到续约，它去办，你来批准。
面向加拿大安省的租客、房东和经纪，租客永久免费。
```

### 微信公众号

- 注册：<https://mp.weixin.qq.com/> →「立即注册」，邮箱 `social@stayloop.ai`（这个邮箱没绑过微信，可以用）
- 要选主体类型并提交对应的企业证明文件，还要一位管理员的实名微信扫码；具体材料以注册页当时的要求为准
- 名称 `Stayloop`（查重不过就用 `Stayloop租房`）；微信号 `stayloopai`
- 功能介绍（4–120 字）：

```
Stayloop 是面向加拿大安省的 AI 租房平台。每位租客、房东和经纪都有自己的 AI 助理，从找房、申请、签约到续约，它去办，关键决定由你确认。租客永久免费。
```

## 5. 第一条帖子（置顶用）

英文（X / LinkedIn / Facebook / Instagram）：

```
Renting comes with a long list of small jobs: searching, applying, signing, fixing things, renewing.

Stayloop gives every tenant, landlord and realtor in Ontario an AI Agent that does that work. You approve the decisions that matter.

Free for tenants. https://www.stayloop.ai
```

中文（小红书 / 公众号 / Instagram）：

```
租房这件事，零碎活儿特别多：找房、申请、签约、报修、续约。

Stayloop 给安省的每位租客、房东和经纪配一个 AI 助理，这些事它去办，关键决定由你批准。

租客永久免费。
```

## 6. 注册顺序与收尾

1. Instagram、X、TikTok：只要邮箱，几分钟一个，先把 `stayloopai` 占住。
2. YouTube：定好用哪个 Google 账号后建频道。
3. Facebook 主页、LinkedIn 公司主页：用你的个人账号建，建完立刻加第二位管理员。
4. 小红书、微信公众号：要手机号和企业材料，最后做。

每个账号建好后：

- 密码各不相同，存进密码管理器；两步验证用验证器应用，不绑短信。
- 备用验证码也存进密码管理器。
- 头像、横幅、简介、网站按上面的内容填齐。

## 7. 文案规则（以后发帖也照这个）

- 中文叫「AI 助理」，英文叫「AI Agent」。
- 产品动作叫「租客筛查」/ tenant screening。
- 中文用平实口语。主标题「租房的事，交给AI助理」不改。
- 不写编造的数字、客户数、百分比；不写「按时收租」「实时挂牌」「验证一次，处处通行」这类不属实的说法。
- Stayloop 不经手租金、不抽成；租客永久免费。
