// Unescaped inner quotes in model JSON (the 2026-08-22 "Johnson Osei." case).
import { describe, expect, it } from 'vitest'
import { parseModelJson, repairUnescapedQuotes } from '@/lib/screening/jsonRepair'

describe('repairUnescapedQuotes', () => {
  it('escapes a literal quote pair inside a string value (the production failure)', () => {
    const bad = '{"verification":"三份工资单由个人作者"Johnson Osei."用Excel制作，属批量伪造特征。","next":"ok"}'
    const fixed = repairUnescapedQuotes(bad)
    const obj = JSON.parse(fixed) as Record<string, string>
    expect(obj.verification).toBe('三份工资单由个人作者"Johnson Osei."用Excel制作，属批量伪造特征。')
    expect(obj.next).toBe('ok')
  })
  it('leaves valid JSON untouched, including quotes followed by commas in arrays and escaped quotes', () => {
    const good = '{"a":["x","y"],"b":"he said \\"hi\\", then left","c":{"d":1},"e":"end"}'
    expect(repairUnescapedQuotes(good)).toBe(good)
    expect(JSON.parse(repairUnescapedQuotes(good))).toEqual(JSON.parse(good))
  })
  it('handles an inner quote followed by a comma inside prose', () => {
    const bad = '{"t":"他说"好",然后离开了","u":2}'
    const obj = JSON.parse(repairUnescapedQuotes(bad)) as Record<string, unknown>
    expect(obj.t).toBe('他说"好",然后离开了')
    expect(obj.u).toBe(2)
  })
  it('normalises raw newlines inside strings', () => {
    expect(JSON.parse(repairUnescapedQuotes('{"a":"line1\nline2"}'))).toEqual({ a: 'line1 line2' })
  })
})

describe('parseModelJson', () => {
  it('strict → repaired → trailing-comma cleanup', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseModelJson('{"a":"x"y","b":[1,2,],}')).toEqual({ a: 'x"y', b: [1, 2] })
    expect(parseModelJson('not json')).toBeNull()
  })
})
