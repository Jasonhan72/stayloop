#!/usr/bin/env python3 -I
"""CMHC Rental Market Survey workbook (Toronto CMA) → rows for public.rent_benchmarks.

Usage: python3 -I cmhc_to_json.py rmr-toronto-2025-en.xlsx > cmhc-toronto-2025.json
Reads Table 1.1.2 (private apartment average rents by zone × bedroom) and
Table 4.1.3 (rental condominium apartment average rents by sub-area × bedroom).
Source: Canada Mortgage and Housing Corporation (CMHC), Rental Market Survey, October 2025.
Download: https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables
"""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xlsx import load

BEDS = [0, 1, 2, 3]

def parse_table(rows, kind):
    out = []
    # header row: 'Zone | Oct-24 | Oct-25 | Oct-24 | Oct-25 | ...'
    hdr_i = next(i for i, r in enumerate(rows) if r and str(r[0] or '').strip() in ('Zone', 'Condo Sub Area'))
    periods = [c for c in rows[hdr_i][1:] if c and re.match(r'^[A-Z][a-z]{2}-\d{2}$', str(c))]
    prev_lbl, cur_lbl = periods[0], periods[1]
    def period(lbl):
        mon, yy = lbl.split('-')
        m = {'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'}[mon]
        return f'20{yy}-{m}'
    for r in rows[hdr_i + 1:]:
        if not r or not r[0] or str(r[0]).startswith(('§', 'Quality', 'Source', '©', 'a —', '**', 'Other', '↑', '↓', '–')):
            continue
        area = str(r[0]).strip()
        # Each bedroom column pair: prev value, prev quality, cur value, cur quality
        # (the condo table adds a trailing significance mark; values are '1,606' or '**').
        cells = [c for c in r[1:] if c is not None]
        vals = []
        for c in cells:
            s = str(c).strip()
            if re.match(r'^[\d,]+(\.\d+)?$', s): vals.append(('n', float(s.replace(',', ''))))
            elif s == '**': vals.append(('n', None))
            elif s in ('a', 'b', 'c', 'd'): vals.append(('q', s))
            # '-', '↑', '↓' significance marks are skipped
        # Walk: prev n, [q], cur n, [q] per bedroom, then the Total column (ignored).
        i = 0
        for bed in BEDS:
            prev = cur = None; cq = None
            if i < len(vals) and vals[i][0] == 'n': prev = vals[i][1]; i += 1
            if i < len(vals) and vals[i][0] == 'q': i += 1
            if i < len(vals) and vals[i][0] == 'n': cur = vals[i][1]; i += 1
            if i < len(vals) and vals[i][0] == 'q': cq = vals[i][1]; i += 1
            if cur is not None:
                out.append({'source': 'cmhc', 'kind': kind, 'period': period(cur_lbl), 'area': area, 'area_key': area.lower(),
                            'bedrooms': bed, 'avg_rent': cur, 'prev_avg': prev, 'quality': cq,
                            'note': 'Source: Canada Mortgage and Housing Corporation (CMHC), Rental Market Survey, October 2025'})
    return out

d = load(sys.argv[1])
rows = parse_table(d['Table 1.1.2'], 'purpose_built') + parse_table(d['Table 4.1.3'], 'condo')
json.dump(rows, sys.stdout, ensure_ascii=False, indent=0)
print(file=sys.stderr, *[f"{len(rows)} rows"])
