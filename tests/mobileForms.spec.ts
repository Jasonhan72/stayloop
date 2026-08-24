import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// iOS Safari 会在聚焦一个字号 < 16px 的表单控件时把整页放大，并且不再退回来。
// 站内共享输入框 `.sl-input` 是 14px，所以在没有这条规则时，iPhone 上的每一个
// 表单（登录/注册/联系/申请/发布房源/导入租约/设置）都会把用户留在一个 1.3 倍、
// 布局已经错位的页面上。这条规则很容易在后续清理 CSS 时被当成冗余删掉——它看
// 起来只是"手机上字大一点"，所以在这里钉住。
const CSS = readFileSync('app/globals.css', 'utf8')

describe('手机端表单控件字号', () => {
  it('globals.css 里有手机断点的 16px 规则', () => {
    const block = CSS.match(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\n\}/)
    expect(block, '缺少 max-width:767px 的表单控件字号规则').not.toBeNull()
    const body = block![0]
    expect(body).toMatch(/font-size:\s*16px\s*!important/)
    expect(body).toContain('textarea')
    expect(body).toContain('select')
  })

  it('勾选框/单选/滑块/文件选择被排除（它们不触发缩放，放大会撑坏方框）', () => {
    const block = CSS.match(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\n\}/)![0]
    for (const t of ['checkbox', 'radio', 'range', 'file']) {
      expect(block, `未排除 [type='${t}']`).toContain(`:not([type='${t}'])`)
    }
  })
})
