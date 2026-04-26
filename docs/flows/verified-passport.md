# Flow: Verified Renter Passport

> Echo agent 主导（Sprint 6-7 上线）。租客自助创建 90 天有效期的 verified 凭证。

## 高层流程

```
1. 租客访问 /tenant/passport → Echo 介绍 + 价格 ($5-15) + 流程预览
2. 上传 ID + 工资单 + 银行流水（可选 NOA / 推荐信）
3. 后台调用：
   - validate_id_numbers
   - run_pdf_forensics
   - analyze_bank_statement
   - lookup_corp_registry
   - search_canlii / search_ontario_portal
   - (Phase 3+) Equifax credit report via partner
4. compute_passport_score → 生成 score band
5. 用户付款（Stripe）→ 签发 verified_passport (hash, valid 90d)
6. 租客拿 hash → 给房东时直接出示
7. 房东在 stayloop 验证 hash → 看到摘要
```

## Sprint 6-7 待详细设计

- Echo system prompt
- Passport 视觉设计（V3 PDF 第 3 页有原型）
- score_band 计算公式
- Equifax 集成路径（Phase 3+）
- 申诉 / 修改流程（被 flag 的租客如何 challenge）
