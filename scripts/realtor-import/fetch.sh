#!/bin/bash
# usage: fetch.sh <url> <outfile>; retries once through Jina's proxy pool on a bot-check page
url="$1"; out="$2"
for proxy in "" "auto"; do
  if [ -n "$proxy" ]; then H=(-H "X-Proxy: auto"); else H=(); fi
  curl -s -m 60 -H "Authorization: Bearer $JINA_KEY" "${H[@]}" "https://r.jina.ai/$url" -o "$out"
  if ! grep -qiE "Just a moment|Security Check|Performing security verification|returned error 403" <(head -c 2000 "$out"); then break; fi
done
rows=$(grep -ciE '\$[0-9,]+ */ *Month' "$out")
title=$(grep -m1 '^Title:' "$out" | cut -c1-70)
echo "$rows	$url	$title"
