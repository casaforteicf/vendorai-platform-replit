# VendorAI Commercial Model V1

Status: implementation baseline, 2026-09-17.

## Principles

1. Product is commercial; module/screen is technical implementation.
2. Segment changes applicability/context, not the underlying product identity.
3. Catalog is the source of price/name/media.
4. `commercial_product_profiles` maps a sellable product to technical modules.
5. `product_usage_quotas` stores quotas as data, never hard-coded in UI.
6. `usage_ledger` is the universal append-only source for consumption and cost.
7. Customers see Vendor Credits and human usage units (images, videos, prospects, renders), never provider/raw tokens or provider cost.
8. Vendor Credits normalize commercial usage and are independent of OpenAI/Anthropic token pricing.
9. Failed provider calls can have technical cost, but they do not debit customer quota.
10. Rollout starts in `measure_only`; enforcement comes only after coverage and margin validation.

## Access model

| Offer | Commercial role | Users | Access |
|---|---|---:|---|
| Vendor CRM Free | acquisition | unlimited | complete CRM, no artificial feature degradation |
| Vendor CRM | first paid conversion | unlimited | complete CRM + team use |
| Individual modules | expansion | unlimited | purchased capability only |
| Growth free access | product experience | unlimited while Growth is active | 5 free access days/month |
| Growth +5 days | prepaid | unlimited while pass is active | R$399 per additional 5-day block |
| VendorAI Growth | umbrella subscription | unlimited | all standard software products applicable to the tenant segment |

Growth regular catalog price: **R$1,490/month**.

Growth does not include unlimited implementation labor, custom development, media spend, third-party transaction charges or unlimited high-cost generation. Those remain services, pass-through costs or metered consumption.

## Canonical products

| Commercial key | Public/product name | Current catalog price | Growth | Main technical areas |
|---|---|---:|:---:|---|
| `vendor.crm.free` | Vendor CRM Free | R$0 | — | dashboard, leads, deals, scheduler, settings |
| `vendor.crm` | Vendor CRM | R$49.90/mo | yes | dashboard, leads, deals, scheduler, settings |
| `vendor.agenda` | Vendor Agenda | R$19.90/mo | yes | scheduler |
| `vendor.omnichannel` | Vendor Omnichannel | R$199/mo | yes | conversations |
| `vendor.prospector` | Vendor Prospector | R$399/mo | yes | prospector |
| `vendor.ai_team` | Vendor AI Team | R$499/mo | yes | SDR + agents |
| `vendor.revenue_scout` | Vendor Revenue Scout | R$499/mo | yes | revenue, churn, intelligence |
| `vendor.proposals_catalog` | Vendor Propostas & Catálogo | R$99/mo current equivalent | yes | proposals/catalog/contracts/commissions |
| `vendor.management` | Vendor Gestão | R$299/mo current equivalent | yes | finance, ERP, inventory, purchasing |
| `vendor.jarvis` | Vendor JARVIS | R$149/mo | yes | Vendor Brain/executive intelligence |
| `vendor.knowledge` | Vendor Knowledge AI | R$99/mo | yes | knowledge graph/base |
| `vendor.bi` | Vendor BI & Analytics | R$149/mo | yes | analytics/reports |
| `vendor.automations` | Vendor Automations | R$149/mo | yes | workflows/automation |
| `vendor.content_planner` | Vendor Content Planner | R$199/mo | yes | content planning/calendar |
| `vendor.content_studio` | Vendor Content Studio | R$399/mo | yes | copy/content generation |
| `vendor.creative_studio` | Vendor Creative Studio | R$139/mo | yes | image/video generation |
| `vendor.ads` | Vendor Ads | R$199/mo | yes | paid-media planning/generation |
| `vendor.sites_autopilot` | Vendor Sites & Autopilot | R$499/mo | yes | sites, LP, SEO, blog, autopilot |
| `vendor.praca` | Praça.ai | R$299/mo current equivalent | yes | marketplace/orders/logistics/reputation |
| `vendor.app_builder` | Vendor App Builder | R$299/mo | yes | app builder |
| `vendor.reputation` | Vendor Reputation | R$79/mo | yes | reviews/reputation |
| `arqdor.ai` | arqdor.ai | public SKU pending | yes | architecture, render, budgets, library, client portal |
| `vendor.growth` | VendorAI Growth | R$1,490/mo | umbrella | all applicable standard software products |
| `vendor.growth.5d` | Growth +5 days | R$399 | umbrella pass | temporary Growth entitlement |
| `vendor.implementation` | Implantação VendorAI | R$1,890 | no | human assisted onboarding |
| `vendor.custom_app` | App Personalizado VendorAI | R$4,990 | no | custom service |

`Obras`, `Churn`, `Vendor Brain`, `Knowledge Graph`, `Financeiro`, `Inventory`, `Reports`, `Clinic`, `Beauty`, `Supermercado`, etc. are not automatically sellable products. They are technical modules, infrastructure or segment contexts activated by commercial products/segment rules.

## Catalog taxonomy

Canonical VendorAI rows use only three commercial classes in `produtos_catalogo`:

- `saas_plan`: CRM Free and Growth.
- `saas_addon`: recurring standalone software products, the +5-day access SKU and function-specific consumption packs.
- `service`: implementation/custom work.

Migration 246 normalizes legacy VendorAI rows that were incorrectly stored as `physical`, `software` or `servico`, while keeping their stable SKUs intact. It also fills `preco_mensalidade` for recurring modules and adopts the public names **Vendor Gestão**, **Vendor Propostas & Catálogo** and **Praça.ai**.

## User policy

Users are unlimited across every Vendor.ai plan and commercial product.

There is no seat-based monetization and no database-level user cap. The commercial model is based on product subscriptions plus Vendor Credits for metered/high-cost usage. Legacy user-limit triggers and plan/profile limits are removed by migration 528.

## Growth Quota V1

Users and normal software operations are unlimited. Only marginal-cost/high-value automated operations are metered.

| Metric | Monthly Growth quota | Vendor Credits/unit |
|---|---:|---:|
| Content generations | 300 | 5 |
| Images | 100 | 10 |
| Videos | 10 | 200 |
| arqdor.ai renders | 30 | 25 |
| Enriched prospects | 1,500 | 2 |
| AI Team automated interactions | 10,000 | 1 |
| AI proposals/quotes | 500 | 5 |
| Intelligence analyses | 1,000 | 2 |
| Content Autopilot articles | 30 | 20 |
| Complete sites | 3 | 100 |
| Landing pages | 10 | 40 |
| Ads campaign kits | 30 | 10 |
| Audio transcription | 600 min | 1/min |
| Processed documents | 500 | 2 |
| Knowledge pages indexed | 2,000 | 1 |
| Media interpretations | 200 | 3 |

Quota V1 is configurable and must be reviewed against observed real cost/margin after sufficient usage data.

Vendor Credit weights are read dynamically from `usage_metrics`; triggers do not hard-code the commercial weight. This allows Super Admin to tune weights without code changes.

## Individual module quotas V1

| Product | Included monthly quantity |
|---|---|
| CRM Free | 30 AI assists |
| Vendor Prospector | 500 enriched prospects |
| Vendor AI Team | 2,500 automated interactions |
| Vendor Content Studio | 100 content generations |
| Vendor Creative Studio | 20 images + 2 videos |
| Vendor Sites & Autopilot | 2 sites + 12 Autopilot articles |
| Vendor Ads | 10 campaign kits |
| Vendor Propostas & Catálogo | 100 AI proposals/quotes |
| Vendor Knowledge AI | 500 indexed pages |
| Vendor Revenue Scout | 250 intelligence analyses |

## Function-specific extra packs V1

Extra capacity is sold in customer-readable units. Internally every pack has a metric, a fixed quantity and its Vendor Credit equivalent in `consumption_pack_definitions`. The purchased quantity is stored in `vendor_credit_transactions.metric_key/quantity_delta`, so a `+20 imagens` purchase cannot silently become generic video/prospect capacity.

Initial pack SKUs are created **inactive and with price pending**. This allows price/margin to be defined after observing real costs without another schema change.

| Commercial key | Customer pack | Metric | Quantity | Initial status |
|---|---|---|---:|---|
| `vendor.pack.content.50` | +50 conteúdos | content | 50 | price pending |
| `vendor.pack.image.20` | +20 imagens | image | 20 | price pending |
| `vendor.pack.video.5` | +5 vídeos | video | 5 | price pending |
| `vendor.pack.prospect.500` | +500 prospects | prospect | 500 | price pending |
| `vendor.pack.agent_interaction.1000` | +1.000 interações IA | agent_interaction | 1,000 | price pending |
| `vendor.pack.render.10` | +10 renders | render | 10 | price pending |
| `vendor.pack.site.1` | +1 site | site | 1 | price pending |
| `vendor.pack.autopilot_article.10` | +10 artigos Autopilot | autopilot_article | 10 | price pending |

A consumption pack is **not** a runtime module entitlement. It only increases the allowance for one metric. Activation is guarded: a pack cannot be enabled while its catalog price is zero. After a positive price is defined, enabling the commercial product synchronizes the resource definition and the catalog `ativo` flag.

`grantConsumptionPack()` is the idempotent runtime entry point for confirmed payments/promotions. It writes the resource-specific quantity and its Vendor Credit equivalent to the wallet using the payment/provider reference as idempotency key. The customer quota snapshot exposes the extra purchased quantity alongside the monthly allowance; enforcement remains disabled for now.

## Metering semantics

A quota is debited only on a useful delivered result.

- New full generation: consumes.
- Manual edit, view, download, crop or simple metadata update: does not consume.
- Failed provider call: technical cost may be recorded, customer quota is not consumed.
- Cost-only provider rows use `billable=false` and never count against customer quotas.
- Duplicate prospect/failure: should not consume a prospect unit.
- Site title/phone edit: does not consume another site.
- Full site regeneration: consumes another site.
- New render: consumes; viewing/downloading does not.

Technical provider cost is recorded separately from customer-visible usage. Stable AI features are attributed to their owning commercial product so Super Admin can calculate cost/margin by product without double-debiting customer quota.

## Revenue expansion inside the product

Upsell must happen in context, not only on a pricing page.

- User tries prospecting -> offer Vendor Prospector.
- User tries centralized WhatsApp/Instagram -> offer Omnichannel.
- User requests autonomous follow-up -> offer AI Team.
- User requests content/media -> offer Content/Creative products.
- User approaches a quota -> offer the matching function-specific pack.
- When monthly module subscriptions approach/exceed Growth, show the Growth comparison automatically.

## System architecture

```text
CATALOG (name, price, media)
        ↓
COMMERCIAL PRODUCT PROFILE
        ↓
SEGMENT APPLICABILITY
        ↓
TENANT ENTITLEMENT
        ↓
TECHNICAL MODULES / SCREENS
        ↓
USAGE METRICS + QUOTAS
        ↓
USAGE LEDGER
        ↓
FUNCTION-SPECIFIC TOP-UP WALLET
        ↓
VENDOR CREDITS + REAL COST + MARGIN
```

Navigation switches are an operational override/diagnostic tool. They must not become the billing source of truth.

## Rollout stages

1. Measurement: migrations 240–251; no quota blocking.
2. Coverage audit: confirm every generator/agent/external API emits a business-unit event.
3. Margin validation: real provider/API costs in USD/BRL by tenant/product/metric.
4. Customer usage UI: human units, remaining quota and matching pack CTA.
5. Super Admin: product/entitlement/quota/cost/pack control instead of raw equal-weight module switches.
6. Pack pricing: approve price/margin and activate only the packs with reliable cost data.
7. Enforcement: activate consumption quotas only after measurement coverage is complete.

## Alternative validation while CI runners are unavailable

The branch is also checked directly against the live Supabase schema without applying the new migrations to production. This preflight verifies every existing table/column referenced by the new migrations.

Corrections made from this validation:
- removed the fixed VendorAI tenant UUID from migration 240 and now resolve the institutional catalog from canonical existing SKUs;
- removed nonexistent `arch_ai_renders.cost_estimate_usd` and `arch_ai_renders.operation_type` references from the render usage trigger;
- aligned the plan migration with the real `plans.is_active` column;
- aligned the TypeScript `ai_feature` enum with live values including `agent_recepcao` and `agent_expansao_conta`;
- quota snapshots now count only successful customer-billable business events, never raw cost-only provider calls;
- canonical VendorAI SKUs were audited against the live catalog before normalization;
- current Start/Growth plan assignments were audited before entitlement backfill and user-limit enforcement;
- migration 251 was preflighted against the live `produtos_catalogo` pricing/status columns without applying DDL to production.

The system remains in `measure_only`; production permissions and consumption quota enforcement are unchanged until migrations and runtime are promoted deliberately.
