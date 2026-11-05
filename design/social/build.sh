#!/usr/bin/env bash
# Renders the social avatar and banners with headless Chrome from the two
# templates in this folder. Output: design/social/assets/*.png
#   VARIANT=a|b|c|d  banner direction (see banner.template.html); default below
#   OUT=<dir>        write somewhere else (previews)
#   ONLY=<substr>    render only files whose name contains this
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
VARIANT="${VARIANT:-b}"
OUT="${OUT:-$HERE/assets}"
ONLY="${ONLY:-}"
SUFFIX="${SUFFIX:-}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; rm -f "$HERE/.banner.built.html" "$HERE/.avatar.built.html"' EXIT
mkdir -p "$OUT"
FONT_B64="$(base64 < "$ROOT/public/fonts/inter-tight-latin.woff2" | tr -d '\n')"
for t in banner avatar; do
  python3 - "$HERE/$t.template.html" "$HERE/.$t.built.html" "$FONT_B64" <<'PY'
import sys
src, dst, font = sys.argv[1:4]
open(dst, 'w').write(open(src).read().replace('__FONT__', font))
PY
done
shot() { # name width height query
  case "$1" in *"$ONLY"*) ;; *) return 0 ;; esac
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --user-data-dir="$TMP/profile" --virtual-time-budget=4000 --window-size="$2,$3" \
    --screenshot="$OUT/$1$SUFFIX.png" "file://$HERE/.$4" >/dev/null 2>&1
  echo "  $1$SUFFIX.png  $2x$3"
}
shot avatar-1024           1024 1024 "avatar.built.html?fill=0.7"
B="banner.built.html?v=$VARIANT"
for L in en zh; do
  shot "x-header-1500x500-$L"        1500  500 "$B&lang=$L&sx=470&sy=70&sw=970&sh=360"
  shot "linkedin-cover-1128x191-$L"  1128  191 "$B&lang=$L&sx=250&sy=20&sw=850&sh=151&compact=1"
  shot "facebook-cover-1640x624-$L"  1640  624 "$B&lang=$L&sx=270&sy=110&sw=1100&sh=404"
  shot "youtube-banner-2560x1440-$L" 2560 1440 "$B&lang=$L&sx=507&sy=518&sw=1546&sh=404"
done
