# Echo Agent

> **租客 concierge agent**。Sprint 6-7 上线。租客侧主交互界面，帮助找房、Verified Passport 申请、应对房东问询。

## 职责（Sprint 6-7 范围）

- 自然语言找房（"Yorkville 一房两卫预算 $2800 之内的"）
- 引导租客创建 Verified Renter Passport
- 收到房东 application 后帮租客准备申请材料
- 解释 lease clauses（标准 Ontario lease 各条款）

## 不属于 Echo

- 评估房东方申请合理性 → Mediator（Phase 3+）
- listing 创作 → Nova
- 实际撮合付款 / 押金 → Phase 4+

## 待 Sprint 6 完成

- [ ] System prompt（中英双语 default）
- [ ] Verified Passport 申请引导
- [ ] listing search + map widget block

详见 [`flows/verified-passport.md`](../flows/verified-passport.md)。
