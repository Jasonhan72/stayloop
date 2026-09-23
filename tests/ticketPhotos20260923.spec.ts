// Guards for the tenant "new maintenance request" modal (2026-09-23,
// user report "点击照片不能上传"): photo picking, storage paths keyed on the
// household id (bucket policy), category mapping, and that the modal really
// uploads + inserts instead of closing.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { acceptTicketPhotos, MAX_TICKET_PHOTOS, ticketCategoryFor, ticketPhotoPath, ticketTitleFrom } from '@/lib/household/ticketPhotos'

const modal = readFileSync('components/tenant/NewTicketModal.tsx', 'utf8')
const page = readFileSync('app/tenant/maintenance/page.tsx', 'utf8')
const panel = readFileSync('components/household/MaintenancePanel.tsx', 'utf8')

describe('ticket photo helpers', () => {
  it('accepts images only and caps at MAX_TICKET_PHOTOS in total', () => {
    const files = [
      { name: 'a.jpg', type: 'image/jpeg', size: 10 },
      { name: 'IMG_1.HEIC', type: '', size: 10 }, // iOS gives HEIC an empty type
      { name: 'lease.pdf', type: 'application/pdf', size: 10 },
      { name: 'b.png', type: 'image/png', size: 10 },
    ]
    const r = acceptTicketPhotos(files, MAX_TICKET_PHOTOS - 2)
    expect(r.accepted).toEqual([0, 1])
    expect(r.rejected).toEqual([{ name: 'lease.pdf', reason: 'not_image' }, { name: 'b.png', reason: 'too_many' }])
  })
  it('storage path starts with the household id (tenancy_files_member_write keys on foldername[1])', () => {
    const p = ticketPhotoPath('11111111-1111-1111-1111-111111111111', 'tttt', 0, 'Kitchen Sink (1).JPEG')
    expect(p).toBe('11111111-1111-1111-1111-111111111111/tickets/tttt/1.jpeg')
    expect(ticketPhotoPath('h', 't', 2, 'noext')).toBe('h/tickets/t/3.noext')
  })
  it('maps the four modal tiles onto triage categories', () => {
    expect(ticketCategoryFor('hvac')).toBe('heating_cooling')
    expect(ticketCategoryFor('lock')).toBe('locks_safety')
    expect(ticketCategoryFor('plumbing')).toBe('plumbing')
    expect(ticketCategoryFor('')).toBe('other')
  })
  it('title = first non-empty line, truncated', () => {
    expect(ticketTitleFrom('\n  厨房洗碗机不通电。\n其他正常', '维修')).toBe('厨房洗碗机不通电。')
    expect(ticketTitleFrom('', '水管 / 漏水')).toBe('水管 / 漏水')
    expect(ticketTitleFrom('x'.repeat(80), 'f')).toHaveLength(58)
  })
})

describe('modal + page source guards', () => {
  it('modal has a real file input, previews, and uploads to tenancy-files', () => {
    expect(modal).toMatch(/type="file"[^>]*accept="image\/\*/)
    expect(modal).toContain("storage.from('tenancy-files').upload(")
    expect(modal).toContain("from('maintenance_tickets').insert(")
    expect(modal).toContain('prepareUploads(')
    expect(modal).toContain('URL.createObjectURL(')
  })
  it('submit is not a plain onClose and needs a managed tenancy', () => {
    expect(modal).not.toMatch(/onClick=\{onClose\}[^\n]*提交/)
    expect(modal).toContain("data-testid=\"no-household\"")
    expect(modal).toContain("from('household_members')")
  })
  it('page no longer carries the decorative tile grid and renders live tickets', () => {
    expect(page).not.toContain("{[0, 1, 2, 3, 4].map((i) =>")
    expect(page).toContain("import NewTicketModal from '@/components/tenant/NewTicketModal'")
    expect(page).toContain('liveSlot={<LiveTenantTickets')
    // The honest (non-demo) view must reach the photo modal too: the panel's
    // button is wired to open it, not only the demo page header.
    expect(page).toContain('onNewTicket={onNew}')
    expect(page.indexOf('{open && <NewTicketModal')).toBeGreaterThan(page.indexOf('</WorkspaceShell>'))
    expect(panel).toContain('onNewTicket ? onNewTicket() : setShowForm(true)')
  })
  it('MaintenancePanel reads photos and signs them from the private bucket', () => {
    expect(panel).toMatch(/select\('id, title, description, category, priority, status, created_at, resolved_at, opened_by, photos'\)/)
    expect(panel).toContain("storage.from('tenancy-files').createSignedUrls(")
    expect(panel).toContain('data-testid="ticket-photos"')
  })
})
