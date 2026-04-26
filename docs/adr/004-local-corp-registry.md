# ADR-004: Local CA federal corp registry, not OpenCorporates

- **Status**: Accepted
- **Date**: 2026-04-24
- **Author(s)**: Jason Han + Claude

## Context

stayloop 的 arm-length employer verification 需要查询加拿大公司注册信息。
背景：OpenCorporates 在 2025 年底关闭了未认证免费 tier，每次请求都返回 401。这导致 stayloop 一段时间内 silent 返回 "未找到"，造成大量 false negative。
OpenCorporates 商业 plan 价格：£2,250 / 年起，对 bootstrap 阶段过贵。

## Decision

**自建 CA federal corp registry**：
- 数据源：Corporations Canada open data（`ised-isde.canada.ca/cc/lgcy/download/OPEN_DATA_SPLIT.zip`）
- License: OGL-Canada（商业使用 OK）
- 存储：Supabase 表 `ca_corp_registry`（184k+ 联邦注册公司）
- 查询：pg_trgm 模糊搜索 + JSONSchema RPC（`search_corp_registry`、`lookup_corp_by_bn`）
- 月度刷新：GitHub Actions cron 每月 5 号跑

## Alternatives Considered

### 付费 OpenCorporates
- ❌ £2250/yr Essentials tier，bootstrap 阶段不划算
- ❌ 单点依赖，万一价格再涨怎么办

### 多源拼装（Quebec REQ + Ontario OBR + 各省）
- ❌ Quebec REQ license 是 CC-BY-NC-SA（禁止商用）
- ❌ Ontario OBR 没有公开 bulk download
- ❌ 每个省各自维护 ingestion 工程量大

### 爬 Corporations Canada 网页搜索
- ⚠️ 灰色地带 + 限流 + 易失效
- ❌ 不如直接用 open data dump

## Consequences

- ✅ 零 API 配额限制
- ✅ 商业许可清晰
- ✅ ~6 分钟全量 ingest（~200MB ZIP）
- ✅ 独家信号（lookup_corp_by_bn —— BN 反查公司）
- ⚠️ **覆盖范围限制**：联邦数据集只含 CBCA / NFP / COOP / BOTA，**不含**：
  - Ontario / BC / QC / 其他省级单独注册的公司
  - 受 OSFI 监管的金融机构（银行）
  - 受 CIRO 监管的券商（如 Citigroup Global Markets Canada）
- ⚠️ 数据延迟：月度刷新意味着新成立 / 解散公司 1 个月内不更新
- ⚠️ 需要月度 GitHub Actions 维护

为了缓解覆盖范围限制：

- `arm_length_company_not_found` flag 文案明确说明 "不在联邦数据库不代表公司不存在 / 是假的"
- 严重度限制为 `low`（不触发 hard gate）
- 启发式信号（numbered company / HR phone collision / 常见姓氏家族业务）继续作为补充

## Re-evaluation Triggers

- 出现 5+ 真实案例：用户输入的公司在联邦数据库找不到，但实际是大型金融机构 → 考虑加 OSFI / CIRO 名单 ingestion
- 跨省扩展（BC / Alberta）—— 需要重新评估省级数据源
- 月度刷新工程量超过维护带宽 → 考虑 Constellation / 第三方付费数据
- 用户量 > 1000 active landlords → 考虑付费 OpenCorporates 作为 fallback
