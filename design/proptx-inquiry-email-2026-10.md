# 给 PropTx 的邮件（2026-10-11 可直接复制版）

收件人 dataagreements@proptx.ca · 抄送 发起接入的会员经纪（及其 Broker of Record） · 附件：`design/proptx-screenshots-2026-10/` 的 8 张 PNG
需要替换的只有四处方括号：[Agent full name]、[RECO number]、[Brokerage name]、[phone]。审核账号的密码不写在邮件里，对方回复后单独发。

---

Subject: IDX + VOW data feed inquiry — Stayloop Inc. (technology vendor) with TRREB member [Agent full name]

Dear PropTx Data Administrator,

My name is Jason Han, founder of Stayloop Inc., a Toronto-based residential rental platform (www.stayloop.ai). I am writing together with [Agent full name] (RECO #[RECO number], [Brokerage name]), a TRREB member who intends to start IDX and VOW Datafeed Agreements in the Data Syndication and Agreement System, with Stayloop Inc. designated as the technology vendor / Affiliated VOW Partner. Before the member submits the agreements, we would like to confirm our reading of the display rules and ask four questions.

What Stayloop is

Stayloop is a rental-only platform for Ontario. Prospective tenants browse lease listings, request showings and submit applications; landlords and their agents screen applicants, prepare the Ontario standard lease and manage the tenancy. Anonymous visitors see a limited listing card (an IDX-style display); registered users sign in with a name, a verified email and a password and accept our Terms of Use (a VOW-style display). We would use the feed for residential lease listings in the GTA only.

How the site already follows Article 8 of the PropTx MLS Rules

- 8.05 / 8.06: Registration requires the consumer's name, a verified email address and a password. Every account accepts the Terms of Use at sign-up and again whenever the Terms change (version and time recorded), receives a confirmation email of that acceptance, and must renew its password every 90 days. Account records are retained.
- 8.09 / 8.10 / 8.11: The Terms of Use (www.stayloop.ai/terms, section 5) contain the nine listing-data clauses: acknowledgement of a lawful broker-consumer relationship with the member; personal, non-commercial use; bona fide interest; no copying or redistribution; no AI or automated processing by users; no scraping; ownership and copyright remain with the brokerages and the association; the association and its members may audit the site; no fee and no representation agreement arise from accepting the Terms.
- 8.12: Every listing page has a contact card for the sponsoring member (name, brokerage, phone, email).
- 8.13: The public site never exposes the listing database. All listing reads go through rate-limited server endpoints that return card or detail fields only; anonymous database access is disabled; signed-in users' searches and listing views are logged so an audit trail can be produced on request.
- 8.14 / 8.15.02 / 8.17: Each listing carries per-row display directives (internet display, address display, automated-value display) that the site honours, and feed rows not refreshed within 24 hours are withheld automatically.
- 8.16: Every listing page names an email address (hello@stayloop.ai) for the listing brokerage to flag anything Stayloop adds beyond the feed; we correct or remove it within 48 hours.
- 8.19: The Privacy Policy (www.stayloop.ai/privacy, section 3b) states that consent records and listing-page activity may be shared with the association for auditing or legal purposes.
- 8.24 / 8.25 / 8.26 / 8.28 / 8.29: Listing content is displayed as received; anything we add (a labelled machine translation, transit distances, a neighbourhood note) names its source; every page carries the "deemed reliable but not guaranteed" notice and the copyright / trademark line; the listing brokerage appears on every card and directly under the address on every listing page, in the same type size as the listing facts; listings from other sources are labelled, grouped and searchable separately.
- 8.27: Search results are served at most 100 listings per query, enforced on the server.

Eight screenshots are attached (listing list, listing page, notices, Terms section 5, Privacy section 3b, sign-up). A reviewer account is ready as well: proptx-review@stayloop.ai — I will send the password in a separate message as soon as you would like to look.

Four questions

1. AI assistance to users. Stayloop includes an AI assistant that helps a signed-in user search and compare rental listings inside the site (for example, "two-bedroom units under $2,800 near Union Station"), using only the licensed data and only for that user's own search. Rules 8.01 and 8.18 limit use of the data to operating the VOW. Is this in-site assistance acceptable, and under what conditions? We do not train models on the data and do not use it for any other purpose.
2. Translation. Our interface is bilingual (English / Chinese). For Chinese-language users we show a machine translation of the listing description, clearly labelled as a Stayloop addition, with the original one click away. Does a labelled translation count as an alteration under Rule 8.24, and would you prefer the original shown alongside by default?
3. Mixed sources. Landlords also publish their own rental listings directly on Stayloop. They are labelled, grouped and searchable separately from MLS® listings (Rules 8.28 / 8.29). Is anything further required when both appear in one search result?
4. Contact routing. Under Rule 8.12 every listing page will show the sponsoring member's contact details. Stayloop also keeps a directory of RECO-registered agents who have verified their registration with us, which a consumer may use to arrange a showing (Stayloop charges no fee and takes no referral). On MLS® listing pages, may that option remain beside the sponsoring member's contact, or should the sponsoring member be the only contact offered?

Thank you for your time. Once we have your guidance, [Agent full name] will start the IDX and VOW agreements in the Data Syndication and Agreement System and add Stayloop Inc. as a new vendor.

Kind regards,

Jason Han
Founder, Stayloop Inc.
www.stayloop.ai · [phone] · jasonhan72@gmail.com

cc: [Agent full name], [Brokerage name] (sponsoring TRREB member)
