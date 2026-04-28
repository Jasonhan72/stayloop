# Stayloop — Design System (V3)

> Single-file design system spec. Drop into Claude Design as your organization's
> design source, or hand to any designer / AI agent onboarding to the codebase.
> Authoritative tokens live in `lib/brand.ts`; this document is the human-readable
> mirror of that file.

---

## 1. Brand voice

Stayloop is **trust infrastructure for the Canadian rental market**. The voice
is calm, evidence-led, slightly editorial. Like Stripe or Linear with Toronto
sensibilities — never zoomy, never silicon-valley breathless.

- **Tone**: confident, specific, quietly opinionated. We back claims with numbers
  (`6.2 d avg DOM vs. 18 d industry`, not "fast like never before").
- **Bilingual**: every long-form copy ships in **English + Simplified Chinese**.
  Chinese is not a translation afterthought — landlord and tenant audiences are
  ~50/50. Keep both versions punchy and culturally native, not literal.
- **No hype words**: avoid "revolutionary", "AI-powered" as adjectives, "game-
  changer", emoji storms. AI is in the product; we don't have to shout it.
- **Always specific about Canada**: Ontario RTA, CanLII, OHRC, Form 2229E,
  Stripe CAD, RECO. No generic "American landlord SaaS" framing.

---

## 2. Color tokens

### Surfaces

```
surface       #F2EEE5   warm cream — main page background
surfaceCard   #FFFFFF   pure white — cards / panels float above the cream
surfaceMuted  #EAE5D9   slightly deeper cream — in-app sidebars / body
surfaceTint   #E8F0E8   soft mint — hero / network-effect / accent sections
ink           #0B0B0E   near-black — passport hero, "always-dark" panels
ink2          #16161B   ink panel highlight
ink3          #1B1B22   ink panel raised surface
```

### Borders & dividers

```
border        #D8D2C2   default border (visible on cream)
borderStrong  #C5BDAA   stronger emphasis
divider       #E0DACE   subtle row dividers
```

### Text

```
textPrimary   #171717   default body
textSecondary #3F3F46   meta / captions
textMuted     #71717A   placeholder / hint
textFaint     #A1A1AA   disabled / decoration
textOnBrand   #FFFFFF   white on emerald or ink
```

### Brand (classic emerald — DARKER than the modern variation)

```
brand         #047857   primary — buttons, accent text, logo mark
brandStrong   #065F46   hover / pressed
brandBright   #10B981   used inside DARK panels (passport hero) — never on cream
brandBright2  #34D399   gradient endpoint
brandSoft     rgba(4,120,87,0.10)   soft fill behind brand chips
brandWash     #E4EEE3   hero gradient bottom
brandLine     rgba(16,185,129,0.32) brand outline on dark surfaces
```

### Status / severity

```
success       #16A34A   approve / positive
warning       #D97706   conditional / caution
danger        #DC2626   decline / forgery
info          #2563EB   neutral notice
trust         #7C3AED   violet — RESERVED for Trust API + Verified Passport
```

### Tier badges (screening outcome)

| Tier | bg | fg | EN | ZH |
|---|---|---|---|---|
| approve | `#DCFCE7` | `#16A34A` | ✓ Approve | ✓ 推荐通过 |
| conditional | `#FEF3C7` | `#D97706` | ⚡ Conditional | ⚡ 有条件 |
| decline | `#FEE2E2` | `#DC2626` | ⚠ Decline | ⚠ 建议拒绝 |
| pending | `#E0DACE` | `#71717A` | Pending | 待评分 |

### Primary action gradient (the "soft mint")

All primary CTAs across the app share **one** filled-button recipe:

```css
background:    linear-gradient(135deg, #6EE7B7 0%, #34D399 100%);
color:         #FFFFFF;
box-shadow:    0 8px 22px -10px rgba(52, 211, 153, 0.45),
               0 1px 0 rgba(255, 255, 255, 0.30) inset;
border-radius: 10px;
```

Examples: `选择文件 / Pick files`, `开始筛查 / Start Screening`, `发布上线 /
Publish`, Nova chat composer send button.

**Disabled state:**
```css
background: #C5BDAA;  color: #71717A;  cursor: not-allowed;
```
Never use `opacity: 0.5` to fake disabled — it reads as "washed out".

---

## 3. Typography

```
--font-inter   Inter Tight  → display + body (latin)
--font-cn      Noto Sans SC → all Chinese glyphs
--font-mono    JetBrains Mono → numbers, IDs (passport ID, SL-2026-XXXXX-XXX),
                                code chips, tool-call badges, RECO #
```

**Hierarchy:**

| Use | size | weight | letter-spacing | line-height |
|---|---|---|---|---|
| Hero (homepage h1) | `clamp(40px, 6vw, 72px)` | 800 | -0.035em | 1.04 |
| Page h1 | 28-34 | 800 | -0.025em | 1.1 |
| Section h2 | 20-22 | 700-800 | -0.02em | 1.2 |
| Card title | 16-18 | 700 | -0.01em | 1.3 |
| Body | 14 | 400-500 | 0 | 1.55 |
| Meta / caption | 12-13 | 500 | 0 | 1.5 |
| Eyebrow / chip label | 10-11 | 700 | 0.10em uppercase | — |

Number-heavy interfaces (score, rent, court records) use `var(--font-mono)`
with `font-feature-settings: 'zero', 'ss01'`.

---

## 4. Spacing + radius + shadow scale

```
radius.sm   4    pills, tiny chips
radius.md   6    inline tags
radius.lg   8    standard buttons / inputs
radius.xl   12   cards
radius.pill 999  status pills
```

```
shadow.sm  0 1px 2px rgba(0,0,0,0.04)
shadow.md  0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)
shadow.lg  0 4px 8px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.06)
```

```
content.narrow  720
content.default 1100
content.wide    1260
```

---

## 5. Core components

### AppHeader (the global app chrome)

Sticky at top of every authenticated page. Layout:

```
[← back?] [S logo · Stayloop] [optional title]   ...   [right slot] [🌐 EN/中] [JH avatar dropdown]
```

- Logo mark: 26×26 rounded square (radius 7), background `#047857`, white "S",
  font-weight 800.
- Title divider: 1px × 18px `#D8D2C2` between Stayloop and page title.
- Sticky, `z-index: 50`, `border-bottom: 1px solid #E0DACE`, background `#F2EEE5`.
- During auth load, render a 36×36 muted-cream circle placeholder where the
  avatar will appear — never flash the "Sign in" CTA.

### Avatar dropdown menu (role-aware)

The menu items differ by user role. **Always include all role-appropriate
shortcuts plus Account at the bottom and Sign out below a divider.**

| Role | Menu items |
|---|---|
| **tenant** | My Passport · Score · Rental history · Disputes · Account |
| **landlord** | Dashboard · Pipeline · Portfolio · Screen a tenant · New listing · Account |
| **agent** | Day brief · Pipeline · Find an agent · Account |

Header sub-block of the dropdown shows: full name → email → small uppercase
role chip in `brandStrong` over `brandSoft`.

### Buttons

**Primary (filled emerald gradient)** — see "Primary action gradient" above.

**Secondary (outlined)**:
```
background: #FFFFFF;
border: 1px solid #C5BDAA;
color: #171717;
border-radius: 10px;
padding: 12px 22px;
font-size: 15px;  font-weight: 600;
```

**Ghost (text-only)**:
```
background: transparent;  border: none;
color: #047857;  font-weight: 600;
```

### Cards

Standard card on cream surface:
```
background: #FFFFFF;
border: 1px solid #D8D2C2;
border-radius: 14px;
padding: 18-24px;
box-shadow: 0 1px 3px rgba(31, 25, 11, 0.04), 0 12px 32px -8px rgba(31, 25, 11, 0.06);
```

Hero panels (homepage hero, audience hero) use a vertical gradient
`linear-gradient(180deg, #E4EEE3 0%, #F2EEE5 100%)` and bottom border `1px
solid #E0DACE`.

### Inputs

```
background: #FFFFFF;
border: 1px solid #D8D2C2;
border-radius: 10px;
padding: 11px 14px;
height: 44px;
font-size: 14px;
color: #0B1736;            /* always pin — globals.css sets this for native inputs */
caret-color: #0B1736;
```

Focus state: `border-color: #047857; box-shadow: 0 0 0 3px rgba(4, 120, 87, 0.15);`

### Status chips

Pill-shape, 11-12px text, weight 600-700, `padding: 4px 10px`, `border-radius:
999px`. Always pair `bg` (light tint) with `fg` (saturated brand color from
the same family). Never use neon.

### Tool execution badges (in chat / agent UI)

Inline, monospace, 10-11px:
```
⏳ tool_name        running   (textTertiary)
✓ tool_name         success   (success #16A34A)
✗ tool_name         error     (danger #DC2626)
```

### Phone frame (mobile-spec mocks)

The `Phone` component (`components/v3/Frame.tsx`) is used for mobile-first
features (Passport, Rental history, Echo, Lease explainer, MLS pack, Roommates,
Insurance). On mobile viewports it dissolves to native edge-to-edge; on desktop
it shows an iOS bezel with status bar.

---

## 6. Agent visual identities

Stayloop has 4 + 4 named AI agents. Each has a distinct accent color used in
its avatar mark and chat bubbles. The accent is the only thing that varies —
all agents share the same chat layout, composer, tool-badge style.

| Agent | Role | Accent | Use case |
|---|---|---|---|
| **Logic** | Landlord screening | `#047857` brand emerald | Score applicants, run forensics |
| **Nova** | Listing composer | `#047857` brand emerald | Draft + publish listings, OHRC compliance |
| **Echo** | Tenant concierge | `#34D399` brighter mint | Help renters research listings, rights |
| **Mediator** | Dispute resolution | `#7C3AED` trust violet | RTA-trained neutral 14-day window |
| **Atlas** | Lease drafter | `#2563EB` info blue | Form 2229E + bilingual addenda *(planned)* |
| **Verify** | Document forensics | `#D97706` warning amber | Pre-screening (sub-agent of Logic) *(planned)* |
| **Sentinel** | Compliance guard | `#DC2626` danger red | OHRC + RTA red-line scanner *(planned)* |
| **Analyst** | Market index | `#7C3AED` trust violet | Stayloop Index (rent benchmarks) *(planned)* |

Agent avatar = 32-40px rounded square (radius 10), accent background, white
icon glyph (✦ for Nova, ◷ for Logic, ⚡ for Echo, ⚖ for Mediator).

---

## 7. Layouts

### Marketing pages (`/`, `/tenants`, `/landlords`, `/agents`, `/trust-api`, `/about`)

- Max width 1260px, centered.
- Sticky `MarketingNav` (logo + audience links + LanguageToggle + avatar/Sign-in).
- Hero with vertical mint gradient.
- 3-card audience trifecta on home, single-CTA closing panel.
- `MarketingFooter` with column nav + locale + legal.

### In-app pages (`/dashboard`, `/screen`, `/listings/new`, `/disputes`, …)

- `AppHeader` sticky.
- Surface `#F2EEE5`, content max-width 1100-1260px.
- Two-pane layouts (left = source/filters, right = preview/log) collapse to
  stacked single-column under 760px.

### Pipeline `/dashboard/pipeline`

- 240px left sidebar with property nav (no header on this page; the header is
  inline in the right pane).
- Kanban columns: New → Reviewed → Showing → Lease → Decision.

### Score `/score`, Passport `/passport`, History `/history` (tenant)

Mobile-first. Passport card uses **dark ink panel** (`#0B0B0E → #1E293B`
gradient) with brand-bright text — the only place we use `brandBright` instead
of `brand`.

---

## 8. Bilingual rules

- **All user-facing strings** are keyed in `lib/i18n.tsx` with `_en` / `_zh`
  pairs.
- **Chinese-first when both fit**: titles like `租客筛查 · Tenant Screening`
  put ZH first if landlord / tenant in Chinese-speaking GTA neighbourhoods is
  the audience.
- **Mixed-language headlines OK**: hero copy `打造的信任基础设施` next to
  `$640B rental market` works — that's how the audience already talks.
- **Number formatting**:
  - Currency: `$2,500` (CAD assumed; explicitly tag CAD only when ambiguous)
  - Dates: `2025-04-28` ISO in mono font; never `4/28/25`.
  - Score: `872 / 1000` or `87/100` — match the mode of the page.

---

## 9. Iconography

- Native `<svg>` only. No icon libraries on the marketing surface.
- Stroke-based, `stroke-width: 2` (or 1.8 for small 16px), `stroke-linecap:
  round`, `stroke-linejoin: round`.
- Glyphs in agent avatars and section eyebrows are kept to a small set:
  `✦ ◷ ⚡ ⚖ ✓ ⚠ →`.

---

## 10. Do / Don't

**DO**

- Always pair brand emerald with cream surface — never with pure white.
- Use the soft-mint gradient `#6EE7B7 → #34D399` for **every** primary CTA.
- Use `lib/brand.ts` `v3.*` tokens. New hex values require a new token.
- Render bilingual content side-by-side or with a clear toggle, never
  collapse one language.
- Pin input text colors inline (`color`, `WebkitTextFillColor`, `caretColor`)
  on any new form control — the legacy global `--text-primary` cascade can
  still bite.

**DON'T**

- ❌ Use the bright `#10B981` solid emerald on cream surfaces — it reads
  neon. That color belongs in dark panels only.
- ❌ Use the violet `#7C3AED` for anything except Trust API surface,
  Verified-Passport accents, and Mediator agent.
- ❌ Add new hardcoded hex values in pages — define a token first.
- ❌ Use `opacity: 0.5` for disabled buttons.
- ❌ Mix the legacy `mk` cool-blue palette into new pages. (`/dashboard`,
  `/profile`, `/login`, `/register` still use it — those are technical debt,
  not a pattern to follow.)
- ❌ Hide the avatar dropdown's role-specific menu items behind a "More"
  button. The menu must show everything for the user's role.

---

## 11. Inspirations

- **Linear** — for the dense, mono-font-friendly information density and the
  way they balance dark + light surfaces.
- **Stripe Dashboard** — for status pills, severity color use, and the
  "evidence-led" voice.
- **Notion** — for in-app cream surfaces and how sidebars feel like part of
  the workspace, not chrome.

Stayloop is none of these — it's its own thing. But that's the neighbourhood
to think in.
