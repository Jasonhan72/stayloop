# ADR-003: Cloudflare Pages edge runtime, not traditional Node server

- **Status**: Accepted
- **Date**: 2026-04-26
- **Author(s)**: Jason Han + Claude

## Context

stayloop 是 Next.js 14 项目，部署平台候选：Cloudflare Pages、Vercel、传统 VM、AWS Lambda。

## Decision

**Cloudflare Pages**，所有 API routes 用 `export const runtime = 'edge'`。

## Alternatives Considered

### Vercel
- ✅ Next.js 原生最好支持
- ❌ 加拿大用户去美东 / 美西 latency 比 Cloudflare 全球边缘高
- ❌ 价格更贵（Pro $20/mo 起）
- ❌ Edge function 时长限制更紧

### 传统 VM / Render / Railway
- ❌ 单人维护成本
- ❌ Cold start 问题
- ❌ 无全球 CDN

### AWS Lambda + API Gateway
- ❌ 配置复杂
- ❌ Cold start
- ❌ 还是要 CloudFront 才能全球加速

## Consequences

- ✅ 0 cold start（V8 isolate 模型）
- ✅ 全球 CDN 边缘运行 Functions（多伦多附近节点延迟 < 30ms）
- ✅ 免费额度足够 stayloop 早期使用（10万 reqs/day）
- ✅ Auto-deploy on git push to main
- ⚠️ Bundle size 限制（Worker < 1MB / Pages Function < 25MB），不能用大依赖
- ⚠️ 部分 Node.js API 不支持（fs / native modules / 长连接）
- ⚠️ Long-running task 需要外置（Phase 4 时考虑 Cloudflare Queues / Workers）

## Re-evaluation Triggers

- Bundle size 超限（lib 太多）
- 出现需要 long-running task 的功能（Mediator agent 14 天调解流程）
- Cloudflare 免费额度不够（reqs > 10万/day）
- 出现 vendor lock-in 痛点
