#!/usr/bin/env python3
"""Backfill TRREB quarterly Rental Market Report data into trreb_rent_stats.

Downloads every available quarterly report PDF (2019 Q1 onward), extracts the
per-area rental tables (apartments + townhouses; regions, municipalities and
Toronto districts C/W/E) and upserts rows into Supabase.

The PDFs render each table row twice with a ~2px offset (faux-bold layering),
which garbles naive text extraction: consecutive labels interleave char-wise
("TToorroonnttoo CC0089" = "Toronto C08" + "Toronto C09"). Numbers stay clean.
Recovery: cluster chars by y (1px tolerance, watermark chars filtered by font
size), then for garbled labels run an interleaving-string check against the
previous row's label and a canonical area-name list.

Usage:
  python3 -m venv venv && venv/bin/pip install pdfplumber
  venv/bin/python scripts/trreb_backfill.py --dry-run          # parse only
  venv/bin/python scripts/trreb_backfill.py                    # parse + upsert
Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
Re-runnable: upserts are idempotent on (period, area, property_type, bed_type).
"""
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

import pdfplumber

REPORT_URL = "https://trreb.ca/wp-content/files/market-stats/rental-reports/rental_report_Q{q}-{y}.pdf"
FIRST_YEAR = 2019

MUNICIPALITIES = [
    "All TRREB Areas", "Halton Region", "Burlington", "Halton Hills", "Milton",
    "Oakville", "Peel Region", "Brampton", "Caledon", "Mississauga",
    "City of Toronto", "Toronto West", "Toronto Central", "Toronto East",
    "York Region", "Aurora", "East Gwillimbury", "Georgina", "King", "Markham",
    "Newmarket", "Richmond Hill", "Vaughan", "Stouffville",
    "Whitchurch-Stouffville", "Durham Region", "Ajax", "Brock", "Clarington",
    "Oshawa", "Pickering", "Scugog", "Uxbridge", "Whitby", "Dufferin County",
    "Orangeville", "Simcoe County", "Adjala-Tosorontio", "Bradford",
    "Bradford West Gwillimbury", "Essa", "Innisfil", "New Tecumseth",
]
DISTRICTS = [f"Toronto {p}{n:02d}" for p in "CWE" for n in range(1, 16)]
CANONICAL = MUNICIPALITIES + DISTRICTS
CANONICAL_SET = {c.lower(): c for c in CANONICAL}
# Pre-2020 "TREB" era labels normalize onto today's names.
ALIASES = {"all treb areas": "All TRREB Areas", "treb total": "All TRREB Areas", "trreb total": "All TRREB Areas"}
CANONICAL_SET.update({k: v for k, v in ALIASES.items()})
CANONICAL = CANONICAL + list(ALIASES.keys())


def is_interleave(s: str, a: str, b: str) -> bool:
    """Classic interleaving-strings DP (spaces ignored)."""
    s = s.replace(" ", "")
    a = a.replace(" ", "")
    b = b.replace(" ", "")
    if len(s) != len(a) + len(b):
        return False
    prev = [True] + [s[: j].endswith(b[: j]) and s[: j] == b[: j] for j in range(1, len(b) + 1)]
    # simpler full DP
    dp = [[False] * (len(b) + 1) for _ in range(len(a) + 1)]
    dp[0][0] = True
    for i in range(len(a) + 1):
        for j in range(len(b) + 1):
            if i == 0 and j == 0:
                continue
            ok = False
            if i > 0 and a[i - 1] == s[i + j - 1] and dp[i - 1][j]:
                ok = True
            if not ok and j > 0 and b[j - 1] == s[i + j - 1] and dp[i][j - 1]:
                ok = True
            dp[i][j] = ok
    return dp[len(a)][len(b)]


def cluster_lines(page):
    chars = [c for c in page.chars if c["size"] < 20]
    rows = []  # list of (top, [chars])
    for c in chars:
        for row in rows:
            if abs(row[0] - c["top"]) < 1.0:
                row[1].append(c)
                break
        else:
            rows.append((c["top"], [c]))
    lines = []
    for top, cs in sorted(rows, key=lambda r: r[0]):
        cs = sorted(cs, key=lambda x: x["x0"])
        buf, prev_end = [], None
        for ch in cs:
            if prev_end is not None and ch["x0"] - prev_end > 1.2:
                buf.append(" ")
            buf.append(ch["text"])
            prev_end = ch["x1"]
        lines.append("".join(buf).replace("\t", " ").strip())
    return lines


NUM_RE = re.compile(r"^\$?[\d,]+$")


def parse_numbers(tokens):
    """listed, leased, then per bed type: leased [, $avg]. Returns 4 beds."""
    vals = []
    for t in tokens:
        if not NUM_RE.match(t):
            return None
        vals.append(t)
    if len(vals) < 6:
        return None
    plain = lambda t: int(t.replace(",", "").replace("$", ""))
    if vals[0].startswith("$") or vals[1].startswith("$"):
        return None
    beds = []  # (leased, avg|None)
    i = 2
    while i < len(vals) and len(beds) < 4:
        if vals[i].startswith("$"):
            return None
        leased = plain(vals[i])
        i += 1
        avg = None
        if i < len(vals) and vals[i].startswith("$"):
            avg = plain(vals[i])
            i += 1
        beds.append((leased, avg))
    if len(beds) != 4 or i != len(vals):
        return None
    return beds


def parse_page(lines, period, ptype):
    out = []
    prev_label = None
    for line in lines:
        tokens = line.split()
        first_num = next((k for k, t in enumerate(tokens) if NUM_RE.match(t)), None)
        if first_num is None or first_num == 0:
            continue  # header / duplicate numbers-only line
        label = " ".join(tokens[:first_num])
        beds = parse_numbers(tokens[first_num:])
        if beds is None:
            continue
        area = CANONICAL_SET.get(label.lower())
        if area is None and prev_label is not None:
            # garbled interleave of prev row's label + this row's label
            for cand in CANONICAL:
                if cand != prev_label and is_interleave(label, prev_label, cand):
                    area = CANONICAL_SET.get(cand.lower(), cand)
                    break
        if area is None:
            continue
        prev_label = area
        for bed_type, (leased, avg) in enumerate(beds):
            if avg is None or leased <= 0:
                continue
            out.append({
                "period": period,
                "area": area,
                "property_type": ptype,
                "bed_type": bed_type,
                "avg_rent": avg,
                "leased": leased,
            })
    return out


def parse_report(pdf_bytes, period):
    rows = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            head = (page.extract_text() or "")[:260]
            # New format: "SUMMARY OF RENTAL TRANSACTIONS Apartments, 2026 Q1";
            # 2019-era: "APARTMENTS, FIRST QUARTER 2019 / SUMMARY OF RENTAL TRANSACTIONS"
            if not re.search(r"SUMMARY OF RENTAL TRANSACTIONS", head, re.I):
                continue
            m = re.search(r"\b(APARTMENTS|TOWNHOUSES)\b", head, re.I)
            if not m:
                continue
            ptype = "apartment" if m.group(1).upper() == "APARTMENTS" else "townhouse"
            rows.extend(parse_page(cluster_lines(page), period, ptype))
    return rows


def load_env(path=".env.local"):
    env = {}
    for line in Path(path).read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


def upsert(env, rows):
    # The same area can appear on two pages of one report ("All TRREB Areas"
    # heads both the regional and the district table) — Postgres rejects a
    # single INSERT..ON CONFLICT touching one key twice, so dedupe first.
    seen = {}
    for r in rows:
        seen[(r["period"], r["area"], r["property_type"], r["bed_type"])] = r
    rows = list(seen.values())
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    for i in range(0, len(rows), 400):
        batch = rows[i : i + 400]
        req = urllib.request.Request(
            f"{url}/rest/v1/trreb_rent_stats?on_conflict=period,area,property_type,bed_type",
            data=json.dumps(batch).encode(),
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            method="POST",
        )
        with urllib.request.urlopen(req) as res:
            if res.status not in (200, 201, 204):
                raise RuntimeError(f"upsert failed: {res.status}")


def main():
    dry = "--dry-run" in sys.argv
    only = next((a.split("=")[1] for a in sys.argv if a.startswith("--period=")), None)
    env = None if dry else load_env()
    import datetime
    now = datetime.date.today()
    quarters = []
    y, q = FIRST_YEAR, 1
    while (y, q) <= (now.year, (now.month - 1) // 3 + 1):
        quarters.append((y, q))
        q += 1
        if q == 5:
            y, q = y + 1, 1
    total = 0
    for y, q in quarters:
        period = f"{y} Q{q}"
        if only and period != only:
            continue
        url = REPORT_URL.format(q=q, y=y)
        try:
            with urllib.request.urlopen(url, timeout=60) as res:
                pdf_bytes = res.read()
        except Exception as e:
            print(f"{period}: download failed ({e}) — skipped")
            continue
        rows = parse_report(pdf_bytes, period)
        for r in rows:
            r["source_url"] = url
        areas = len({r["area"] for r in rows})
        print(f"{period}: {len(rows)} rows across {areas} areas")
        if rows and not dry:
            upsert(env, rows)
        total += len(rows)
    print(f"TOTAL: {total} rows{' (dry run — nothing written)' if dry else ' upserted'}")


if __name__ == "__main__":
    main()
