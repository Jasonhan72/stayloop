// 2026-10-02 user: 「外省的要查外省的法规，不要用安省的法规和说法」 — the AI Agent side.
// A landlord's listing outside Ontario (the Montréal listing that started this) gets its own
// province's facts in the prompt, a draft keeps a lawful "no pets", and the guardrail adds
// no RTA note and names that province's human-rights law. Ontario stays byte-for-byte.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  applyGuardrail,
  provinceOfDraft,
  provinceOfOwnedListingInMessage,
  sanitizeDraftListing,
  type TurnOutput,
} from '@/lib/agent/guardrail'
import { buildSystemPrompt, landlordListingsBlock, OUT_OF_PROVINCE_FACTS_HEADING } from '@/lib/agent/prompts'
import type { OwnedListingRow } from '@/lib/agent/draftExisting'
import { aiFactsBlock, PROVINCE_CODES } from '@/lib/provinces'

const ONTARIO_WORDS = /安省|安大略|OHRC|\bRTA\b|\bLTB\b|RECO|TRESA|Ontario/

const MONTREAL: OwnedListingRow = {
  id: '282fbbb1-0000-0000-0000-000000000000',
  slug: '1569-rue-st-hubert-montr-al-qc-h2l-3z1-mr33ii5a',
  address: '1569 rue St-Hubert, Montréal, QC, H2L 3Z1',
  unit: null,
  city: 'Montréal',
  province: 'QC',
  postal_code: null,
  neighborhood: null,
  monthly_rent: 2225,
  bedrooms: 1,
  bathrooms: 1,
  sqft: null,
  images: ['a', 'b'],
  amenities: [],
  title: 'Montréal 1 bedroom',
  description: 'Bright unit near the Latin Quarter.',
  is_active: true,
  verification_status: 'verified',
  source: 'stayloop',
  pet_policy: '宠物友好 / Pets welcome',
}
const TORONTO: OwnedListingRow = {
  id: '11111111-0000-0000-0000-000000000000',
  slug: '28-avondale-ave',
  address: '28 Avondale Ave',
  unit: '1203',
  city: 'Toronto',
  province: 'ON',
  postal_code: 'M2N 0E1',
  neighborhood: 'Willowdale',
  monthly_rent: 2450,
  bedrooms: 1,
  bathrooms: 1,
  sqft: 600,
  images: [],
  amenities: ['gym', 'pool'],
  title: null,
  description: '',
  is_active: true,
  verification_status: 'pending',
  source: 'stayloop',
}

const turn = (reply: string, partial: Partial<TurnOutput> = {}): TurnOutput => ({ reply, memoryWrites: [], proposedAction: null, nextStage: null, ...partial })

describe('drafts: "no pets" is Ontario-void only', () => {
  it('a Quebec draft keeps "No pets" and gets no RTA note', () => {
    const r = sanitizeDraftListing({ address: '1569 rue St-Hubert', city: 'Montréal', pet_policy: 'No pets', description: 'No pets. Near the métro.' }, 'zh', 'QC')
    expect(r.draft.pet_policy).toBe('No pets')
    expect(r.draft.description).toBe('No pets. Near the métro.')
    expect(r.flags).toEqual([])
    expect(r.note).toBeNull()
  })
  it('an Ontario draft (and one with no province) still rewrites it with the RTA note', () => {
    for (const p of ['ON', null, undefined]) {
      const r = sanitizeDraftListing({ address: '28 Avondale Ave', pet_policy: 'No pets' }, 'zh', p)
      expect(r.draft.pet_policy, String(p)).toContain('RTA')
      expect(r.flags).toContain('draft_listing_illegal_term_pet_policy')
      expect(r.note).toContain('OHRC')
    }
  })
  it('where no fact covers a pet ban (Nunavut) the draft is left alone and nothing is said', () => {
    const r = sanitizeDraftListing({ address: '1 Main St', pet_policy: 'No pets' }, 'zh', 'NU')
    expect(r.draft.pet_policy).toBe('No pets')
    expect(r.note).toBeNull()
  })
  it('protected-ground exclusions are still removed outside Ontario, and the note names that province’s law', () => {
    const zh = sanitizeDraftListing({ address: '1569 rue St-Hubert', title: 'Adults only 1BR', description: 'No children.' }, 'zh', 'QC')
    expect(zh.draft.title).toBeUndefined()
    expect(zh.draft.description).toBeUndefined()
    expect(zh.note).toContain('《魁北克人权与自由宪章》')
    expect(zh.note).not.toMatch(ONTARIO_WORDS)
    const en = sanitizeDraftListing({ address: '1569 rue St-Hubert', title: 'Adults only 1BR' }, 'en', 'QC')
    expect(en.note).toContain('the Charter of human rights and freedoms')
    expect(en.note).not.toMatch(ONTARIO_WORDS)
  })
  it('no province outside Ontario gets an Ontario word in a draft note', () => {
    for (const c of PROVINCE_CODES.filter((x) => x !== 'ON')) {
      for (const lang of ['zh', 'en'] as const) {
        const r = sanitizeDraftListing({ address: 'x', title: 'Couples only', pet_policy: 'No pets' }, lang, c)
        expect(r.note, `${c} ${lang}`).toBeTruthy()
        expect(r.note, `${c} ${lang}`).not.toMatch(ONTARIO_WORDS)
        expect(r.draft.pet_policy, `${c} ${lang}`).toBe('No pets')
      }
    }
  })
})

describe('applyGuardrail with a province', () => {
  it('a Quebec turn gets no Ontario lease note', () => {
    const r = applyGuardrail('landlord', turn('附表 B：禁止养宠。'), 'zh', 'QC')
    expect(r.out.reply).toBe('附表 B：禁止养宠。')
    expect(r.flags).not.toContain('illegal_lease_term')
    const en = applyGuardrail('landlord', turn('Schedule B: no pets.'), 'en', 'QC')
    expect(en.out.reply).toBe('Schedule B: no pets.')
  })
  it('Ontario (and unknown) turns keep the RTA note byte-for-byte', () => {
    for (const p of ['ON', null, undefined]) {
      const r = applyGuardrail('landlord', turn('附表 B：禁止养宠。'), 'zh', p)
      expect(r.out.reply).toBe('附表 B：禁止养宠。\n\n注：安省 RTA 下「禁止养宠」「押金超过一个月」等条款无效,我不会写进租约。')
    }
  })
  it('a protected-ground refusal about a Quebec listing is still corrected, in Quebec law', () => {
    const r = applyGuardrail('landlord', turn('由于您有孩子且家庭状况不符合，我们决定拒绝您的申请。'), 'zh', 'QC')
    expect(r.flags).toContain('discriminatory_language_in_reply')
    expect(r.out.reply).toContain('按《魁北克人权与自由宪章》')
    expect(r.out.reply).not.toMatch(ONTARIO_WORDS)
    const on = applyGuardrail('landlord', turn('由于您有孩子且家庭状况不符合，我们决定拒绝您的申请。'), 'zh')
    expect(on.out.reply).toContain('按安省人权法（OHRC）')
  })
  it('a refusal card on a protected ground is blocked and the note names the province’s law', () => {
    const action = { action_type: 'reject_applicant', title: '拒绝申请', summary: '申请人有孩子，家庭状况不合适', recipient_label: '申请人', data_scope: [], excluded_data: [], risk_level: 'high' as const }
    const r = applyGuardrail('landlord', turn('ok', { proposedAction: action }), 'en', 'BC')
    expect(r.out.proposedAction).toBeNull()
    expect(r.flags).toContain('blocked_discriminatory_rejection')
    expect(r.out.reply).toContain('Under British Columbia’s Human Rights Code')
    expect(r.out.reply).not.toMatch(ONTARIO_WORDS)
  })
})

describe('the landlord’s listings table', () => {
  it('marks the Montréal listing with its province and injects the Quebec facts once', () => {
    const block = landlordListingsBlock([MONTREAL, TORONTO, { ...MONTREAL, id: 'x', slug: 'other', address: '200 rue Ontario Est, Montréal, QC, H2X 1H3' }])
    const lines = block.split('\n')
    expect(lines.find((l) => l.includes('1569 rue St-Hubert'))).toContain(' · 省份: 魁北克省')
    expect(lines.find((l) => l.includes('28 Avondale Ave'))).not.toContain('省份')
    expect(block).toContain(OUT_OF_PROVINCE_FACTS_HEADING)
    expect(block).toContain(aiFactsBlock('QC')!)
    expect(block.split('【魁北克省租房规则').length - 1).toBe(1)
  })
  it('reads the province from the postal code before a stale stored value', () => {
    const block = landlordListingsBlock([{ ...MONTREAL, province: 'ON', address: '1569 rue St-Hubert, Montréal', postal_code: 'H2L 3Z1' }])
    expect(block).toContain(' · 省份: 魁北克省')
    expect(block).toContain(aiFactsBlock('QC')!)
  })
  it('an Ontario-only table is byte-identical to the format the route built before', () => {
    // Frozen copy of the pre-2026-10-02 builder in app/api/agent/turn/route.ts.
    const legacy = (rows: Array<Record<string, unknown>>) => {
      const line = (l: Record<string, unknown>) => {
        const status = !l.is_active ? '已下架' : l.source === 'realtor' ? '上架中(Realtor.ca 导入)' : l.verification_status === 'verified' ? '上架中(已验证)' : '待审核(未公开)'
        const imgs = Array.isArray(l.images) ? l.images.length : 0
        const amen = Array.isArray(l.amenities) ? (l.amenities as string[]).slice(0, 10).join(', ') : ''
        const desc = typeof l.description === 'string' && l.description.trim() ? l.description.trim().slice(0, 500) : ''
        const head = `- ${[l.unit, l.address].filter(Boolean).join(' ')} · ${[l.neighborhood, l.city].filter(Boolean).join(' · ')} · $${l.monthly_rent}/月 · ${l.bedrooms ?? '?'}卧${l.bathrooms ?? '?'}浴${l.sqft ? ` · ${l.sqft}sqft` : ''} · 照片 ${imgs} 张 · 状态: ${status}${l.slug ? ` · /listings/${l.slug}` : ''}`
        const details = [
          l.title ? `  · 标题: ${String(l.title).slice(0, 120)}` : '  · 标题: (未填)',
          desc ? `  · 描述(${desc.length >= 500 ? '前500字' : `全文 ${desc.length} 字`}): ${desc.replace(/\s+/g, ' ')}` : '  · 描述: (未填)',
          amen ? `  · 设施: ${amen}` : null,
        ].filter(Boolean).join('\n')
        return `${head}\n${details}`
      }
      return `\n\n## 你的房源（Stayloop 数据库实时记录，共 ${rows.length} 套 —— 回答房源相关问题时以此为准）\n` + rows.map(line).join('\n') +
        '\n（只有当用户问到的房源不在上表时才说没有记录。缺的字段就是库里没有——如实说明并告诉用户到 /dashboard（房源管理）补充，不要臆测。诊断文案/照片时：直接引用并点评上面的实际标题与描述（长度、语言、是否有租客视角卖点），照片按张数评估数量是否足够；照片内容库里看不到，需要用户发图才能逐张点评。）'
    }
    const rows = [TORONTO, { ...TORONTO, id: 'y', address: '100 King St W, Toronto, ON M5X 1A9', unit: null, source: 'realtor', title: 'King West' }]
    expect(landlordListingsBlock(rows)).toBe(legacy(rows))
    expect(landlordListingsBlock(rows)).not.toContain(OUT_OF_PROVINCE_FACTS_HEADING)
    expect(landlordListingsBlock([])).toBe('')
  })
})

describe('which listing a turn is about', () => {
  it('a draft: the owned row it rewrites, else its own address and city', () => {
    expect(provinceOfDraft({ address: '1569 rue St-Hubert', city: 'Montréal' })).toBe('QC')
    expect(provinceOfDraft({ address: '1569 rue St-Hubert, Montréal, QC, H2L 3Z1' }, [MONTREAL])).toBe('QC')
    expect(provinceOfDraft({ address: '28 Avondale Ave', unit: '1203' }, [MONTREAL, TORONTO])).toBe('ON')
    expect(provinceOfDraft({ address: '28 Avondale Ave' })).toBeNull()
  })
  it('a message: the owned listing whose street it names', () => {
    expect(provinceOfOwnedListingInMessage('帮我改一下 1569 St-Hubert 那套的描述', [MONTREAL, TORONTO])).toBe('QC')
    expect(provinceOfOwnedListingInMessage('Rewrite the copy for 1569 St-Hubert', [MONTREAL, TORONTO])).toBe('QC')
    expect(provinceOfOwnedListingInMessage('28 Avondale 能不能写禁止养宠', [MONTREAL, TORONTO])).toBe('ON')
    expect(provinceOfOwnedListingInMessage('能不能写禁止养宠', [MONTREAL, TORONTO])).toBeNull()
  })
  it('the landlord’s only listing — unless the message names another address or province', () => {
    expect(provinceOfOwnedListingInMessage('我的房源能不能写禁止养宠？', [MONTREAL])).toBe('QC')
    expect(provinceOfOwnedListingInMessage('安省能不能写禁止养宠？', [MONTREAL])).toBeNull()
    expect(provinceOfOwnedListingInMessage('我想发 28 Avondale Ave，能写禁止养宠吗', [MONTREAL])).toBeNull()
    expect(provinceOfOwnedListingInMessage('anything', [])).toBeNull()
  })
})

describe('prompts: Ontario packs are for Ontario properties', () => {
  const wf = { workflow_type: 'general', workflow_id: null, current_stage: 'idle', completed_steps: [], status: 'active' as const }
  it('landlord and agent carry the province rule; the tenant gets the no-facts version', () => {
    for (const role of ['landlord', 'agent'] as const) {
      const p = buildSystemPrompt(role, 'Atlas', [], wf)
      expect(p, role).toContain('省份边界')
      expect(p, role).toContain('只适用于安大略省的物业')
      expect(p, role).toContain('「安省以外房源的法规」')
      expect(p, role).toContain('直说你只能讲安省的租房规则')
      expect(p, role).toMatch(/绝不把 RTA、LTB、N 表、安省标准租约、RECO 或 TRESA 套用/)
    }
    // No out-of-province fact block reaches the tenant: it says it can speak to Ontario rules only (review 2026-10-02).
    const tenant = buildSystemPrompt('tenant', 'Nova', [], wf)
    expect(tenant).toContain('省份边界')
    expect(tenant).toContain('直说你只能讲安省的租房规则')
    expect(tenant).toMatch(/绝不把 RTA、LTB、N 表、安省标准租约、RECO 或 TRESA 套用/)
    expect(tenant).not.toContain('「安省以外房源的法规」')
  })
  it('never prints the "Ontario rules do not apply" sentence', () => {
    for (const role of ['landlord', 'agent', 'tenant'] as const) expect(buildSystemPrompt(role, 'A', [], wf)).not.toMatch(/安省(租房)?规则不适用/)
    expect(OUT_OF_PROVINCE_FACTS_HEADING).not.toMatch(/安省(租房)?规则不适用/)
  })
})

describe('the turn route passes the province through', () => {
  const r = readFileSync('app/api/agent/turn/route.ts', 'utf8')
  it('selects province / postal code and builds the table in prompts.ts', () => {
    expect(r).toContain("source,slug,id,province,postal_code')")
    expect(r).toContain('landlordAddendum = landlordListingsBlock(myListings as Record<string, unknown>[])')
    expect(r).toContain('messageProvince = provinceOfOwnedListingInMessage(message, ownedRows)')
  })
  it('hands the turn’s province to the guardrail and the draft’s to the sanitizer', () => {
    expect(r).toContain('const { out, flags } = applyGuardrail(role, normalized, uiLang, turnProvince)')
    expect(r).toContain('draftProvince = effectiveProvince(hit as ProvinceRow)')
    expect(r).toContain('const sanitized = sanitizeDraftListing(draftListing, uiLang, draftProvince)')
    expect(r.indexOf('provinceOfDraft(')).toBeLessThan(r.indexOf('applyGuardrail(role, normalized, uiLang, turnProvince)'))
  })
  it('skips the RTA renewal pack for a turn about a listing in another province', () => {
    expect(r).toContain('if (nonOntarioProvince(messageProvince)) landlordRenewalCtx = false')
  })
})
