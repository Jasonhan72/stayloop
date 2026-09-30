// Homepage film (2026-09-28). The user's order of events: a hand-drawn stage was
// rejected ("这个动画要按照现在的页面设计的来做，现在做的是错的UI的，要改正"); the
// product's own chat then played one role; then "按照三个角色联动的方式…希望有真人的
// 角色演绎" and, for now, "先用 C 3D 卡通人物来做". Three people, three assistants,
// one unit: their phones run the REAL AgentChat (device layout) with the real
// cards, fed by lib/home/film.ts; the pointer taps the card's own button. These
// guards keep the screens real, the script honest and the page stable.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { CAST, FACES, FILM_STOCK, MIA_EMAIL, PEOPLE, RENT, SHOTS, filmDates, filmFor, filmSummary, greetingFor, type Beat } from '../lib/home/film'
import { executedText, greeting, rentAmount } from '../lib/agent/chatCopy'
import { buildRenewalProposal } from '../lib/agent/renewalStages'
import { guidelineFor, n1DeadlineFor } from '../lib/ontario/rules'
import { AVATAR_PRESETS } from '../lib/agent/avatars'
import { MAX_MONTHS } from '../lib/delegations/shared'

const read = (p: string) => readFileSync(p, 'utf8')
const film = read('components/home/ThreeRoleFilm.tsx')
const home = read('components/home/HomeNext.tsx')
const chat = read('components/agent/AgentChat.tsx')
const card = read('components/agent/ApprovalActionCard.tsx')
const NOW = new Date(Date.UTC(2026, 8, 28, 16, 0, 0))
const LANGS = ['zh', 'en'] as const

const beatsOf = (lang: 'zh' | 'en', now = NOW) => filmFor(lang, now)
const texts = (b: Beat): string[] => {
  switch (b.k) {
    case 'caption': return [b.text]
    case 'type': case 'send': return [b.text]
    case 'reply': return [b.msg.text, ...(b.card ? [b.card.title, b.card.summary] : [])]
    case 'card': return [b.card.title, b.card.summary, ...b.card.data_scope, ...b.card.excluded_data]
    case 'done': return [b.text]
    case 'handoff': return [b.label]
    case 'notify': return [b.title, b.body ?? '']
    case 'strip': return [b.text, b.note]
    default: return []
  }
}

describe('the phones are the product, not a drawing of it', () => {
  it('each lane renders the real AgentChat in its phone layout, fed by state — no session, no model call', () => {
    expect(film).toContain("import AgentChat from '@/components/agent/AgentChat'")
    const use = film.slice(film.indexOf('<AgentChat'), film.indexOf('/>', film.indexOf('<AgentChat')))
    for (const p of ['hero', 'device', 'messages={lane.messages}', 'pendingActions={lane.pending}', 'onDecide={onDecide}', 'scheduled={lane.scheduled}', 'draft={lane.draft}', 'avatar={c.avatar}', 'avatarFallback="brand"', 'currentThreadId={thread}', 'onSend={noop}']) expect(use, p).toContain(p)
    const imports = film.split('\n').filter((l) => l.startsWith('import ')).join('\n')
    for (const gone of ['useAgentSession', 'orchestrator', 'supabase', 'threads']) expect(imports, gone).not.toContain(gone)
    expect(film).not.toContain("fetch('/api/")
  })
  it('AgentChat `device`: the phone classes at every width, and no quick starts burying a phone-sized thread', () => {
    expect(chat).toContain('device = false,')
    expect(chat).toContain("${device ? '' : 'md:border-b md:border-line-divider md:px-5 md:pb-3 md:pt-5'} ${hero && !device ? 'lg:hidden' : ''}")
    expect(chat).toContain("h-11 w-11 ${device ? '' : 'md:h-14 md:w-14'}")
    expect(chat).toContain("${device ? '' : 'md:text-[19px]'}")
    expect(chat).toContain("px-4 py-4 ${device ? '' : hero ? 'md:px-10 md:py-6' : 'md:px-5 md:py-5'}")
    expect(chat).toContain("h-7 w-7 flex-none ${hero && !device ? 'md:hidden' : ''}")
    expect(chat).toContain("device ? 'border-t border-line-divider p-2' : hero ?")
    expect(chat).toContain('{!device && messages.length <= 1 && !thinking && !threadLoading && !intake && (')
    // without `device` the workspace page is exactly as before
    expect(chat).toContain("'md:px-10 md:py-6'")
    expect(chat).toContain("'border-t border-line-divider p-2 md:border-t-0 md:px-10 md:pb-5 md:pt-1'")
  })
  it('the pointer taps the card’s own approve button, after scrolling the lane’s own thread to it', () => {
    for (const a of ['data-decide="approved"', 'data-option="A"', 'data-option="B"', 'data-decide="rejected"', 'data-approval-card']) expect(card, a).toContain(a)
    expect(chat).toContain('data-chat-thread')
    expect(film).toContain('[data-decide="approved"][data-option="${option}"]')
    expect(film).toContain("querySelector<HTMLElement>('[data-chat-thread]')")
    expect(film).toContain("querySelectorAll<HTMLElement>('[data-approval-card]')")
    expect(film).toContain('el?.click()')
    // a thread scrolls itself — never the page the film sits in
    for (const src of [film, chat]) expect(src).not.toMatch(/\.scrollIntoView\(/)
    expect(chat).toContain("el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })")
  })
  it('the agent’s “representing” strip is the workspace strip', () => {
    const strip = read('components/delegations/RepresentingStrip.tsx')
    const cls = 'rounded-xl border border-agent/30 bg-agent/[0.06] px-4 py-2.5 text-[12.5px]'
    expect(strip).toContain(cls)
    expect(film).toContain(cls)
    expect(film).toContain('mt-0.5 text-[11px] text-body-3')
  })
  it('nothing in the film can be focused or followed; screen readers get the whole story', () => {
    expect(film).toContain("screenRef.current?.setAttribute('inert', '')")
    expect(film).toMatch(/ref=\{screenRef\}\s+aria-hidden/)
    expect(film).toContain('<p className="sr-only">{summary}</p>')
    expect(film).toContain("aria-label={playing ? (zh ? '暂停动画' : 'Pause animation')")
    for (const lang of LANGS) {
      const s = filmSummary(lang)
      for (const n of ['Mia Chen', 'Sarah Wang', 'David Park', 'Unit 1207']) expect(s).toContain(n)
      expect(s).toContain(lang === 'zh' ? '60 秒内可撤销' : 'undone for 60 seconds')
    }
  })
  it('plays only on screen in a visible tab; reduced motion shows each chapter’s key frame', () => {
    expect(film).toContain("new IntersectionObserver((es) => setOnScreen(es[es.length - 1].isIntersecting), { threshold: 0.25 })")
    expect(film).toContain("document.addEventListener('visibilitychange', vis)")
    expect(film).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')")
    expect(film).toContain('const live = playing && !reduced && onScreen && pageVisible')
    expect(film).toContain('if (tRef.current < keyAt) { tRef.current = keyAt; step(keyAt, true) }')
    expect(film).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/)
    // a finished fade must not pin opacity over the dimming class (a `both` fill mode did)
    expect(film).toContain('.sl-film-lane { animation: sl-film-in .35s ease backwards; }')
    expect(film).toContain('lg:opacity-50 lg:saturate-50')
  })
  it('wide screens show three phones; below lg one phone and a relay bar — one bottom bar stays the site’s own', () => {
    expect(film).toContain('grid gap-4 lg:grid-cols-3')
    expect(film).toContain("lg:block lg:h-[660px] ${show ? 'block' : 'hidden'}")
    expect(film).toContain('relative mx-auto mb-3 max-w-[420px] lg:hidden')
    expect(film).not.toContain('PhoneTabs')
  })
})

describe('the script: the product’s own lines and cards, the site canon, no scores', () => {
  it('five chapters of one unit, before → during → after', () => {
    for (const lang of LANGS) {
      const ch = beatsOf(lang)
      expect(ch.map((c) => c.key)).toEqual(['delegate', 'showing', 'screen', 'lease', 'renew'])
      expect(ch.map((c) => c.stage)).toEqual(lang === 'zh' ? ['租前', '租前', '租前', '租中', '租后'] : ['Before', 'Before', 'Before', 'During', 'After'])
      for (const c of ch) {
        expect(c.keyAt).toBeGreaterThan(0)
        expect(c.keyAt).toBeLessThan(c.end)
        expect(c.end).toBeLessThan(20_000)
      }
    }
  })
  it('beats are in time order; every tap is scrolled to first, lands before it presses, and the executed line follows', () => {
    for (const lang of LANGS) {
      for (const c of beatsOf(lang)) {
        for (let i = 1; i < c.beats.length; i++) expect(c.beats[i].at).toBeGreaterThanOrEqual(c.beats[i - 1].at)
        c.beats.forEach((b, i) => {
          if (b.k !== 'pointer') return
          const reveal = c.beats.slice(0, i).reverse().find((x) => x.k === 'reveal')
          const click = c.beats.slice(i).find((x) => x.k === 'click')
          const done = c.beats.slice(i).find((x) => x.k === 'done')
          expect(reveal && b.at - reveal.at).toBeGreaterThanOrEqual(400)
          expect(click && click.at - b.at).toBeGreaterThanOrEqual(800) // the pointer's .8s move
          expect(done && done.at).toBeGreaterThan(click!.at)
        })
      }
    }
  })
  it('only the landlord approves: no card and no tap in the agent’s or the tenant’s phone', () => {
    for (const lang of LANGS) {
      for (const c of beatsOf(lang)) {
        for (const b of c.beats) {
          if (b.k === 'card' || b.k === 'click' || b.k === 'pointer' || (b.k === 'reply' && b.card)) expect(b.lane).toBe('sarah')
        }
      }
    }
  })
  it('greetings and the executed line are the ones the session hook uses', () => {
    for (const lang of LANGS) {
      for (const p of PEOPLE) expect(greetingFor(p, lang)).toBe(greeting(CAST[p].role, CAST[p].assistant, lang))
      for (const c of beatsOf(lang)) {
        let lastCard: { title: string; action_type: string; metadata: Record<string, unknown> } | null = null
        for (const b of c.beats) {
          if (b.k === 'card') lastCard = b.card
          if (b.k === 'reply' && b.card) lastCard = b.card
          if (b.k === 'done') {
            const option = c.beats.find((x) => x.k === 'click')
            const rent = option && option.k === 'click' && option.option === 'B' ? (lastCard!.metadata.guideline_rent as number) : undefined
            // 消息系统 A 期: the showing receipt names the prospect (relay), the others the address the notice went to.
            const sentTo = lastCard!.action_type === 'showing_request' ? 'Mia Chen' : MIA_EMAIL
            expect(b.text).toBe(executedText({ title: lastCard!.title, actionType: lastCard!.action_type, sentTo, rent, zh: lang === 'zh' }))
          }
        }
      }
    }
  })
  it('the showing card and its push are worded as /api/showing-intent writes them', () => {
    const route = read('app/api/showing-intent/route.ts')
    expect(route).toContain("title: kind === 'showing' ? `看房请求：${who} · ${addr}`")
    expect(route).toContain("'批准 = 同意安排看房：我会邮件告诉对方，你们在「消息」里的这段对话约时间（双方都看不到对方的私人邮箱）；拒绝则不回复。也可以直接去对话里回复。'")
    expect(route).toContain("' 按 OHRC 租房政策，看房与回答提问不得因受保护特征区别对待。'")
    expect(route).toContain("data_scope: ['房源地址', '这段对话的链接']")
    expect(route).toContain("excluded_data: ['你的私人邮箱', '筛查报告', '其他申请人信息']")
    expect(route).toContain("title: kind === 'showing' ? `看房请求 · ${addr}`")
    const b = beatsOf('zh')[1].beats.find((x) => x.k === 'card')!
    if (b.k !== 'card') throw new Error('no card')
    expect(b.card.title).toBe('看房请求：Mia Chen · King St W #1207')
    expect(b.card.summary).toContain(`Mia Chen 想看房，期望入住 ${filmDates(NOW).moveIn}：`)
    expect(b.card.summary).not.toContain(MIA_EMAIL)
    expect(b.card.summary).toContain('批准 = 同意安排看房：我会邮件告诉对方，你们在「消息」里的这段对话约时间（双方都看不到对方的私人邮箱）；拒绝则不回复。也可以直接去对话里回复。 按 OHRC 租房政策，看房与回答提问不得因受保护特征区别对待。')
    expect(b.card.data_scope).toEqual(['房源地址', '这段对话的链接'])
    expect(b.card.excluded_data).toEqual(['你的私人邮箱', '筛查报告', '其他申请人信息'])
    expect(b.card.risk_level).toBe('low')
  })
  it('the admission card is the one the applicant page drafts', () => {
    const page = read('app/landlord/applicants/[id]/page.tsx')
    expect(page).toContain("decision === 'approved' ? `录取通知：${name} · ${listingAddr}`")
    // Relay (找得到人 2026-09-30): the card names the applicant; the executor reads the address from the application row.
    expect(page).toContain('`批准后我会给${applicantWhoSp}发录取通知（发到 TA 申请时填写的邮箱），并说明租约随后送达。信里固定带《消费者报告法》s.10(7) 与 OHRC 声明。`')
    expect(page).toContain("const applicantWho = hasName ? `申请人 ${name}` : '申请人'")
    expect(page).toContain("excluded_data: ['筛查报告', '评分', '其他申请人信息']")
    const b = beatsOf('zh')[2].beats.find((x) => x.k === 'card')!
    if (b.k !== 'card') throw new Error('no card')
    expect(b.card.action_type).toBe('send_decision')
    expect(b.card.title).toBe('录取通知：Mia Chen · King St W #1207')
    expect(b.card.summary).toBe('批准后我会给申请人 Mia Chen 发录取通知（发到 TA 申请时填写的邮箱），并说明租约随后送达。信里固定带《消费者报告法》s.10(7) 与 OHRC 声明。')
    expect(b.card.summary).not.toContain(MIA_EMAIL)
    expect(b.card.data_scope).toEqual(['申请结果', '申请对话（对方回邮件即进对话）'])
    expect(b.card.excluded_data).toEqual(['筛查报告', '评分', '其他申请人信息'])
  })
  it('the renewal card is the 90-day sweep’s own, run a year on, with the guideline for the year it takes effect', () => {
    const D = filmDates(NOW)
    const b = beatsOf('zh')[4].beats.find((x) => x.k === 'card')!
    if (b.k !== 'card') throw new Error('no card')
    const p = buildRenewalProposal('film', { id: 'film-lease', tenant_name: 'Mia Chen', tenant_email: MIA_EMAIL, unit_label: 'Unit 1207', monthly_rent: RENT, end_date: D.leaseEnd }, D.renewalDay, null)
    expect(b.card.title).toBe(p.title)
    expect(b.card.summary).toBe(p.summary)
    expect(b.card.metadata).toEqual(p.metadata)
    const effective = new Date(Date.parse(`${D.leaseEnd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    const g = guidelineFor(effective)
    expect(b.card.metadata.guideline_pct).toBe(g.pct)
    expect(b.card.title).toContain('（还有 91 天）')
    // the N1 is still servable on the day the card lands
    expect(n1DeadlineFor(effective) >= D.renewalDay.toISOString().slice(0, 10)).toBe(true)
    // the tap picks option B; the push is the sweep's
    const click = beatsOf('zh')[4].beats.find((x) => x.k === 'click')
    expect(click && click.k === 'click' && click.option).toBe('B')
    expect(read('app/api/agent/proactive/route.ts')).toContain("'批准后才会执行 / Runs only after you approve'")
  })
  it('a year on means a year on: move-in, term end and the renewal day follow from today, any month of the year', () => {
    for (let m = 0; m < 12; m++) {
      const now = new Date(Date.UTC(2026, m, 15, 12))
      const D = filmDates(now)
      expect(D.moveIn.endsWith('-01')).toBe(true)
      const moveIn = Date.parse(`${D.moveIn}T00:00:00Z`)
      const end = Date.parse(`${D.leaseEnd}T00:00:00Z`)
      expect(new Date(end + 86_400_000).toISOString().slice(5, 10)).toBe(D.moveIn.slice(5, 10)) // a full year, to the day
      expect((end - D.renewalDay.getTime()) / 86_400_000).toBe(91)
      expect(moveIn).toBeGreaterThan(now.getTime())
      // David's delegation (12 months, the product's limit) is still live on the renewal day
      expect(Date.parse(D.delegationUntil)).toBeGreaterThan(D.renewalDay.getTime())
    }
    expect(MAX_MONTHS).toBeGreaterThanOrEqual(12)
  })
  it('emails arrive as the subjects the product sends', () => {
    const exec = read('app/api/agent/execute/route.ts')
    expect(exec).toContain('`看房请求已确认 · ${addr} / Showing request accepted`')
    expect(exec).toContain('`申请已录取 · ${addr} / Your application was approved`')
    expect(exec).toContain('`Lease renewal offer — ${unit}`')
    expect(read('lib/lease/sendLease.ts')).toContain("`Your lease for ${lease.unit_label || 'your new home'} is ready to sign — ${formLabel}`")
    const mails = beatsOf('zh').flatMap((c) => c.beats).filter((b) => b.k === 'notify' && b.kind === 'mail').map((b) => (b.k === 'notify' ? b.title : ''))
    expect(mails).toEqual([
      '看房请求已确认 · King St W #1207 / Showing request accepted',
      '申请已录取 · King St W #1207 / Your application was approved',
      'Your lease for Unit 1207 is ready to sign — Ontario Standard Lease',
      'Lease renewal offer — Unit 1207',
    ])
    for (const b of beatsOf('zh').flatMap((c) => c.beats)) if (b.k === 'notify' && b.kind === 'mail') expect(b.lane).toBe('mia')
  })
  it('the search reply carries the route’s own filter line, and its photos are the product’s placeholders', () => {
    const reply = beatsOf('zh')[1].beats.find((x) => x.k === 'reply' && x.lane === 'mia')
    expect(reply && reply.k === 'reply' && reply.msg.text).toContain('（已按 预算 ≤ $2,800 · 1 房以上 · 允许宠物 过滤）')
    const search = read('lib/agent/listingSearch.ts')
    for (const u of FILM_STOCK) expect(search).toContain(u)
  })
  it('no screening score, no statistic, no percentage but the statutory guideline — and nothing of the kind on the tenant’s phone', () => {
    const g = guidelineFor(new Date(Date.parse(`${filmDates(NOW).leaseEnd}T00:00:00Z`) + 86_400_000)).pct
    for (const lang of LANGS) {
      for (const c of beatsOf(lang)) {
        for (const b of c.beats) {
          const t = texts(b).join(' ')
          expect(t).not.toMatch(/\d+\s*\/\s*100|\d+\s*分(?!钟)|score of \d|credit \d{3}|\d{2,3}% match|满意度|成交量|\d+ (clients|users|landlords)/i)
          for (const m of t.matchAll(/(\d+(?:\.\d+)?)%/g)) expect(Number(m[1])).toBe(g)
          if ('lane' in b && b.lane === 'mia') expect(t).not.toMatch(/分数|评分|score/i)
        }
      }
    }
  })
  it('rents read the way people write them — the same figure on the card, its buttons, the executed line and the letter', () => {
    expect(rentAmount(2800)).toBe('2,800')
    expect(rentAmount(2853.2)).toBe('2,853.20')
    expect(card).toContain('$${rentAmount(m.guideline_rent)}')
    expect(read('lib/agent/renewalStages.ts')).toContain('const fmt = rentAmount')
    expect(read('app/api/agent/execute/route.ts')).toContain('Proposed monthly rent: $${rentAmount(rent ?? 0)}')
    expect(read('lib/agent/chatCopy.ts')).toContain('（月租 $${rentAmount(rent)}）')
  })
})

describe('the cast', () => {
  it('each assistant wears a real preset; the scenes and faces are small files on disk', () => {
    for (const p of PEOPLE) expect(AVATAR_PRESETS.some((a) => a.key === CAST[p].avatar), p).toBe(true)
    for (const src of [...Object.values(SHOTS), ...Object.values(FACES)]) {
      const f = `public${src}`
      expect(existsSync(f), f).toBe(true)
      expect(statSync(f).size, f).toBeLessThanOrEqual(60_000)
    }
    // the canon: Mia Chen / Sarah Wang / David Park, Unit 1207, $2,800
    expect(PEOPLE.map((p) => CAST[p].name)).toEqual(['Mia Chen', 'Sarah Wang', 'David Park'])
    expect(RENT).toBe(2800)
  })
})

describe('on the homepage', () => {
  it('is its own section, “How Stayloop works”, right after the hero — loaded lazily with a placeholder of the film’s size', () => {
    expect(home).toContain("const ThreeRoleFilm = dynamic(() => import('@/components/home/ThreeRoleFilm'), {")
    expect(home).toContain('ssr: false')
    for (const h of ['h-[600px]', 'lg:h-[660px]', 'h-[42px]', 'h-[74px] md:h-[52px]', 'h-[74px] md:h-[59px]']) expect(home, h).toContain(h)
    expect(film).toContain('h-[600px]')
    expect(film).toContain('min-h-[74px]')
    expect(film).toContain('md:min-h-[52px]')
    // the hero (message + login card) is followed directly by the film's section; the hero itself carries no film
    const hero = home.slice(home.indexOf('HERO: message + login card'), home.indexOf('{/* ================= HOW IT WORKS'))
    expect(hero).not.toContain('<ThreeRoleFilm />')
    expect(hero).toContain('<LoginCard className="mx-auto mt-8 w-full max-w-[400px] scroll-mt-24 sm:mt-10" />')
    const section = home.slice(home.indexOf('{/* ================= HOW IT WORKS'), home.indexOf('{/* ================= ROLES'))
    expect(section).toContain('<section id="how-it-works" className="border-t border-line-divider">')
    expect(section).toContain("{zh ? 'Stayloop 是怎么工作的' : 'How Stayloop works'}")
    expect(section).toContain('text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]') // the homepage's section heading
    expect(section.indexOf('<h2')).toBeLessThan(section.indexOf('<ThreeRoleFilm />'))
    expect(section).toContain('data-testid="home-film"')
    // the lead only sets the scene; the approval rule is spelled out once, in the four-step loop under the film
    const pTag = section.slice(section.indexOf('<p '), section.indexOf('</p>'))
    const lead = pTag.slice(pTag.indexOf('>') + 1) // the text, not the tag's own classes
    for (const w of ['各有自己的 AI 助理', '三个助理之间接力', '从委托挂牌演到续约', 'own AI Agent', 'passes from one to the next', 'from listing to renewal']) expect(lead, w).toContain(w)
    expect(lead).not.toMatch(/\d/)
    expect(lead).not.toContain('—')
    expect(section.indexOf('<ThreeRoleFilm />')).toBeLessThan(section.indexOf('data-testid="home-flow"'))
    expect(section).toContain('<Link href="/platform"')
    expect(existsSync('components/home/HeroShowcase.tsx')).toBe(false)
  })
  it('labelled as a sample with AI-made characters, right under the film', () => {
    expect(film).toContain("{zh ? '示范动画 · 3D 人物由 AI 生成 · 内容为示范' : 'Sample animation · AI-made 3D characters · illustrative'}")
  })
})
