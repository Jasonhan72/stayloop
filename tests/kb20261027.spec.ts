// Knowledge base (RAG) · 2026-10-27, design/rag-knowledge-base-plan-2026-10-27.md. Rules this file keeps:
//   • chunking: one chunk per e-Laws section with its number, part and headnote; "Y" paragraphs = not yet
//     in force; amendment citations dropped; guide pages split at h2/h3 and keep text that sits in <div>s
//   • trigger: law / procedure / rights questions retrieve; home search and data questions do not
//   • citations: a section or guideline number the reply cites must be in the passages; otherwise rewritten
//   • the tables are service-role only, the RPC is locked, the feature is off by default and gated by audience
//   • the turn route retrieves before the model call, checks citations after the guardrail, and the receipt says so
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { approxTokens, chunkElaws, chunkHtmlGuide, guideRows, splitAtLines, stripTags } from '@/lib/kb/chunk'
import { kbEmbedText, kbQueryText, shouldRetrieve } from '@/lib/kb/trigger'
import { allowedSections, checkCitations, kbPromptBlock, kbReceiptLine, referenceList, shortSourceLabel } from '@/lib/kb/cite'
import { KB_DEFAULTS, kbEnabledFor, parseKbConfig } from '@/lib/kb/config'
import { EMBED_DIMS, EMBED_MODELS, embedModelDef, vectorLiteral } from '@/lib/llmEmbed'
import type { KbHit } from '@/lib/kb/search'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

const ELAWS = `
<p class="toc tocExpandable">CONTENTS</p>
<p class="table"><a href="#BK1">1. Purposes</a></p>
<p class="partnum"><a name="BK0"></a>part vii <br> rules relating to rent</p>
<p class="heading1">Notice of Rent Increase</p>
<p class="headnote">Notice of rent increase required</p>
<p class="section"><a name="BK140"></a><b>116 </b>(1) A landlord shall not increase the rent charged to a tenant for a rental unit without first giving the tenant at least 90 days written notice of the landlord&rsquo;s intention to do so. <span class="citation">2006, c. 17, s. 116 (1).</p></span>
<p class="headnote">Same</p>
<p class="subsection">(2) Subsection (1) applies even if the rent charged is increased in accordance with an order under section 126. <span class="citation">2006, c. 17, s. 116 (2).</p></span>
<p class="footnoteLeft amendments collapsed">Section Amendments with date in force (d/m/y)</p>
<p class="Yheadnote">Exclusion from rent</p>
<p class="Ysection"><a name="BK200"></a><b>165.1 </b>(1) This section applies with respect to an amount that a landlord charges. <span class="citation">2020, c. 16, Sched. 4, s. 26.</p></span>
`

describe('chunking e-Laws text', () => {
  it('one chunk per section with number, part, headnote and anchor; citations dropped; Y = not yet in force', () => {
    const ch = chunkElaws(ELAWS)
    expect(ch.map((c) => c.sectionRef)).toEqual(['116', '165.1'])
    expect(ch[0].headingPath).toEqual(['Part VII Rules Relating To Rent', 'Notice of Rent Increase', 'Notice of rent increase required'])
    expect(ch[0].text).toContain('at least 90 days written notice')
    expect(ch[0].text).toContain('— Same')
    expect(ch[0].text).not.toMatch(/2006, c\. 17/)
    expect(ch[0].text).not.toContain('CONTENTS')
    expect(ch[0].anchor).toBe('BK140')
    expect(ch[0].inForce).toBe(true)
    expect(ch[1].inForce).toBe(false)
    expect(ch[0].tokens).toBe(approxTokens(ch[0].text))
  })
  it('long sections split at line boundaries with a part marker on the ref; oversize lines cut at sentence ends', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `(${i + 1}) ${'word '.repeat(60)}`)
    const pieces = splitAtLines(lines, 800)
    expect(pieces.length).toBeGreaterThan(2)
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(800)
    expect(splitAtLines(['a. '.repeat(600)], 500).every((p) => p.length <= 500)).toBe(true)
    expect(stripTags('<b>116 </b>A &amp; B&nbsp;C')).toBe('116 A & B C')
  })
})

describe('chunking guide pages', () => {
  const PAGE = `<html><body><nav><a>Skip</a></nav><main><h1>Interpretation Guideline 14</h1>
  <p>(Disponible en français)</p><p>${'This guideline assists parties. '.repeat(6)}</p>
  <h3>Filing an AGI Application</h3><div>${'An L5 form is filed with the Board. '.repeat(6)}</div>
  <ul><li>${'One item. '.repeat(12)}</li></ul></main><footer>x</footer></body></html>`
  it('keeps text in divs and lists, splits at headings, drops nav / footer', () => {
    const rows = guideRows(PAGE)
    expect(rows[0]).toEqual({ level: 1, text: 'Interpretation Guideline 14' })
    expect(rows.some((r) => r.text.startsWith('An L5 form'))).toBe(true)
    expect(rows.some((r) => r.text === 'Skip' || r.text === 'x')).toBe(false)
    const ch = chunkHtmlGuide(PAGE, 'IG 14')
    expect(ch.length).toBe(2)
    expect(ch[0].headingPath).toEqual(['Interpretation Guideline 14'])
    expect(ch[1].headingPath).toEqual(['Interpretation Guideline 14', 'Filing an AGI Application'])
    expect(ch[1].sectionRef).toBeNull()
  })
})

describe('trigger', () => {
  it('law / procedure / rights questions retrieve; home search, drafting and data questions do not', () => {
    for (const q of ['房东说明年要涨租 4%，合法吗', '我收到了 N4 怎么办', 'How much notice to enter my unit?', '押金能收两个月吗', '租客养狗能赶走吗', 'can I ask about their kids?']) expect(shouldRetrieve(q), q).toBe(true)
    for (const q of ['帮我找北约克两室一厅的房子', 'find me a condo near Yonge and Sheppard', '我有几份租约', '帮我写一条欢迎消息', '你好', 'thanks']) expect(shouldRetrieve(q), q).toBe(false)
  })
  it('the full-text query carries English topic words for the Chinese question plus any form numbers', () => {
    expect(kbQueryText('我收到了 N4，有几天时间补交？')).toContain('N4')
    expect(kbQueryText('房东要涨租 4%')).toContain('rent increase')
    expect(kbQueryText('押金可以收多少')).toContain('deposit')
    expect(kbEmbedText('房东要涨租')).toMatch(/^房东要涨租\nrent increase/)
  })
})

const hit = (over: Partial<KbHit>): KbHit => ({
  chunk_id: 'c', document_id: 'd', source_key: 'on-rta-2006', source_title: 'Residential Tenancies Act, 2006', authority_level: 1,
  title: 'Residential Tenancies Act, 2006', url: 'https://www.ontario.ca/laws/statute/06r17#BK140', section_ref: '116',
  heading_path: ['Part VII', 'Notice of rent increase required'], body: '(1) A landlord shall not increase the rent … under section 126.', in_force: true,
  consolidated_date: '2026-09-21', meta: { anchor: 'BK140' }, score: 0.03, ...over,
})

describe('prompt block and citations', () => {
  const hits = [hit({}), hit({ chunk_id: 'c2', section_ref: '126 (1/5)', body: 'A landlord may apply to the Board for an above guideline increase.', url: 'https://www.ontario.ca/laws/statute/06r17#BK150' }), hit({ chunk_id: 'c3', title: 'LTB Interpretation Guideline 14 — Applications for Rent Increases above the Guideline', section_ref: null, authority_level: 3, in_force: false, body: 'This guideline assists parties.' })]
  it('numbers the passages, says the rules, marks not-yet-in-force, and respects the character budget', () => {
    const block = kbPromptBlock(hits, 'zh')
    expect(block).toContain('[K1] Residential Tenancies Act, 2006 · s. 116 · 合并至 2026-09-21')
    expect(block).toContain('[K2] Residential Tenancies Act, 2006 · s. 126 (1/5)')
    expect(block).toContain('尚未生效')
    expect(block).toContain('只能引用这些段落里出现的条号')
    expect(kbPromptBlock(hits, 'zh', 400).match(/\[K\d\]/g)?.length ?? 0).toBeLessThan(3)
    expect(kbPromptBlock([], 'zh')).toBe('')
  })
  it('cited sections must be in the passages (their own refs and cross-references); invented ones are rewritten', () => {
    expect([...allowedSections(hits)].sort()).toEqual(['116', '126'])
    const ok = checkCitations('要提前 90 天用 N1 通知（RTA s. 116）[K1]，超额涨租要向 LTB 申请（s. 126）[K2]。', hits, 'zh')
    expect(ok.invented).toEqual([])
    expect(ok.reply).toContain('RTA s. 116')
    const bad = checkCitations('依据 RTA s. 999 和 section 42，以及解释指南 7。', hits, 'zh')
    expect(bad.invented).toEqual(['s.999', 's.42', 'guideline 7'])
    expect(bad.reply).not.toContain('999')
    expect(bad.reply).toContain('具体条号以官方页面为准')
    expect(checkCitations('租约第 3 条写了不能养宠物。', hits, 'zh').invented).toEqual([])
    expect(checkCitations('按解释指南 14', hits, 'zh').invented).toEqual([])
  })
  it('[K] markers become [n] in first-use order and only used passages are listed', () => {
    const { reply, refs } = referenceList('先看 [K2]，再看 [K1]，再提一次 [K2]。', hits)
    expect(reply).toBe('先看 [1]，再看 [2]，再提一次 [1]。')
    expect(refs.map((r) => [r.n, r.ref, r.url])).toEqual([[1, 's. 126', 'https://www.ontario.ca/laws/statute/06r17#BK150'], [2, 's. 116', 'https://www.ontario.ca/laws/statute/06r17#BK140']])
    expect(referenceList('没有引用。', hits).refs).toEqual([])
    expect(referenceList('坏编号 [K9]', hits).reply).toBe('坏编号')
    // the turn model writes combined markers (seen live 2026-10-27: 「第 7 天 [K2, K3]」)
    const multi = referenceList('终止日在送达后第 7 天 [K2, K3]。补齐欠租即失效 [K1、K2]。', hits)
    expect(multi.reply).toBe('终止日在送达后第 7 天 [1, 2]。补齐欠租即失效 [3, 1]。')
    expect(multi.refs.map((r) => r.n)).toEqual([1, 2, 3])
  })
  it('receipt line names the sources short', () => {
    expect(shortSourceLabel('Residential Tenancies Act, 2006', '116', 'zh')).toBe('RTA s. 116')
    expect(shortSourceLabel('O. Reg. 516/06 — General', '12 (1/2)', 'en')).toBe('O. Reg. 516/06 s. 12')
    expect(shortSourceLabel('LTB Interpretation Guideline 14 — AGI', null, 'zh')).toBe('LTB 解释指南 14')
    expect(shortSourceLabel('LTB Interpretation Guideline 7 — Relief', '83(4)-(5) - Compensation owing by the Landlord', 'zh')).toBe('LTB 解释指南 7')
    const line = kbReceiptLine(hits, referenceList('[K1] [K3]', hits).refs, 'zh')
    expect(line.zh).toBe('查了法规原文：RTA s. 116、LTB 解释指南 14')
    expect(kbReceiptLine(hits, [], 'en').en).toContain('Checked the law text: RTA s. 116')
  })
})

describe('config, embeddings, schema', () => {
  it('off by default; dirty values fall back; audience gate', () => {
    expect(parseKbConfig(null)).toEqual(KB_DEFAULTS)
    const c = parseKbConfig({ enabled: true, audience: 'test', allow_user_ids: ['00000000-0000-0000-0000-000000000001', 'x'], top_k: 99, embed_model: '' })
    expect(c.allowUserIds).toEqual(['00000000-0000-0000-0000-000000000001'])
    expect(c.topK).toBe(12)
    expect(c.embedModel).toBe('gemini-embedding-001')
    expect(kbEnabledFor(c, { userId: '00000000-0000-0000-0000-000000000001', anonymous: false })).toBe(true)
    expect(kbEnabledFor(c, { userId: '00000000-0000-0000-0000-000000000002', anonymous: false })).toBe(false)
    expect(kbEnabledFor(c, { userId: null, anonymous: true })).toBe(false)
    expect(kbEnabledFor({ ...c, audience: 'all' }, { userId: null, anonymous: true })).toBe(true)
    expect(kbEnabledFor({ ...c, enabled: false, audience: 'all' }, { userId: null, anonymous: true })).toBe(false)
  })
  it('embedding models are keyed providers already in PROVIDER envs; vectors are 1024-d literals', () => {
    for (const m of Object.values(EMBED_MODELS)) expect(['GEMINI_API_KEY', 'OPENAI_API_KEY', 'JINA_API_KEY']).toContain(m.apiKeyEnv)
    expect(embedModelDef('nope').id).toBe('gemini-embedding-001')
    expect(EMBED_DIMS).toBe(1024)
    expect(vectorLiteral([0.1, -0.25, NaN])).toBe('[0.100000,-0.250000,0]')
    const e = code('lib/llmEmbed.ts')
    expect(e).toContain("slot: 'embed'")
    expect(e).toContain('recordUsage(')
  })
  it('migration: three tables service-role only, halfvec(1024) + tsv, RPC locked to service_role, feature row off for everyone but the list', () => {
    const sql = read('supabase/migrations/20261027_knowledge_base.sql')
    for (const t of ['knowledge_sources', 'knowledge_documents', 'knowledge_chunks']) {
      expect(sql).toContain(`alter table public.${t} enable row level security`)
      expect(sql).toContain(`revoke all on public.${t} from public, anon, authenticated`)
    }
    expect(sql).not.toMatch(/create policy/)
    expect(sql).toContain('embedding    extensions.halfvec(1024)')
    expect(sql).toContain('using hnsw (embedding extensions.halfvec_cosine_ops)')
    expect(sql).toContain("status            text not null default 'current' check (status in ('current','superseded'))")
    const rpc = read('supabase/migrations/20261027_knowledge_base_meta.sql')
    expect(rpc).toContain('security definer')
    expect(rpc).toContain('revoke execute on function public.kb_search(extensions.halfvec, text, text, integer, date) from public, anon, authenticated')
    expect(rpc).toContain('grant execute on function public.kb_search(extensions.halfvec, text, text, integer, date) to service_role')
    expect(rpc).toContain("d.status = 'current'")
    expect(sql).toContain('"audience": "test"')
  })
  it('the ingest never deletes a version and marks the previous one superseded', () => {
    const s = code('scripts/kb/ingest.ts')
    expect(s).not.toMatch(/\.delete\(/)
    expect(s).toContain("update({ status: 'superseded', superseded_by: doc.id")
    expect(s).toContain("task: 'document'")
    expect(code('scripts/kb/sources.ts')).toContain("key: 'on-rta-2006'")
  })
})

describe('turn route wiring', () => {
  it('retrieves before the model call, checks citations after the guardrail, lists sources and says so in the receipt', () => {
    const r = code('app/api/agent/turn/route.ts')
    expect(r).toContain('if (shouldRetrieve(message)) {')
    expect(r).toContain('kbEnabledFor(kbCfg, { userId: anonymous ? null : turnUserId, anonymous })')
    expect(r).toContain('if (kbHits.length) system += kbPromptBlock(kbHits, uiLang, kbCfg.maxChars)')
    expect(r.indexOf('system += kbPromptBlock')).toBeLessThan(r.indexOf('const callTurn = (m: CatalogModel) => llmChat({'))
    expect(r.indexOf('const cc = checkCitations(out.reply, kbHits, uiLang)')).toBeGreaterThan(r.indexOf('const { out, flags } = applyGuardrail(role, normalized, uiLang, turnProvince)'))
    expect(r).toContain("flags.push('kb_uncited')")
    expect(r).toContain("receipt.read.push({ kind: 'knowledge', ...kbReceiptLine(kbHits, kbRefs, uiLang) })")
    expect(r).toContain('knowledge: kbRefs.length ? kbRefs : undefined,')
    expect(code('lib/agent/orchestrator.ts')).toContain('knowledge: turn.knowledge,')
    expect(code('lib/agent/useAgentSession.ts').match(/knowledge = turn\.knowledge/g)?.length).toBe(2)
    const c = code('components/agent/AgentChat.tsx')
    expect(c).toContain('data-testid="kb-references"')
    expect(c).toContain('<TurnReceiptCard receipt={m.receipt} memoryNotes={m.memoryNotes} knowledge={m.knowledge} zh={zh} />')
    expect(c).toContain('rel="noopener noreferrer"')
  })
})
