// "Already renting" — the landlord's three steps on a managed tenancy (V0.9, 2026-11-22).
//
// The pieces existed and did not point at each other: import a signed lease (/leases/import),
// reconcile the rent ledger against a bank-statement CSV (CsvReconcile on the hub's rent tab), and
// export the tenancy's record arranged for an arrears matter (/api/matters/export, kind 'arrears' —
// reachable only from the progress page). Screening is used once per tenant; the rent record is
// what a landlord comes back for every month, so this is the main way in for a landlord who already
// has a tenant.
//
// Pure: what each step says and whether it is done. The hub draws it (components/household/AlreadyRenting).
// Nothing here files, fills or serves an LTB form — the export is the record kept on Stayloop.

export type RentingStep = { key: 'lease' | 'reconcile' | 'export'; n: 1 | 2 | 3; done: boolean; title: string; body: string }

export function alreadyRentingSteps(i: { imported: boolean; recorded: number; canReconcile: boolean }, zh: boolean): RentingStep[] {
  const recorded = Math.max(0, Math.trunc(i.recorded) || 0)
  return [
    {
      key: 'lease', n: 1, done: true,
      title: zh ? '租约已经在这里' : 'The lease is here',
      body: i.imported
        ? (zh ? '已签的租约已导入。租客加入并确认后，这份记录就是双方共同的。' : 'The signed lease is imported. Once the tenant joins and confirms, the record belongs to both sides.')
        : (zh ? '租约是在 Stayloop 上签的，双方已经在同一份记录里。' : 'The lease was signed on Stayloop; both sides are already on the same record.'),
    },
    {
      key: 'reconcile', n: 2, done: recorded > 0,
      title: zh ? '把每一期租金记上' : 'Record each rent period',
      body: recorded > 0
        ? (zh ? `已记 ${recorded} 期。以后每月来对一次：上传银行流水，或逐期标记。` : `${recorded} period${recorded === 1 ? '' : 's'} recorded. Come back each month: upload the bank statement, or mark periods one by one.`)
        : i.canReconcile
          ? (zh ? '上传银行流水的 CSV，系统把收款对到每一期，你勾选确认；也可以逐期手动标记。文件只在浏览器里读，不上传。' : 'Upload the bank statement CSV; deposits are matched to each period for you to tick. Or mark periods by hand. The file is read in your browser only.')
          : (zh ? '先在租约信息里补上月租金，才能按期对账。' : 'Add the monthly rent to the tenancy details first; periods are built from it.'),
    },
    {
      key: 'export', n: 3, done: false,
      title: zh ? '需要留底时，导出记录' : 'Export the record when you need it',
      body: zh
        ? '按欠租事务的顺序排好：租金记录在前，然后是通知副本和对话。这是 Stayloop 上留下的记录，不是 LTB 表格，也不替你提交。'
        : 'Arranged for an arrears matter: the rent record first, then notice copies and conversations. It is the record kept on Stayloop — not an LTB form, and nothing is filed for you.',
    },
  ]
}

/** The matter of this household among my_matters() rows, or null. */
export function matterForHousehold(rows: unknown, householdId: string): string | null {
  if (!Array.isArray(rows)) return null
  for (const r of rows) {
    const m = r as { id?: unknown; household?: { id?: unknown } | null } | null
    if (m && typeof m.id === 'string' && m.household && m.household.id === householdId) return m.id
  }
  return null
}
