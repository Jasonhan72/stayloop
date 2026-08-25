import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { MAX_UPLOAD_BYTES, prepareUploads } from '../lib/screening/prepareUpload'

// 三个地方各写了一次「多大算太大」：桶的 file_size_limit、前端的
// MAX_UPLOAD_BYTES、以及给用户看的错误文案。任意两处对不上，用户就会遇到
// 最难查的那类故障——前端放行、上传到一半被存储拒绝，或者文案说 10MB 而
// 实际卡在别的数上。这里把三者钉在一起。
const MIGRATION = readFileSync('supabase/migrations/20260825_tenant_files_limits.sql', 'utf8')
const I18N = readFileSync('lib/i18n.tsx', 'utf8')

describe('筛查上传大小限制', () => {
  it('前端常量 = 25MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024)
  })

  it('迁移里的桶上限与前端一致', () => {
    expect(MIGRATION).toMatch(/file_size_limit\s*=\s*25\s*\*\s*1024\s*\*\s*1024/)
  })

  it('iPhone 的 HEIC/HEIF 在桶的白名单里', () => {
    expect(MIGRATION).toContain("'image/heic'")
    expect(MIGRATION).toContain("'image/heif'")
  })

  it('用户看到的文案说的也是 25 MB', () => {
    const line = I18N.split('\n').find((l) => l.includes("'screen.err.tooBig'"))
    expect(line).toBeDefined()
    expect(line).toContain('25 MB')
  })
})

function fakeFile(name: string, bytes: number, type: string): File {
  // 只在 metadata 上做文章——不真的分配 25MB。
  const f = new File([new Uint8Array(1)], name, { type })
  Object.defineProperty(f, 'size', { value: bytes })
  return f
}

describe('prepareUploads', () => {
  it('放行正常大小的 PDF,且不重编码(取证依赖 PDF 原始结构)', async () => {
    const pdf = fakeFile('statement.pdf', 5 * 1024 * 1024, 'application/pdf')
    const res = await prepareUploads([pdf])
    expect(res.rejected).toEqual([])
    expect(res.accepted).toHaveLength(1)
    expect(res.accepted[0].file).toBe(pdf)
    expect(res.accepted[0].originalSize).toBeUndefined()
  })

  it('超过 25MB 的 PDF 被拒,并带出可执行的原因', async () => {
    const pdf = fakeFile('huge-scan.pdf', 30 * 1024 * 1024, 'application/pdf')
    const res = await prepareUploads([pdf])
    expect(res.accepted).toEqual([])
    expect(res.rejected).toEqual([{ name: 'huge-scan.pdf', size: 30 * 1024 * 1024, reason: 'too_big_pdf' }])
  })

  it('无法解码的大图按图片理由拒绝(文案会让用户另存 JPEG)', async () => {
    const heic = fakeFile('IMG_4021.HEIC', 30 * 1024 * 1024, '')
    const res = await prepareUploads([heic])
    expect(res.rejected[0]?.reason).toBe('too_big_image')
  })

  it('一批里坏文件不连累好文件', async () => {
    const ok = fakeFile('paystub.pdf', 1024, 'application/pdf')
    const bad = fakeFile('huge.pdf', 40 * 1024 * 1024, 'application/pdf')
    const res = await prepareUploads([ok, bad, ok])
    expect(res.accepted).toHaveLength(2)
    expect(res.rejected).toHaveLength(1)
  })
})
