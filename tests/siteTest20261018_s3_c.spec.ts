// 全站测试 2026-10-17 · S3 修复组 C（2026-10-18）：
//   N-1  房东发房源对话里模型自己写「我会实时更新草稿 / 卡片」
//   N-2  草稿卡多出用户没说的「1 浴」、社区名由地址推断
//   I-D3 画像「交回自动」后 current_focus 仍是用户原文
//   E-D5 / T6-D5 披露包：取证标签英文内部短语、更正记录带管理员 uuid、房东登录邮箱
//   E-D6 决定通知邮件页脚缺 /my-file · /consumer-rights
//   T6-D7 对话消息写库前 stripNul
//   T6-D9 HTML 页面 Access-Control-Allow-Origin: *
//   T6-D8 /api/v1/screen 抓文件跟随重定向、webhook 无私网校验
//   J-D4 创建收件链接返回 201
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { applyGuardrail, dropUnsaidDraftFacts, plainLiveWording, type TurnOutput } from '@/lib/agent/guardrail'
import { packSignalLabel } from '@/lib/consumer/signalText'
import { buildDisclosurePack, type BuildPackInput, type PackScreeningRow } from '@/lib/consumer/pack'
import { renderDisclosurePack } from '@/lib/consumer/render'
import { decisionNoticeFooter } from '@/lib/ontario/rules'
import { fetchPublicHttps, isPublicHttpsUrl } from '@/lib/net/publicUrl'
import { proxy as middleware } from '@/proxy'

const read = (p: string) => readFileSync(p, 'utf8')

describe('N-1 「实时更新」说法', () => {
  it('确定性改写中英「实时更新」类说法', () => {
    expect(plainLiveWording('好的，我会实时更新草稿内容。')).toBe('好的，我会更新草稿内容。')
    expect(plainLiveWording('我会实时更新卡片')).toBe('我会更新卡片')
    expect(plainLiveWording('我会实时为你同步草稿')).toBe('我会同步草稿')
    expect(plainLiveWording('I will update the draft in real time.')).toBe('I will update the draft.')
    expect(plainLiveWording('The card gets real-time updates.')).toBe('The card gets updates.')
    expect(plainLiveWording('Live updates to the card')).toBe('updates to the card')
    expect(plainLiveWording('地址和租金我已经填好。')).toBe('地址和租金我已经填好。')
  })

  it('applyGuardrail 的回复经过这道改写', () => {
    const out = { reply: '收到！我会实时更新草稿 / 卡片。', proposedAction: null, memoryWrites: [], nextStage: null } as unknown as TurnOutput
    const r = applyGuardrail('landlord', out, 'zh')
    expect(r.out.reply).not.toContain('实时')
    expect(r.out.reply).toContain('我会更新草稿')
  })

  it('房东发房源提示词禁止「实时更新草稿 / 卡片」并给出替代说法', () => {
    const p = read('lib/agent/prompts.ts')
    expect(p).toContain('reply 里不要说「实时更新草稿 / 卡片」')
    expect(p).toContain('我把草稿更新好了')
  })
})

describe('N-2 草稿卡只留用户给的卫浴数 / 社区名', () => {
  it('用户没说卫浴、也没附照片 → 清掉 bathrooms', () => {
    const r = dropUnsaidDraftFacts({ bathrooms: 1, bathrooms_half: 1, neighborhood: undefined }, '28 Avondale Ave #1203, 1+1, $2450', false)
    expect(r.draft.bathrooms).toBeUndefined()
    expect(r.draft.bathrooms_half).toBeUndefined()
    expect(r.flags).toContain('draft_listing_unsaid_bathrooms')
  })
  it('用户说了（2房2卫 / 2b2b / 1 bath）或附了照片 → 保留', () => {
    for (const said of ['两室 2卫，$3000', '2b2b condo $3200', '1 bed 1 bath', '一个浴室']) {
      expect(dropUnsaidDraftFacts({ bathrooms: 1 }, said, false).draft.bathrooms).toBe(1)
    }
    expect(dropUnsaidDraftFacts({ bathrooms: 1 }, '28 Avondale, $2450', true).draft.bathrooms).toBe(1)
  })
  it('社区名：用户没提的部分去掉', () => {
    expect(dropUnsaidDraftFacts({ neighborhood: 'Willowdale · North York' }, '28 Avondale Ave, $2450', false).draft.neighborhood).toBeUndefined()
    expect(dropUnsaidDraftFacts({ neighborhood: 'Willowdale · North York' }, '28 Avondale Ave, North York, $2450', false).draft.neighborhood).toBe('North York')
    expect(dropUnsaidDraftFacts({ neighborhood: 'Willowdale' }, 'willowdale 一房 $2450', false).draft.neighborhood).toBe('Willowdale')
  })
  it('turn 路由只对新卡片（非已有房源）调用', () => {
    const r = read('app/api/agent/turn/route.ts')
    expect(r).toMatch(/if \(!ownedMatch && draftListing\) \{\s*const unsaid = dropUnsaidDraftFacts\(draftListing, userSaid, imgs\.length > 0 \|\| urlImages\.length > 0\)/)
  })
})

describe('I-D3 画像「交回自动」', () => {
  const s = read('components/agent/AssistantSettings.tsx')
  it('交回自动后马上跑一次反思（自有限流的 /api/agent/reflect）并重读', () => {
    expect(s).toContain('if (release) void relearnProfile()')
    expect(s).toMatch(/fetch\('\/api\/agent\/reflect', \{ method: 'POST'/)
  })
  it('回退路径（RPC 未部署）交回时同时清掉字段原文', () => {
    expect(s).toContain("const value = release ? { ...prev, [f]: isList(f) ? [] : '', user_overrides: overrides }")
  })
})

const S1 = '11111111-1111-4111-8111-111111111111'
function row(extra: Partial<PackScreeningRow> = {}): PackScreeningRow {
  return {
    id: S1, created_at: '2026-10-01T12:00:00Z', scored_at: '2026-10-01T12:10:00Z', landlord_id: 'll', tenant_name: 'Mia Chen', ai_extracted_name: 'Mia Chen',
    ai_score: 70, v3_tier: 'conditional', ai_dimension_notes: null, hard_gates_triggered: [], red_flags: ['employer_registry_unmatched'],
    forensics_detail: { all_flags: [{ code: 'paystub_unknown_payroll_system', severity: 'medium', file: 'p.pdf' }, { code: 'pdf_some_future_code', severity: 'low' }] },
    court_records_detail: null, verification: null, files: [], notes: null, application_id: null,
    landlord: { full_name: 'Sarah Wang', email: 'landlord-test@stayloop.ai', phone: '416-555-0100' },
    ...extra,
  }
}
function input(lang: 'zh' | 'en'): BuildPackInput {
  return {
    request: { id: 'req', email: 'mia@example.com', name: 'Mia Chen', matched_screening_ids: [S1] },
    screenings: [row()], applications: [], verifications: [],
    corrections: [{ id: 'c1', screening_id: S1, dispute_id: 'd1', item_kind: 'forensic_flag', item_ref: 'x', item_label: 'x', action: 'supplemented', note: 'n', created_by: '99999999-9999-4999-8999-999999999999', created_at: '2026-10-10T10:00:00Z' }],
    viewers: [{ name: 'Sarah Wang', role: 'landlord', phone: '416-555-0100', email: 'landlord-test@stayloop.ai', when: '2026-10-01T12:10:00Z', what: 'screening report' }],
    recipients: [{ name: 'Sarah Wang', role: 'landlord', phone: '416-555-0100', email: 'landlord-test@stayloop.ai', received_at: '2026-10-01T12:10:00Z', screening_id: S1 }],
    alerts: [], lang, now: new Date('2026-10-17T12:00:00Z'),
  }
}

describe('E-D5 / T6-D5 披露包', () => {
  it('取证代码都有平实标签，不回退成英文内部短语', () => {
    expect(packSignalLabel('paystub_unknown_payroll_system', true)).toBe('工资单来自无法识别的发薪系统')
    expect(packSignalLabel('employer_registry_unmatched', true)).toBe('注册库里没找到对得上的雇主')
    expect(packSignalLabel('forensics_employer_registry_unmatched', false)).toBe('No matching employer in the corporate registry')
    expect(packSignalLabel('pdf_some_future_code', true)).toBe('PDF 文件属性提示')
    expect(packSignalLabel('zz_unknown', true)).toBe('其他核查提示')
    expect(packSignalLabel('doc_tampering', true)).toBe('文件疑似被改动（取证）')
  })
  it('包里没有「其他信号：」英文短语、没有管理员 uuid、没有房东邮箱 / 电话', () => {
    for (const lang of ['zh', 'en'] as const) {
      const pack = buildDisclosurePack(input(lang))
      const json = JSON.stringify(pack)
      const html = renderDisclosurePack(pack, lang)
      expect(json).not.toContain('其他信号')
      expect(json).not.toMatch(/paystub unknown payroll system|employer registry unmatched/i)
      expect(json).not.toContain('99999999-9999-4999-8999-999999999999')
      expect(json).not.toContain('created_by')
      expect(pack.screenings[0].corrections[0].by).toBe(lang === 'zh' ? 'Stayloop 工作人员' : 'Stayloop staff')
      for (const s of [json, html]) {
        expect(s).not.toContain('landlord-test@stayloop.ai')
        expect(s).not.toContain('416-555-0100')
        expect(s).toContain('Sarah Wang')
      }
    }
  })
  it('委托客户没有姓名时不拿邮箱当名字', () => {
    expect(read('lib/consumer/server.ts')).not.toContain('d.principal_name || d.principal_email')
  })
})

describe('E-D6 决定通知页脚', () => {
  it('中英都带 /my-file 与 /consumer-rights', () => {
    for (const l of ['zh', 'en'] as const) {
      const f = decisionNoticeFooter(l)
      expect(f).toContain('www.stayloop.ai/my-file')
      expect(f).toContain('www.stayloop.ai/consumer-rights')
      expect(f).toMatch(/10\(7\)/)
    }
    expect(decisionNoticeFooter('en')).not.toMatch(/[一-鿿]/)
  })
})

describe('T6-D7 对话消息写库前 stripNul', () => {
  it('服务端写消息与外部服务商留言都过 stripNul', () => {
    expect(read('lib/threads/server.ts')).toMatch(/const body = stripNul\(/)
    expect(read('app/api/w/[token]/route.ts')).toContain("const text = stripNul(String((body.payload || {}).body || ''))")
    expect(read('components/messages/NewMessage.tsx')).toContain('const body = stripNul(draft).trim()')
    expect(read('components/threads/ThreadPanel.tsx')).toContain('const body = stripNul(draft).trim()')
  })
})

describe('T6-D9 跨域头只给开放接口', () => {
  const mw = (p: string) => middleware(new NextRequest(`https://www.stayloop.ai${p}`, { headers: { host: 'www.stayloop.ai' } }))
  it('页面与普通 API 钉在本站域名', () => {
    for (const p of ['/', '/pricing', '/listings', '/no-such-page', '/api/public/stats']) expect(mw(p).headers.get('access-control-allow-origin')).toBe('https://www.stayloop.ai')
  })
  it('/api/v1/*、/api/mcp、/.well-known 不被改写', () => {
    for (const p of ['/api/v1/rules', '/api/mcp', '/.well-known/mcp/server.json']) expect(mw(p).headers.get('access-control-allow-origin')).toBeNull()
  })
  it('_headers 去掉静态资源的默认 *，只给 /.well-known 保留', () => {
    const h = read('public/_headers')
    expect(h).toMatch(/\/\*\n(?:.*\n)*?\s+! Access-Control-Allow-Origin/)
    expect(h).toMatch(/\/\.well-known\/\*\n\s+Access-Control-Allow-Origin: \*/)
  })
})

describe('T6-D8 合作方 URL 只到公网', () => {
  it('isPublicHttpsUrl 拒绝私网 / 回环 / 链路本地 / IP 变体 / http', () => {
    for (const u of ['https://localhost/a', 'https://127.0.0.1/a', 'https://10.1.2.3/', 'https://172.20.0.1/', 'https://192.168.1.1/', 'https://169.254.169.254/latest', 'https://100.64.0.1/', 'https://0.0.0.0/', 'https://[::1]/', 'https://[fd00::1]/', 'https://2130706433/', 'https://0x7f000001/', 'https://0177.0.0.1/', 'https://foo.internal/', 'http://example.com/', 'https://user:pw@example.com/', 'ftp://example.com/']) {
      expect(isPublicHttpsUrl(u), u).toBe(false)
    }
    for (const u of ['https://files.partner.com/a.pdf', 'https://8.8.8.8/x', 'https://hooks.partner.ca/stayloop']) expect(isPublicHttpsUrl(u), u).toBe(true)
  })
  it('fetchPublicHttps 逐跳校验，跳到私网即拒绝', async () => {
    const fetcher = vi.fn(async (u: string | URL | Request, _init?: RequestInit) => String(u).includes('partner.com')
      ? new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } })
      : new Response('secret'))
    await expect(fetchPublicHttps('https://files.partner.com/a.pdf', {}, 3, fetcher as unknown as typeof fetch)).rejects.toThrow('blocked_url')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual')
  })
  it('/api/v1/screen 不再 redirect: follow；webhook 注册与投递都校验', () => {
    const r = read('app/api/v1/screen/route.ts')
    expect(r).not.toContain("redirect: 'follow'")
    expect(r).toContain('await fetchPublicHttps(f.url)')
    expect(r).toContain("isPublicHttpsUrl(body.webhook_url)")
    expect(r).toContain('await fetchPublicHttps(webhook,')
    expect(r).not.toMatch(/await fetch\(webhook/)
  })
})

describe('J-D4 创建收件链接 201', () => {
  it('POST 创建返回 201，前端只看 res.ok', () => {
    expect(read('app/api/agent/intake-links/route.ts')).toContain("url: intakeLinkUrl(SITE(), token) } }, { status: 201 })")
    expect(read('components/agent/ClientBook.tsx')).toContain('if (!res.ok) {')
  })
})
