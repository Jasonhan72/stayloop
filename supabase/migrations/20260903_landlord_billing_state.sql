-- 2026-09-03 — subscription card v2 needs two things the webhook never stored.
--
-- 1) plan_cancel_at_period_end: a landlord who cancels in the Stripe portal
--    came back to /settings and still saw "renews on <date>" — we only kept
--    status + period end, and Stripe leaves status = 'active' until the period
--    actually ends. Written from customer.subscription.updated.
-- 2) card brand / last4: shown next to the renewal date so the landlord knows
--    which card is about to be charged. Best-effort (null when Stripe has no
--    default payment method on the subscription or customer).
ALTER TABLE public.landlords
  ADD COLUMN IF NOT EXISTS plan_cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_card_brand text,
  ADD COLUMN IF NOT EXISTS plan_card_last4 text;
