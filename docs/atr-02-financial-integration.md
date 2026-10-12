# ATR-02: Financial integration contract

A lifelong origin attribution does not automatically authorize a payout. The financial adapter must only create a participation after the platform's own net commission has been received and reconciled.

Inputs: canonical identity ID, origin partner and tenant, category, receipt ID, source tenant and order, net platform commission in integer cents, agreement ID and immutable version. Resolve each agreement at transaction time, snapshot it, and reject zero or disabled rates.

Uniqueness: a single participation per receipt, beneficiary, identity, and agreement. Retry is idempotent. Partial receipts are separate receipts. Never pay against the product sale gross or seller's commission.

Reversals: create compensating entries referring to the original allocation. Preserve the original immutable record and record refund reason and reference; prevent duplicate refund application.

Gate: tenant B must not see tenant A's commission or personal buyer details. Portal permissions expose only authorized summaries. Do not automate payouts until financial reconciliation and payout approval are integrated.

Do not merge or deploy from this draft PR before isolated migration and tests are complete.
