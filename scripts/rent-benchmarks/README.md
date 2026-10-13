# 租金基准数据（public.rent_benchmarks）· 2026-10-13 起取代 TRREB 季报

两个来源，都是公开授权、可商用、须注明来源：

| 来源 | 内容 | 周期 | 许可 |
|---|---|---|---|
| CMHC Rental Market Survey（大多伦多工作簿 `rmr-toronto-<year>-en.xlsx`） | 表 1.1.2 专门出租公寓分区 × 户型平均租金；表 4.1.3 出租公寓单元子区域 × 户型平均租金 | 每年 10 月调查、12 月发布 | CMHC Licence Agreement for the Use of Data（可转载、可做增值产品，注明「Source: Canada Mortgage and Housing Corporation (CMHC), Rental Market Survey, October YYYY」） |
| Statistics Canada 表 46-10-0092-01 | 多伦多 CMA 按户型的季度平均挂牌租金 | 季度 | Statistics Canada Open Licence |

## 更新
- **StatCan（自动）**：`.github/workflows/rent-benchmarks-refresh.yml` 每月 15 日跑 `node scripts/rent-benchmarks/load.mjs statcan`（需要 `SUPABASE_SERVICE_ROLE_KEY`）。
- **CMHC（每年一次，手动）**：到 https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables
  选 Greater Toronto Area → Download（文件名形如 `rmr-toronto-2026-en.xlsx`），然后：
  ```
  python3 -I scripts/rent-benchmarks/cmhc_to_json.py rmr-toronto-2026-en.xlsx > scripts/rent-benchmarks/cmhc-toronto-2026.json
  node scripts/rent-benchmarks/load.mjs cmhc scripts/rent-benchmarks/cmhc-toronto-2026.json
  ```
  解析器只认「Zone / Condo Sub Area」表头后的行，`**`（抑制值）跳过，质量字母 a–d 存进 `quality`。

## 读取
`lib/market/rentBenchmark.ts readRentBenchmark(minBeds, areaTerms, propertyType)`：公寓单元优先取 CMHC 出租公寓子区域，其余取 CMHC 分区（都回退到全市 / CMA），
并附统计局季度挂牌序列作趋势图；每处显示都带 `benchmarkAttribution()` 的来源句。TRREB 旧表 `trreb_rent_stats` 保留但不再读取。
