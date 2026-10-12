# 给 PropTx 的接入询问邮件（2026-10-11 定稿草案）

收件人：dataagreements@proptx.ca（PropTx Data Administrator，电话 416-443-8131）。抄送：发起接入的 TRREB 会员经纪（和其 Broker of Record）。
**正式申请不走邮件**：会员在 PropTx Data Syndication and Agreement System（https://syndication.ampre.ca/sso/start）点「New Agreement」→ 选 IDX 与 VOW（各一份）→
「My vendor is not in this list」→ 填 Stayloop Inc. → Stayloop 收到 PropTx 的自动验证邮件、说明用途并签供应商协议 → 会员与经纪公司签各自部分。这封邮件的作用是
**先把问题问清、让对方知道我们是谁**，发完就请会员去门户发起。发送前替换方括号里的内容。

---

**Subject:** IDX + VOW data feed for a rental platform — Stayloop Inc. as technology vendor for TRREB member [Agent name]

Dear PropTx Data Administrator,

My name is Jason Han, founder of Stayloop Inc., a Toronto-based residential rental platform (www.stayloop.ai). I am writing together with [Agent full name] (RECO #[number], [Brokerage name]), a TRREB member who intends to start IDX and VOW Datafeed Agreements through the Data Syndication and Agreement System with Stayloop Inc. designated as the technology vendor / Affiliated VOW Partner. Before the member submits, we would like to confirm our understanding of the display rules and ask four questions.

**What Stayloop is**

Stayloop is a rental-only platform for Ontario: prospective tenants browse lease listings, request showings and submit applications; landlords and their agents screen applicants, prepare the Ontario standard lease and manage the tenancy. The public site shows a limited listing card (IDX-style); registered users sign in with a password and accept our Terms of Use (VOW-style). We would use the feed for residential lease listings in the GTA only.

**How the site already follows Article 8 of the PropTx MLS Rules**

- 8.05 / 8.06 — Registration requires the consumer's name, a verified email address and a password; the account is asked to accept the Terms of Use on sign-up and again whenever the Terms change (version and time recorded); a confirmation email of the acceptance is sent; passwords expire after 90 days; account records are retained.
- 8.09 / 8.10 / 8.11 — The Terms of Use (www.stayloop.ai/terms, section 5) contain the nine listing-data clauses: acknowledgement of a lawful broker-consumer relationship with the member; personal, non-commercial use; bona fide interest; no copying or redistribution; no AI or automated processing by users; no scraping; ownership and copyright remain with the brokerages and the association; the association and its members may audit the site; no fee and no representation agreement arise from accepting the Terms.
- 8.12 — Listing pages carry a dedicated contact card for the sponsoring member (name, brokerage, phone, email).
- 8.13 — The public site never exposes the listing database: all listing reads go through rate-limited server endpoints that return card or detail fields only; anonymous database access is revoked; signed-in users' searches and listing views are logged so an audit trail can be produced on request.
- 8.14 / 8.15.02 / 8.17 — Listings carry per-row display directives (internet display, address display, automated-value display) that the site honours, and feed rows not refreshed within 24 hours are automatically withheld.
- 8.16 — Every listing page names an email address for the listing brokerage to flag any information Stayloop adds beyond the feed; we correct or remove it within 48 hours.
- 8.19 — The Privacy Policy (www.stayloop.ai/privacy, section 3b) states that consent records and listing-page activity may be shared with the association for auditing or legal purposes.
- 8.24 / 8.25 / 8.26 / 8.28 / 8.29 — Listing content is displayed as received; anything we add (a labelled machine translation, transit distances, a neighbourhood note) names its source; every page carries the "deemed reliable but not guaranteed" notice and the copyright / trademark line; the listing brokerage is shown on every card and directly under the address on every listing page, in the same type size as the listing facts; listings from other sources are labelled, grouped and searchable separately.
- 8.27 — Search results are served at most 100 listings per query, enforced on the server.

We are happy to provide screenshots or a reviewer account.

**Four questions**

1. **AI assistance to users.** Stayloop includes an AI assistant that helps a signed-in user search and compare rental listings inside the site (for example, "two-bedroom units under $2,800 near Union Station"), using only the licensed data and only for that user's own search. Rules 8.01 and 8.18 limit use of the data to operating the VOW. Is this in-site assistance acceptable, and under what conditions? We do not train models on the data and do not use it for any other purpose.
2. **Translation.** Our interface is bilingual (English / Chinese). For Chinese-language users we show a machine translation of the listing description, clearly labelled as a Stayloop addition, with the original one click away. Does a labelled translation count as an alteration under Rule 8.24, and would you prefer the original shown alongside by default?
3. **Mixed sources.** Landlords also publish their own rental listings directly on Stayloop. They are labelled, grouped and searchable separately from MLS® listings (8.28 / 8.29). Is anything further required when both appear in one search result?
4. **Contact routing.** Under Rule 8.12 every listing page will show the sponsoring member's contact details. Stayloop also keeps a directory of RECO-registered agents who verified their registration with us, which a consumer may use to arrange a showing (Stayloop charges no fee and takes no referral). On MLS® listing pages, may that option remain beside the sponsoring member's contact, or should the sponsoring member be the only contact offered?

Thank you for your time. Once we have your guidance, [Agent full name] will start the IDX and VOW agreements in the Data Syndication and Agreement System and add Stayloop Inc. as a new vendor.

Kind regards,

Jason Han
Founder, Stayloop Inc.
www.stayloop.ai · [phone] · [email]

cc: [Agent full name], [Brokerage name] (sponsoring TRREB member)
