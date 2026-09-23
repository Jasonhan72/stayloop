// Move-in checklist items (proposal 2026-09-23 §3.3, P2). The list is fixed
// in code; the ticks live in move_in_checklist (one row per household ×
// item). Items that carry an Ontario fact say so in `note`.
export type Bi = { zh: string; en: string }
export type MoveInItem = { key: string; group: 'photos' | 'handover' | 'paperwork'; label: Bi; note?: Bi; needsNote?: Bi }

export const MOVE_IN_ITEMS: MoveInItem[] = [
  { key: 'photos_living', group: 'photos', label: { zh: '客厅 · 入住状态照片', en: 'Living room · move-in photos' } },
  { key: 'photos_bedroom', group: 'photos', label: { zh: '卧室 · 入住状态照片', en: 'Bedroom · move-in photos' } },
  { key: 'photos_kitchen', group: 'photos', label: { zh: '厨房与电器 · 入住状态照片', en: 'Kitchen & appliances · move-in photos' } },
  { key: 'photos_bathroom', group: 'photos', label: { zh: '卫生间 · 入住状态照片', en: 'Bathroom · move-in photos' } },
  { key: 'photos_wear', group: 'photos', label: { zh: '已有损耗 · 逐处特写', en: 'Existing wear · close-ups' }, note: { zh: '退租时的对照基准；照片留在双方各自的设备与邮件里，Stayloop 只记录「已拍」。', en: 'The move-out baseline; photos stay on your own devices and email — Stayloop records only that they were taken.' } },
  { key: 'keys_front', group: 'handover', label: { zh: '大门钥匙', en: 'Front door keys' }, needsNote: { zh: '几把', en: 'how many' } },
  { key: 'keys_mailbox', group: 'handover', label: { zh: '信箱钥匙', en: 'Mailbox key' } },
  { key: 'fobs', group: 'handover', label: { zh: '门禁卡 / 车库遥控', en: 'Fobs / garage remote' }, needsNote: { zh: '几个', en: 'how many' } },
  { key: 'heating', group: 'handover', label: { zh: '暖气 / 恒温器使用说明', en: 'Heating / thermostat instructions' } },
  { key: 'utilities', group: 'handover', label: { zh: '水电气网 过户或开户', en: 'Utilities transferred / opened' }, needsNote: { zh: '哪几项', en: 'which ones' } },
  { key: 'lease_copy', group: 'paperwork', label: { zh: '收到签署后的租约副本', en: 'Signed lease copy received' }, note: { zh: 'RTA s.12：房东须在签署后 21 天内交付副本。', en: 'RTA s.12: the landlord must deliver a copy within 21 days of signing.' } },
  { key: 'deposit_receipt', group: 'paperwork', label: { zh: '租金押金收据', en: 'Rent deposit receipt' }, note: { zh: 'RTA s.106：押金最多一个月租金，只能抵最后一个月租金，房东须按指导比例付息。', en: 'RTA s.106: at most one month, applied to the last month only, interest at the guideline rate.' } },
  { key: 'insurance', group: 'paperwork', label: { zh: '租客保险', en: 'Tenant insurance' }, needsNote: { zh: '保险公司 · 到期日', en: 'insurer · expiry' }, note: { zh: '安省法律不强制；若租约要求，请记录保险公司与到期日。这里是自述，房东可见。', en: 'Not required by Ontario law; if the lease requires it, record the insurer and expiry. Self-reported, visible to the landlord.' } },
]

export function moveInProgress(rows: { item_key: string; done: boolean }[]): { done: number; total: number } {
  const set = new Set(rows.filter((r) => r.done).map((r) => r.item_key))
  return { done: MOVE_IN_ITEMS.filter((i) => set.has(i.key)).length, total: MOVE_IN_ITEMS.length }
}

/** The checklist is "open" from 30 days before the start date until every item is done. */
export function moveInWindowOpen(startDate: string | null, progress: { done: number; total: number }, today = new Date()): boolean {
  if (progress.done >= progress.total) return false
  if (!startDate) return true
  const start = new Date(startDate + 'T00:00:00Z').getTime()
  return today.getTime() >= start - 30 * 86_400_000
}
