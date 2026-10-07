import fs from 'node:fs'
const rows = JSON.parse(fs.readFileSync(new URL('./inserted.json', import.meta.url), 'utf8'))
const out = []
for (const r of rows) {
  const res = await fetch('https://www.stayloop.ai/api/listings/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, lang: 'zh', only: 'translations' }) })
  let j = null; try { j = await res.json() } catch {}
  const t = j?.translations ?? j
  const keys = t && typeof t === 'object' ? Object.keys(t).filter((k) => t[k]).slice(0, 4).join(',') : ''
  out.push([r.mls, res.status, keys || JSON.stringify(j).slice(0, 80)].join(' '))
  await new Promise((x) => setTimeout(x, 1500))
}
console.log(out.join('\n'))
