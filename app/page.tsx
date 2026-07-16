'use client'

// v6 homepage — built strictly to design/v6-homepage.html (the definitive
// blueprint). The blueprint's <style> block is kept verbatim below, minus the
// nav/footer sections (we render the real <Header/> / <Footer/> components
// instead) and two documented adaptations:
//   1. body rule split — background/overflow-x stay on body (the blueprint
//      relies on body overflow-x propagating to the viewport so the rotated
//      theatre panels don't cause horizontal scroll, and so position:sticky
//      on the real Header keeps working); typography moves to .v6-page.
//   2. .hero-in top padding 116px → 50px — the blueprint's nav was absolutely
//      positioned; the real Header is sticky and occupies 66px of flow.
// All class names and copy are unchanged from the blueprint.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

/* Typewriter lines — verbatim from the blueprint script. */
const TRY_LINES = [
  '北约克两房，预算 2800，能养猫',
  '1207 的三份申请，帮我看一下',
  '明天的带看都排好',
  '这份租约的第 8 条什么意思？',
]

const promptHref = (line: string) => `/tenant/agent?prompt=${encodeURIComponent(line)}`

/* ===================== blueprint <style> (nav/footer sections removed) ===================== */

const CSS = `
  :root {
    --bg: #FAF9F6; --bg-2: #F3F0E9; --panel: #FFFFFF; --panel-2: #F8F6F0;
    --line: rgba(23,22,27,.09); --line-2: rgba(23,22,27,.18);
    --ink: #17161B; --ink-2: #56524A; --ink-3: #8A857A;
    --tenant: #7C3AED; --tenant-deep: #5B21B6; --tenant-light: #C4B5FD; --tenant-soft: #F3EEFB;
    --landlord: #047857; --landlord-deep: #065F46; --landlord-light: #6EE7B7; --landlord-soft: #EBF4F0;
    --agent: #2563EB; --agent-deep: #1E3A8A; --agent-light: #93C5FD; --agent-soft: #EBF1FD;
    --gold: #B45309; --stamp: #6AB344; --danger: #DC2626;
    --dark: #131118; --dark-ink: #EFEBF6; --dark-muted: #9A93AC; --dark-line: rgba(255,255,255,.10);
    --serif: "Songti SC", "Noto Serif SC", "Source Han Serif SC", "STSong", Georgia, serif;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  body { margin: 0; background: var(--bg); overflow-x: hidden; }
  .v6-page { color: var(--ink);
    font-family: -apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
    font-size: 15px; line-height: 1.8; -webkit-font-smoothing: antialiased; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .num { font-variant-numeric: tabular-nums; }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 0 36px; }
  .eyebrow { font-family: ui-monospace, Menlo, monospace; font-size: 11px; font-weight: 700; letter-spacing: .24em; }
  .v6-page button { font-family: inherit; cursor: pointer; }
  .v6-page h1, .v6-page h2, .v6-page h3 { text-wrap: balance; }
  .rv { opacity: 0; transform: translateY(22px); transition: opacity .8s ease, transform .8s ease; }
  .rv.in { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) { .rv { opacity: 1; transform: none; transition: none; } }

  /* ============ HERO：编辑封面式 ============ */
  .hero { position: relative; }
  .hero::before { content: ""; position: absolute; inset: 0 0 -10% 0; z-index: -1; background:
    radial-gradient(ellipse at 16% 20%, rgba(139,92,246,.09), transparent 52%),
    radial-gradient(ellipse at 86% 72%, rgba(59,130,246,.07), transparent 52%); }
  .hero-in { position: relative; max-width: 1200px; width: 100%; margin: 0 auto; padding: 50px 36px 26px;
    display: grid; grid-template-columns: 1.04fr .96fr; gap: 60px; align-items: center; }
  @media (max-width: 980px) { .hero-in { grid-template-columns: 1fr; } }
  .hero .eyebrow { color: var(--landlord); }
  .masthead { font-family: ui-monospace, Menlo, monospace; font-size: 9.5px; letter-spacing: .18em; color: var(--ink-3);
    display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; }
  .hero h1 { font-family: var(--serif); font-weight: 900; font-size: clamp(36px, 4.8vw, 60px); line-height: 1.24;
    letter-spacing: .01em; margin: 18px 0 0; color: var(--ink); }
  .hero h1 .grad { background: linear-gradient(92deg, var(--tenant), var(--agent)); -webkit-background-clip: text; background-clip: text; color: transparent; white-space: nowrap; }
  .hero .sub { font-size: 15.5px; margin: 18px 0 0; max-width: 32em; color: var(--ink-2); }
  .hero .sub b { color: var(--ink); }
  .pains { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
  .pain { display: flex; gap: 10px; align-items: baseline; font-size: 13.5px; color: var(--ink-2); }
  .pain .pd { width: 7px; height: 7px; border-radius: 999px; flex: none; transform: translateY(-1px); }
  .pain:nth-child(1) .pd { background: var(--landlord); }
  .pain:nth-child(2) .pd { background: var(--tenant); }
  .pain:nth-child(3) .pd { background: var(--agent); }
  .pain b { color: var(--ink); }
  .trybar { margin-top: 26px; display: flex; background: #fff; border: 1.5px solid var(--ink);
    border-radius: 15px; overflow: hidden; max-width: 500px;
    box-shadow: 0 14px 44px -18px rgba(23,22,27,.4); }
  .trybar .q { flex: 1; padding: 16px 19px; font-size: 14.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .trybar .q .caret { display: inline-block; width: 2px; height: 1em; background: var(--tenant); vertical-align: -2px; margin-left: 2px; }
  @media (prefers-reduced-motion: no-preference) { .trybar .q .caret { animation: blink 1s steps(1) infinite; } @keyframes blink { 50% { opacity: 0; } } }
  .trybar button, .trybar a { display: inline-flex; align-items: center; text-decoration: none;
    background: linear-gradient(92deg, var(--tenant), #6D46C4); color: #fff; border: none; padding: 0 26px; font-size: 14.5px; font-weight: 700; }
  .hero .note { margin-top: 13px; font-size: 12px; color: var(--ink-3); }

  /* 右：拱形照片 + 悬叠 Agent 卡 */
  .arch { position: relative; margin-left: 46px; }
  @media (max-width: 980px) { .arch { margin-left: 0; max-width: 470px; } }
  .arch img { width: 100%; aspect-ratio: 4 / 5.1; object-fit: cover; object-position: center 20%;
    border-radius: 300px 300px 28px 28px; filter: saturate(.72) brightness(1.02); display: block;
    box-shadow: 0 44px 90px -44px rgba(23,22,27,.55); }
  .arch .ring { position: absolute; top: -13px; left: -13px; right: -13px; height: 62%;
    border: 1px dashed var(--line-2); border-bottom: none; border-radius: 320px 320px 0 0; pointer-events: none; }
  .arch .vlabel { position: absolute; right: -32px; top: 58px; writing-mode: vertical-rl;
    font-family: ui-monospace, Menlo, monospace; font-size: 9.5px; letter-spacing: .3em; color: var(--ink-3); }
  .crew { position: absolute; left: -86px; bottom: 28px; width: min(330px, 88%); display: flex; flex-direction: column; gap: 10px; }
  @media (max-width: 980px) { .crew { position: static; width: 100%; margin-top: 16px; } }
  .crew-card { display: flex; align-items: center; gap: 13px; background: rgba(255,255,255,.9); border: 1px solid var(--line);
    border-radius: 15px; padding: 12px 16px; backdrop-filter: blur(12px); box-shadow: 0 18px 44px -22px rgba(23,22,27,.4); }
  .crew-card .o { width: 30px; height: 30px; border-radius: 999px; flex: none; }
  .crew-card[data-r="l"] .o { background: radial-gradient(circle at 32% 28%, var(--landlord-light), var(--landlord)); }
  .crew-card[data-r="t"] .o { background: radial-gradient(circle at 32% 28%, var(--tenant-light), var(--tenant)); }
  .crew-card[data-r="a"] .o { background: radial-gradient(circle at 32% 28%, var(--agent-light), var(--agent)); }
  @media (prefers-reduced-motion: no-preference) {
    .crew-card .o { animation: breathe 4s ease-in-out infinite; }
    .crew-card:nth-child(2) .o { animation-delay: 1.3s; } .crew-card:nth-child(3) .o { animation-delay: 2.6s; }
    @keyframes breathe { 50% { transform: scale(1.1); filter: brightness(1.12); } }
  }
  .crew-card .cw b { display: block; font-size: 13px; color: var(--ink); }
  .crew-card .cw span { display: block; font-size: 11px; color: var(--ink-3); margin-top: 1px; }
  .crew-card .st { margin-left: auto; font-family: ui-monospace, Menlo, monospace; font-size: 8.5px; letter-spacing: .13em; color: var(--landlord); }

  /* ============ 跑马灯：AI 实时在干活 ============ */
  .tick { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: #fff; margin-top: 54px;
    overflow: hidden; }
  .tick-in { display: flex; gap: 56px; white-space: nowrap; padding: 13px 0; width: max-content;
    font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; letter-spacing: .14em; color: var(--ink-2); }
  @media (prefers-reduced-motion: no-preference) { .tick-in { animation: tick 36s linear infinite; }
    @keyframes tick { to { transform: translateX(-50%); } } }
  .tick-in span { display: inline-flex; align-items: center; gap: 9px; }
  .tick-in i { font-style: normal; width: 6px; height: 6px; border-radius: 999px; }
  .tick-in .tl i { background: var(--landlord); } .tick-in .tt i { background: var(--tenant); } .tick-in .ta i { background: var(--agent); }
  .tick-in b { color: var(--ink); font-weight: 700; }

  /* ============ 剧场段 ============ */
  .th { position: relative; padding: 100px 0 34px; isolation: isolate; }
  .th::before { content: attr(data-char); position: absolute; top: 22px; z-index: -1; font-family: var(--serif);
    font-weight: 900; font-size: clamp(200px, 25vw, 330px); line-height: 1; color: transparent;
    -webkit-text-stroke: 1.5px rgba(23,22,27,.075); pointer-events: none; }
  .th[data-side="r"]::before { right: 1%; }
  .th[data-side="l"]::before { left: 1%; }
  .th::after { content: ""; position: absolute; z-index: -2; top: 16%; bottom: 4%; width: 44%; border-radius: 44px; }
  .th[data-r="l"]::after { background: var(--landlord-soft); right: -6%; transform: rotate(1.2deg); }
  .th[data-r="t"]::after { background: var(--tenant-soft); left: -6%; transform: rotate(-1.2deg); }
  .th[data-r="a"]::after { background: var(--agent-soft); right: -6%; transform: rotate(.8deg); }
  .th-head { max-width: 820px; }
  .th .actline { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; letter-spacing: .22em; color: var(--ink-3); }
  .th h2 { font-family: var(--serif); font-weight: 900; font-size: clamp(28px, 4vw, 46px); letter-spacing: .01em; margin: 16px 0 0; color: var(--ink); }
  .th[data-r="l"] .actline b { color: var(--landlord); }
  .th[data-r="t"] .actline b { color: var(--tenant); }
  .th[data-r="a"] .actline b { color: var(--agent); }
  .th-grid { display: grid; grid-template-columns: .92fr 1.08fr; gap: 60px; margin-top: 44px; align-items: start; }
  .th[data-side="l"] .th-grid { grid-template-columns: 1.08fr .92fr; }
  .th[data-side="l"] .th-copy { order: 2; }
  @media (max-width: 980px) { .th-grid, .th[data-side="l"] .th-grid { grid-template-columns: 1fr; }
    .th[data-side="l"] .th-copy { order: 0; } }

  .mono-quote { font-family: var(--serif); font-size: clamp(18px, 2vw, 23px); line-height: 1.75; color: var(--ink); font-weight: 700; position: relative; }
  .mono-quote::before { content: "「"; position: absolute; left: -.15em; top: -.72em; font-size: 3.2em; color: transparent;
    -webkit-text-stroke: 1.2px rgba(23,22,27,.22); font-weight: 900; }
  .mono-quote .qin { display: block; padding-top: 34px; }
  .mono-who { margin-top: 14px; font-family: ui-monospace, Menlo, monospace; font-size: 10px; letter-spacing: .16em; color: var(--ink-3); }
  .answers { margin-top: 28px; display: flex; flex-direction: column; }
  .ans { display: grid; grid-template-columns: 48px 1fr; gap: 14px; padding: 15px 0; border-top: 1px solid var(--line); }
  .ans .an { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: var(--ink-3); padding-top: 5px; white-space: nowrap; }
  .ans b { display: block; font-size: 15px; color: var(--ink); }
  .ans span { display: block; font-size: 12.5px; color: var(--ink-2); margin-top: 3px; line-height: 1.75; }
  .ans span i { font-style: normal; color: var(--ink); font-weight: 600; }
  .delta-row { margin-top: 26px; display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
  .delta { font-family: ui-monospace, Menlo, monospace; font-weight: 800; font-size: 30px; display: inline-flex; align-items: baseline; gap: 12px; }
  .delta .fr { color: var(--ink-3); text-decoration: line-through; text-decoration-thickness: 2px; font-size: 15px; }
  .delta .ar { color: var(--ink-3); font-size: 15px; }
  .th[data-r="l"] .delta .to { color: var(--landlord); }
  .th[data-r="t"] .delta .to { color: var(--tenant); }
  .th[data-r="a"] .delta .to { color: var(--agent); }
  .delta-cap { font-size: 13px; color: var(--ink-2); }
  .delta-cap b { color: var(--ink); }
  .th-cta { margin-top: 22px; display: inline-block; text-decoration: none; color: #fff; font-weight: 700;
    font-size: 13.5px; border-radius: 12px; padding: 12px 24px; }
  .th[data-r="l"] .th-cta { background: var(--landlord); box-shadow: 0 12px 30px -12px rgba(4,120,87,.55); }
  .th[data-r="t"] .th-cta { background: var(--tenant); box-shadow: 0 12px 30px -12px rgba(124,58,237,.55); }
  .th[data-r="a"] .th-cta { background: var(--agent); box-shadow: 0 12px 30px -12px rgba(37,99,235,.55); }

  /* 右：活的 Agent 会话流（纸叠层次） */
  .feed { position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 18px;
    box-shadow: 0 32px 70px -34px rgba(23,22,27,.38); }
  .feed::after { content: ""; position: absolute; z-index: -1; inset: 16px -13px -13px 16px; background: #fff;
    border: 1px solid var(--line); border-radius: 20px; opacity: .6; transform: rotate(1.1deg); }
  .feed::before { content: ""; position: absolute; z-index: -2; inset: 30px -24px -24px 30px; background: #fff;
    border: 1px solid var(--line); border-radius: 20px; opacity: .32; transform: rotate(2.2deg); }
  .th[data-side="l"] .feed::after { inset: 16px 16px -13px -13px; transform: rotate(-1.1deg); }
  .th[data-side="l"] .feed::before { inset: 30px 30px -24px -24px; transform: rotate(-2.2deg); }
  .feed-head { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
  .feed-head .o { width: 24px; height: 24px; border-radius: 999px; flex: none; }
  .th[data-r="l"] .feed-head .o { background: radial-gradient(circle at 32% 28%, var(--landlord-light), var(--landlord)); }
  .th[data-r="t"] .feed-head .o { background: radial-gradient(circle at 32% 28%, var(--tenant-light), var(--tenant)); }
  .th[data-r="a"] .feed-head .o { background: radial-gradient(circle at 32% 28%, var(--agent-light), var(--agent)); }
  @media (prefers-reduced-motion: no-preference) { .feed-head .o { animation: breathe 3.6s ease-in-out infinite; } }
  .feed-head b { font-size: 13px; color: var(--ink); }
  .feed-head .st { margin-left: auto; font-family: ui-monospace, Menlo, monospace; font-size: 9px; letter-spacing: .13em; color: var(--landlord); }
  .fmsgs { display: flex; flex-direction: column; gap: 10px; padding-top: 13px; }
  .fmsgs > * { opacity: 0; transform: translateY(10px); transition: opacity .5s ease, transform .5s ease; }
  .feed.play .fmsgs > * { opacity: 1; transform: none; }
  .feed.play .fmsgs > *:nth-child(1) { transition-delay: .1s; }
  .feed.play .fmsgs > *:nth-child(2) { transition-delay: .45s; }
  .feed.play .fmsgs > *:nth-child(3) { transition-delay: .85s; }
  .feed.play .fmsgs > *:nth-child(4) { transition-delay: 1.25s; }
  .feed.play .fmsgs > *:nth-child(5) { transition-delay: 1.65s; }
  .feed.play .fmsgs > *:nth-child(6) { transition-delay: 2.05s; }
  @media (prefers-reduced-motion: reduce) { .fmsgs > * { opacity: 1; transform: none; transition: none; } }
  .fm-u { align-self: flex-end; color: #fff; border-radius: 12px 12px 3px 12px; padding: 8px 13px; font-size: 12.5px; max-width: 86%; }
  .th[data-r="l"] .fm-u { background: var(--landlord); }
  .th[data-r="t"] .fm-u { background: var(--tenant); }
  .th[data-r="a"] .fm-u { background: var(--agent); }
  .fm-a { align-self: flex-start; background: var(--bg-2); border: 1px solid var(--line); border-radius: 12px 12px 12px 3px;
    padding: 8px 13px; font-size: 12.5px; color: var(--ink-2); max-width: 94%; }
  .fm-a b { color: var(--ink); }
  .fcard { background: var(--panel-2); border: 1px solid var(--line-2); border-radius: 13px; padding: 12px 14px; }
  .fcard .fl { font-family: ui-monospace, Menlo, monospace; font-size: 9px; letter-spacing: .14em; color: var(--ink-3); }
  .frow { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 6px 0; border-bottom: 1px dashed var(--line); font-size: 12px; }
  .frow:last-child { border-bottom: none; }
  .frow b { color: var(--ink); font-size: 12.5px; }
  .frow .ok { color: var(--landlord); font-weight: 700; font-size: 11px; white-space: nowrap; }
  .frow .bad { color: var(--danger); font-weight: 700; font-size: 11px; white-space: nowrap; }
  .frow .mut { color: var(--ink-3); font-size: 11px; }
  .fbtns { display: flex; gap: 8px; margin-top: 11px; align-items: center; }
  .fbtns .go { border: none; border-radius: 9px; color: #fff; font-size: 11.5px; font-weight: 700; padding: 8px 15px; }
  .th[data-r="l"] .fbtns .go { background: var(--landlord); }
  .th[data-r="t"] .fbtns .go { background: var(--tenant); }
  .th[data-r="a"] .fbtns .go { background: var(--agent); }
  .fbtns .gh { background: #fff; border: 1px solid var(--line-2); color: var(--ink-2); border-radius: 9px; font-size: 11.5px; font-weight: 700; padding: 8px 13px; }
  .fbtns .tm { margin-left: auto; font-family: ui-monospace, Menlo, monospace; font-size: 9px; color: var(--ink-3); }
  .fthink { display: flex; align-items: center; gap: 6px; }
  .fthink i { width: 5px; height: 5px; border-radius: 999px; opacity: .55; }
  .th[data-r="l"] .fthink i { background: var(--landlord); }
  .th[data-r="t"] .fthink i { background: var(--tenant); }
  .th[data-r="a"] .fthink i { background: var(--agent); }
  @media (prefers-reduced-motion: no-preference) {
    .fthink i { animation: thk 1.2s ease-in-out infinite; }
    .fthink i:nth-child(2) { animation-delay: .18s; } .fthink i:nth-child(3) { animation-delay: .36s; }
    @keyframes thk { 40% { opacity: 1; transform: translateY(-2px); } }
  }
  .fthink span { font-size: 10.5px; color: var(--ink-3); }
  .syslog { margin-top: 12px; border-top: 1px dashed var(--line); padding-top: 10px;
    font-family: ui-monospace, Menlo, monospace; font-size: 9.5px; line-height: 2; color: var(--ink-3); }
  .syslog .ok2 { color: var(--landlord); }
  .syslog .blk { color: var(--danger); }
  .syslog .tme { opacity: .6; margin-right: 8px; }

  /* ============ 原则带 ============ */
  .creedo { padding: 110px 0 20px; text-align: center; }
  .creedo .eyebrow { color: var(--tenant); }
  .creedo h2 { font-family: var(--serif); font-weight: 900; font-size: clamp(26px, 3.8vw, 44px); margin: 16px 0 0; color: var(--ink); }
  .creedo .row3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 48px; text-align: left; }
  @media (max-width: 900px) { .creedo .row3 { grid-template-columns: 1fr; } }
  .cr { position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 24px;
    box-shadow: 0 18px 44px -28px rgba(23,22,27,.3); overflow: hidden; }
  .cr .bign { position: absolute; top: -18px; right: 6px; font-family: var(--serif); font-weight: 900; font-size: 92px;
    line-height: 1; color: transparent; -webkit-text-stroke: 1.2px rgba(23,22,27,.12); }
  .cr .cn { font-family: ui-monospace, Menlo, monospace; font-size: 10px; letter-spacing: .18em; color: var(--ink-3); }
  .cr b { display: block; font-size: 15.5px; margin-top: 12px; color: var(--ink); }
  .cr p { font-size: 12.5px; color: var(--ink-2); margin: 8px 0 0; line-height: 1.8; }
  .cr p i { font-style: normal; color: var(--ink); font-weight: 600; }

  /* ============ 定价 + 终幕 ============ */
  .fin { position: relative; padding: 110px 0 130px; text-align: center; overflow: hidden; }
  .fin::before { content: ""; position: absolute; left: 50%; top: 42%; width: 900px; height: 900px; transform: translate(-50%,-50%);
    background: radial-gradient(circle, rgba(139,92,246,.10), transparent 60%); pointer-events: none; }
  .fin .zero { font-family: ui-monospace, Menlo, monospace; font-size: clamp(56px, 8vw, 96px); font-weight: 800; letter-spacing: -.04em;
    line-height: 1; background: linear-gradient(120deg, var(--tenant), var(--agent)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .fin .zl { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; letter-spacing: .22em; color: var(--ink-3); margin-top: 10px; }
  .fin h2 { position: relative; font-family: var(--serif); font-weight: 900; font-size: clamp(30px, 4.6vw, 54px); margin: 34px 0 0; color: var(--ink); }
  .fin .creed { display: flex; gap: 12px 28px; justify-content: center; flex-wrap: wrap; margin-top: 22px; font-size: 12.5px; color: var(--ink-2); }
  .fin .creed span::before { content: "✓ "; color: var(--landlord); font-weight: 800; }
  .fin .trybar { margin: 36px auto 0; }
  .fin .note { margin-top: 14px; font-size: 12px; color: var(--ink-3); }
`

/* ===================== page ===================== */

export default function HomePage() {
  // Scroll reveal — blueprint behavior: IO adds .in on intersection (and .play
  // on [data-feed]); reduced motion shows everything immediately.
  // 瞬时跳转（锚点/instant scroll）会让 IO 停留在 false→false 永不触发，
  // 兜底在 scroll/load 时逐帧检查 top < innerHeight 补 .in（.in 幂等，安全）。
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const reveal = (el: Element) => {
      el.classList.add('in')
      if (el.hasAttribute('data-feed')) el.classList.add('play')
    }
    if (reduced || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.rv').forEach(reveal)
      return
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            reveal(e.target)
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.08 },
    )
    document.querySelectorAll('.rv').forEach((el) => io.observe(el))
    const catchUp = () =>
      document.querySelectorAll('.rv:not(.in)').forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) reveal(el)
      })
    window.addEventListener('scroll', catchUp, { passive: true })
    window.addEventListener('load', catchUp)
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', catchUp)
      window.removeEventListener('load', catchUp)
    }
  }, [])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Header variant="transparent" />
      <div className="v6-page">
        {/* ================= HERO ================= */}
        <section className="hero">
          <div className="hero-in">
            <div>
              <div className="eyebrow">/ AI-NATIVE RENTAL OS</div>
              <div className="masthead">
                <span>TORONTO · 43.65°N 79.38°W</span>
                <span>EST. 2026</span>
                <span>VOL. 6</span>
              </div>
              <h1>
                租房路上的难题，
                <br />
                交给<span className="grad">各自的 AI</span>。
              </h1>
              <div className="pains">
                <div className="pain">
                  <span className="pd" />
                  <span>
                    <b>房东</b>：租客筛选费时、租金回收缺保障、日常事务无人分担
                  </span>
                </div>
                <div className="pain">
                  <span className="pd" />
                  <span>
                    <b>租客</b>：材料反复提交、被拒无说明、缺少本地信用记录
                  </span>
                </div>
                <div className="pain">
                  <span className="pd" />
                  <span>
                    <b>经纪</b>：行政事务占用时间、佣金结算不透明
                  </span>
                </div>
              </div>
              <p className="sub">
                Stayloop 为三种角色各提供一个<b>独立的 AI Agent</b>：日常事务由它处理，关键决定由你确认。
              </p>
              <HeroTryBar />
              <p className="note">由 Anthropic Claude 驱动 · 免注册体验 · 真实挂牌 + TRREB 官方行情作答</p>
            </div>
            <div className="arch rv">
              <span className="ring" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/home/hero-mist.jpg" alt="晨雾中的多伦多 CN 塔" />
              <span className="vlabel">晨雾 · 多伦多 · CN TOWER</span>
              <div className="crew">
                <div className="crew-card" data-r="l">
                  <span className="o" />
                  <span className="cw">
                    <b>LOGIC · 房东的</b>
                    <span>尽调、收租、续约</span>
                  </span>
                  <span className="st">● 待命</span>
                </div>
                <div className="crew-card" data-r="t">
                  <span className="o" />
                  <span className="cw">
                    <b>LUNA · 租客的</b>
                    <span>找房、护照、租约</span>
                  </span>
                  <span className="st">● 待命</span>
                </div>
                <div className="crew-card" data-r="a">
                  <span className="o" />
                  <span className="cw">
                    <b>BRIEF · 经纪的</b>
                    <span>日程、材料包、结算</span>
                  </span>
                  <span className="st">● 待命</span>
                </div>
              </div>
            </div>
          </div>
          <div className="tick" aria-hidden="true">
            <div className="tick-in">
              <span className="tl"><i />02:14 LOGIC 备好 <b>续约方案 A/B</b></span>
              <span className="tt"><i />08:02 LUNA 发现 <b>2 套低于预算的新房源</b></span>
              <span className="ta"><i />07:30 BRIEF 编排 <b>今日 3 场带看</b></span>
              <span className="tl"><i />02:15 GUARDRAIL <b>拦截 1 份伪造工资单</b></span>
              <span className="tt"><i />09:10 PASSPORT <b>第 3 枚章盖好</b></span>
              <span className="ta"><i />21:04 结算 <b>$1,225 已到账</b></span>
              <span className="tl"><i />02:14 LOGIC 备好 <b>续约方案 A/B</b></span>
              <span className="tt"><i />08:02 LUNA 发现 <b>2 套低于预算的新房源</b></span>
              <span className="ta"><i />07:30 BRIEF 编排 <b>今日 3 场带看</b></span>
              <span className="tl"><i />02:15 GUARDRAIL <b>拦截 1 份伪造工资单</b></span>
              <span className="tt"><i />09:10 PASSPORT <b>第 3 枚章盖好</b></span>
              <span className="ta"><i />21:04 结算 <b>$1,225 已到账</b></span>
            </div>
          </div>
        </section>

        {/* ================= 房东剧场 ================= */}
        <section className="th" data-r="l" data-char="壹" data-side="r" id="l">
          <div className="wrap">
            <div className="th-head rv">
              <div className="actline">
                01 · 房东 · <b>SARAH WANG</b>
              </div>
              <h2>
                选对租客，按时收租，
                <br />
                后台有支持。
              </h2>
            </div>
            <div className="th-grid">
              <div className="th-copy rv">
                <p className="mono-quote">
                  <span className="qin">
                    空置一个月，$2,900 就没了。一叠申请摆在面前——工资单是真是假？我不知道该信谁。
                  </span>
                </p>
                <div className="mono-who">SARAH WANG · 41 · 会计师 · 2 套投资公寓</div>
                <div className="answers">
                  <div className="ans">
                    <span className="an">选对人</span>
                    <div>
                      <b>每份申请先过六维尽调</b>
                      <span>
                        材料真伪、法庭记录都查过，<i>每一分写明理由</i>，伪造材料会被识别并拦下。
                      </span>
                    </div>
                  </div>
                  <div className="ans">
                    <span className="an">收对租</span>
                    <div>
                      <b>租金回收由系统跟进</b>
                      <span>
                        在线收租、月末自动提醒、逾期跟进；续约提前 120 天备好方案，<i>现金流不断档</i>。
                      </span>
                    </div>
                  </div>
                  <div className="ans">
                    <span className="an">强后台</span>
                    <div>
                      <b>AI 后台全天候在线</b>
                      <span>
                        夜间报修接待、RTA/OHRC 合规拦截、全程审计留痕——<i>你只需要确认</i>。
                      </span>
                    </div>
                  </div>
                </div>
                <div className="delta-row">
                  <span className="delta num">
                    <span className="fr">每份申请 30 分钟</span>
                    <span className="ar">→</span>
                    <span className="to">30 秒</span>
                  </span>
                  <span className="delta-cap">
                    <b>审核提速，决定仍由她做。</b>
                  </span>
                </div>
                <Link className="th-cta" href="/landlord/agent">
                  让 Logic 协助管理房源 →
                </Link>
              </div>
              <div className="feed rv" data-feed="">
                <div className="feed-head">
                  <span className="o" />
                  <b>LOGIC · 房东 Agent</b>
                  <span className="st">● 后台运行中</span>
                </div>
                <div className="fmsgs">
                  <div className="fm-u">1207 的三份申请，帮我看一下</div>
                  <div className="fm-a">
                    查完了。<b>Mia Chen 六维全过（87 分）</b>，法庭记录 0 条；有一份的工资单没过取证——细节如下：
                  </div>
                  <div className="fcard">
                    <div className="fl">六维尽调 · 3 份申请排序</div>
                    <div className="frow">
                      <b>① Mia Chen · 87</b>
                      <span className="ok">✓ 六维全过 · 建议面谈</span>
                    </div>
                    <div className="frow">
                      <b>② Kevin Tran · 74</b>
                      <span className="mut">稳定性 62 · 可备选</span>
                    </div>
                    <div className="frow">
                      <b>③ 申请人 C</b>
                      <span className="bad">✗ 工资单 CRA 扣缴对不上 · 拦下</span>
                    </div>
                  </div>
                  <div className="fm-a">
                    另外：Thompson 的租约 <b>92 天后到期</b>，续约信我拟好了两个方案，批准就发。
                  </div>
                  <div className="fcard">
                    <div className="fl">待你批准 · 生成于 02:14</div>
                    <div className="frow">
                      <b>方案 A · 不涨租</b>
                      <span className="ok">8 年 0 投诉 · 建议</span>
                    </div>
                    <div className="frow">
                      <b>方案 B · +2.5%</b>
                      <span className="mut">安省指导上限内</span>
                    </div>
                    <div className="fbtns">
                      <button type="button" className="go">批准并发送 →</button>
                      <button type="button" className="gh">改一改</button>
                      <span className="tm">02:14 自动生成</span>
                    </div>
                  </div>
                  <div className="syslog">
                    <div>
                      <span className="tme">02:14</span>
                      <span className="ok2">proactive.scan</span> · 续约窗口命中 · 方案已备
                    </div>
                    <div>
                      <span className="tme">02:15</span>
                      <span className="blk">guardrail.blocked</span> · 申请 C 材料取证未过 → 一票否决
                    </div>
                    <div>
                      <span className="tme">08:31</span>
                      <span className="ok2">audit.logged</span> · 每一步留痕，随时回查
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 租客剧场 ================= */}
        <section className="th" data-r="t" data-char="贰" data-side="l" id="t">
          <div className="wrap">
            <div className="th-head rv">
              <div className="actline">
                02 · 租客 · <b>MIA CHEN</b>
              </div>
              <h2>
                没有本地信用记录，
                <br />
                也能建立可信的租房履历。
              </h2>
            </div>
            <div className="th-grid">
              <div className="th-copy rv">
                <p className="mono-quote">
                  <span className="qin">信用空白，被拒 3 次。五个网站刷到深夜，同样的资料填了一遍又一遍。</span>
                </p>
                <div className="mono-who">MIA CHEN · 27 · 软件工程师 · 新移民</div>
                <div className="answers">
                  <div className="ans">
                    <span className="an">说一句</span>
                    <div>
                      <b>自然语言描述条件，房源真实可核</b>
                      <span>
                        真实挂牌 + TRREB 官方行情实时对照，<i>绝不编造</i>；英文租约逐条讲成中文。
                      </span>
                    </div>
                  </div>
                  <div className="ans">
                    <span className="an">验一次</span>
                    <div>
                      <b>四枚章盖好，处处通行</b>
                      <span>
                        护照、枫叶卡、工签都支持——<i>申请任何房源不再重复交材料</i>。
                      </span>
                    </div>
                  </div>
                  <div className="ans">
                    <span className="an">有记录</span>
                    <div>
                      <b>没有信用历史，也能积累记录</b>
                      <span>
                        按时租金、真实记录都写进你的护照，<i>评分带理由</i>，拒绝你必须有依据。
                      </span>
                    </div>
                  </div>
                </div>
                <div className="delta-row">
                  <span className="delta num">
                    <span className="fr">综合分 60</span>
                    <span className="ar">→</span>
                    <span className="to">91</span>
                  </span>
                  <span className="delta-cap">
                    <b>第二次申请，材料无需重复提交。</b>
                  </span>
                </div>
                <Link className="th-cta" href="/tenant/agent">
                  让 Luna 开始找 →
                </Link>
              </div>
              <div className="feed rv" data-feed="">
                <div className="feed-head">
                  <span className="o" />
                  <b>LUNA · 租客 Agent</b>
                  <span className="st">● LIVE</span>
                </div>
                <div className="fmsgs">
                  <div className="fm-u">市中心一居，能养猫，2300 以内</div>
                  <div className="fm-a">
                    Downtown 一居中位 <b>$2,210</b>（TRREB 官方 C01：$2,187 · 812 宗成交）——你的预算够用。
                    <b>3 套可养猫</b>的已挑好：
                  </div>
                  <div className="fcard">
                    <div className="fl">真实挂牌 · 已核对</div>
                    <div className="frow">
                      <b>Liberty Village 1B · $2,250</b>
                      <span className="ok">✓ 可养猫 · 地铁 8 分钟</span>
                    </div>
                    <div className="frow">
                      <b>King West Studio+ · $2,180</b>
                      <span className="ok">✓ 可养猫 · 平台已核验</span>
                    </div>
                    <div className="frow">
                      <b>Fort York 1B · $2,290</b>
                      <span className="mut">带家具 · 需快申</span>
                    </div>
                  </div>
                  <div className="fm-a">
                    你的护照已盖 <b>3/4 枚章</b>——选中哪套，材料一份不用再传，我直接替你递交。
                  </div>
                  <div className="fcard">
                    <div className="fbtns">
                      <button type="button" className="go">用护照一键申请 →</button>
                      <button type="button" className="gh">先约看</button>
                      <span className="tm">免费 · 永远</span>
                    </div>
                  </div>
                  <div className="fthink">
                    <i />
                    <i />
                    <i />
                    <span>Luna 正在核对挂牌真实性…</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 经纪剧场 ================= */}
        <section className="th" data-r="a" data-char="叁" data-side="r" id="a">
          <div className="wrap">
            <div className="th-head rv">
              <div className="actline">
                03 · 经纪 · <b>DAVID PARK</b>
              </div>
              <h2>
                行政事务交给 AI，
                <br />
                时间留给专业工作。
              </h2>
            </div>
            <div className="th-grid">
              <div className="th-copy rv">
                <p className="mono-quote">
                  <span className="qin">
                    不是没机会，是时间被行政碎片化了——整理材料、排时间、催跟进，客户一忙就跟丢。
                  </span>
                </p>
                <div className="mono-who">DAVID PARK · 35 · 持牌经纪 · RECO 6 年</div>
                <div className="answers">
                  <div className="ans">
                    <span className="an">只带看</span>
                    <div>
                      <b>材料包 Brief 已备好</b>
                      <span>
                        时间地点、租客画像、<i>授权问答清单</i>（能说什么、不能说什么）——到场专注带看本身。
                      </span>
                    </div>
                  </div>
                  <div className="ans">
                    <span className="an">不跟丢</span>
                    <div>
                      <b>反馈自动收集归档</b>
                      <span>
                        看房意见整理好直达房东，<i>每个客户的进度都有人盯</i>。
                      </span>
                    </div>
                  </div>
                  <div className="ans">
                    <span className="an">算得清</span>
                    <div>
                      <b>佣金当晚结算</b>
                      <span>
                        转介分成在线到账、<i>每一笔流水可查</i>，RECO 合规全程留痕。
                      </span>
                    </div>
                  </div>
                </div>
                <div className="delta-row">
                  <span className="delta num">
                    <span className="fr">时薪 $25</span>
                    <span className="ar">→</span>
                    <span className="to">$43</span>
                  </span>
                  <span className="delta-cap">
                    <b>同样的时间，能服务更多客户。</b>
                  </span>
                </div>
                <Link className="th-cta" href="/agent/agent">
                  让 Brief 安排你的日程 →
                </Link>
              </div>
              <div className="feed rv" data-feed="">
                <div className="feed-head">
                  <span className="o" />
                  <b>BRIEF · 经纪 Agent</b>
                  <span className="st">● 编排中</span>
                </div>
                <div className="fmsgs">
                  <div className="fm-u">明天的带看都排好</div>
                  <div className="fm-a">
                    排好了，<b>3 场带看</b>，租客都已确认到场。每场的材料包在这里：
                  </div>
                  <div className="fcard">
                    <div className="fl">明日日程 · 已确认</div>
                    <div className="frow">
                      <b>11:00 · Liberty Village 2B</b>
                      <span className="ok">✓ Kevin 已确认 · 材料包好</span>
                    </div>
                    <div className="frow">
                      <b>14:00 · Unit 1207 King West</b>
                      <span className="ok">✓ 授权问答清单已生成</span>
                    </div>
                    <div className="frow">
                      <b>16:30 · 反馈汇总 → Sarah</b>
                      <span className="mut">自动整理 · 无需你动手</span>
                    </div>
                  </div>
                  <div className="fm-a">
                    上周的转介佣金 <b>$1,225 已到账</b>——流水在结算页随时可查。
                  </div>
                  <div className="syslog">
                    <div>
                      <span className="tme">07:30</span>
                      <span className="ok2">schedule.built</span> · 3 场带看编排完成
                    </div>
                    <div>
                      <span className="tme">07:31</span>
                      <span className="ok2">scope.filtered</span> · 房东不授权字段已从问答清单剔除
                    </div>
                    <div>
                      <span className="tme">21:04</span>
                      <span className="ok2">payout.settled</span> · $1,225 · via Stripe · 留痕
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 原则带 ================= */}
        <div className="creedo">
          <div className="wrap">
            <div className="rv">
              <div className="eyebrow">/ BORN AI-NATIVE</div>
              <h2>
                从底层为 AI 设计的
                <br />
                租住系统。
              </h2>
            </div>
            <div className="row3 rv">
              <div className="cr">
                <span className="bign">壹</span>
                <div className="cn">对话即入口</div>
                <b>用自然语言沟通</b>
                <p>
                  地标、预算、偏好都能理解；<i>回答只引用真实挂牌和 TRREB 官方成交</i>，不做无依据的推断。
                </p>
              </div>
              <div className="cr">
                <span className="bign">贰</span>
                <div className="cn">主动干活</div>
                <b>例行工作自动完成</b>
                <p>
                  睡觉时扫续约窗口、盯新上房源、备租金提醒——<i>方案会提前准备好，等你确认</i>。
                </p>
              </div>
              <div className="cr">
                <span className="bign">叁</span>
                <div className="cn">你来拍板</div>
                <b>AI 提议，你决定</b>
                <p>
                  发送、签署、付款先变成等你批准的卡片；<i>RTA/OHRC 违规直接拦截</i>，每一步留痕。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ================= 定价 + 终幕 ================= */}
        <div className="fin">
          <div className="wrap rv">
            <div className="zero num">$0</div>
            <div className="zl">TENANTS · FOREVER FREE · 隐私不是商品</div>
            <h2>下一个家，从一句话开始。</h2>
            <div className="creed">
              <span>租客全程免费</span>
              <span>数据驻加拿大</span>
              <span>不出售个人数据</span>
              <span>房东按次付费，价格公开</span>
            </div>
            <div className="trybar">
              <span className="q">
                {TRY_LINES[0]}
                <span className="caret" aria-hidden="true" />
              </span>
              <Link href={promptHref(TRY_LINES[0])}>开始 →</Link>
            </div>
            <p className="note">免注册即可体验，随时开始。</p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}

/* ===================== hero trybar：打字机轮播 ===================== */

function HeroTryBar() {
  // Blueprint timing: 1800ms initial delay, 65ms/char, 2600ms hold per line.
  // SSR/initial state shows line 0 in full (as in the blueprint markup);
  // prefers-reduced-motion keeps it static (caret blink is CSS-gated too).
  const [li, setLi] = useState(0)
  const [chars, setChars] = useState(TRY_LINES[0].length)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let line = 0
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const type = () => {
      i++
      setLi(line)
      setChars(i)
      timer = i >= TRY_LINES[line].length ? setTimeout(next, 2600) : setTimeout(type, 65)
    }
    const next = () => {
      line = (line + 1) % TRY_LINES.length
      i = 0
      type()
    }
    timer = setTimeout(() => {
      i = 0
      type()
    }, 1800)
    return () => clearTimeout(timer)
  }, [])

  const full = TRY_LINES[li]
  return (
    <div className="trybar">
      <span className="q">
        {full.slice(0, chars)}
        <span className="caret" aria-hidden="true" />
      </span>
      <Link href={promptHref(full)}>试一句 →</Link>
    </div>
  )
}
