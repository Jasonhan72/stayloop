# Reads the JSON that sweep.mjs wrote and prints only what needs a look.  usage: python3 summary.py <outDir>
# Known noise is filtered (map tiles, the home film's cropped stills). 「底栏盖住内容」 on /messages and /x/agent is
# a false alarm: those pages scroll inside a fixed-height column.
import json, glob, sys, re, collections
out = sys.argv[1]
# also: stretched hit areas (`absolute inset-0` links / buttons / an invisible <select> over its label) are meant to cover
NOISE = re.compile(r'sl-film-shot|地图数据|键盘快捷键|gm-style|\d\.\dK|under (a|button|select)\.absolute\.inset-0')
tiny = collections.defaultdict(set); issues = []; nav = collections.defaultdict(set); pages = 0; cols = []
for f in sorted(glob.glob(out + '/*.json')):
    d = json.load(open(f))
    for r in d['runs']:
        for p in r['pages']:
            pages += 1
            who = f"{d['engine']}/{d['role']}/{d['lang']} {p['asked']}"
            if p.get('at') and p['at'] != p['asked'].split('?')[0]: who += f" (→{p['at']})"
            if p.get('errors'): issues.append((who, '-', 'errors', p['errors']))
            for size, m in p['sizes'].items():
                if 'err' in m: issues.append((who, size, 'measure-failed', m['err'])); continue
                if 'checked' in m:  # MODE=covered
                    hit = [c for c in m['covered'] if not NOISE.search(c)]
                    if hit: issues.append((who, size, '被别的元素盖住', hit))
                    continue
                if m['overflow'] > 1: issues.append((who, size, f"横向溢出 {m['overflow']}px", m['wide']))
                cut = [c for c in m['cut'] if not NOISE.search(c)]
                if cut: issues.append((who, size, '被裁掉', cut))
                ct = [c for c in m['clipText'] if not NOISE.search(c)]
                if ct: issues.append((who, size, '文字被截', ct))
                if m['small']: issues.append((who, size, '控件小于16px', m['small']))
                if m['covered'] and m['covered']['hidden']: issues.append((who, size, f"底栏盖住内容 room={m['covered']['room']} bar={m['covered']['barH']}", m['covered']['hidden']))
                if m['fixedShare'] > 34: issues.append((who, size, f"固定条占屏 {m['fixedShare']}%", ''))
                for t in m['tiny']: tiny[re.sub(r' \d+×\d+$', '', t)].add((d['role'], p['asked'], size.split('x')[0], t.rsplit(' ', 1)[-1]))
                w = int(size.split('x')[0])
                if 700 <= w <= 1200 and m['aside'] and d['role'] != 'anon':
                    a = m['aside'][0]; aw = int(a.split('×')[0]); left = int(a.split('@')[1].split(',')[0])
                    if left > 100: cols.append((d['role'], p['asked'], w, aw, w - aw - 64))
                nav[(d['role'], d['engine'], size)].add(' | '.join(re.sub(r'@.*', '', n) for n in m['navs']))
print('pages loaded:', pages)
seen = set()
print('\n== ISSUES ==')
for who, size, kind, detail in issues:
    key = (who.split(' ', 1)[1], kind.split(' ')[0], json.dumps(detail, ensure_ascii=False)[:80])
    print(f"{who} @{size}: {kind} :: {json.dumps(detail, ensure_ascii=False)[:420]}")
print('\n== TINY TARGETS (<24px) by element, pages ==')
for k, v in sorted(tiny.items(), key=lambda kv: -len(kv[1]))[:70]:
    ex = sorted(v)[0]
    print(f"{len(set((a,b) for a,b,_,_ in v)):3d} pages  {k}  e.g. {ex[0]} {ex[1]} @{ex[2]} {ex[3]}")
print('\n== SIDE-BY-SIDE ASIDE on tablets: role page width asideW contentW ==')
for c in sorted(set(cols)): print(c)
