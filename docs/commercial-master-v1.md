# VendorAI Commercial Master V1

## Canonical commercial model

The commercial source of truth is `vendor_commercial_offers` plus its module mapping, quotas and usage metrics. Existing catalogs remain operational, but SaaS rows link to the canonical offer through `commercial_offer_code`.

### Plans

| Offer | Price | Users | Positioning |
|---|---:|---:|---|
| Vendor CRM Free | R$ 0 | 1 | Full CRM for a solo user; specialized products remain separate |
| Vendor CRM Pro | R$ 49,90/month | 5 | Same complete CRM base for a small team |
| VendorAI Growth | R$ 1.490/month regular | Unlimited | All standard modules applicable to the tenant segment, governed by usage franchises |
| Growth +5 days | R$ 399 | Unlimited during active period | Prepaid access block; 5 free days/month remain a commercial acquisition rule |

Implementation assisted is optional at R$ 1.890 one-time. Custom App is R$ 4.990 one-time.

## Products and current prices

| Code | Product | Monthly price | Included in Growth |
|---|---|---:|---|
| agenda | Vendor Agenda | R$ 19,90 | yes |
| reputation | Vendor Reputation | R$ 79 | yes |
| propostas_catalogo | Vendor Propostas & Catálogo | R$ 99 | yes |
| knowledge_ai | Vendor Knowledge AI | R$ 99 | yes |
| creative_studio | Vendor Creative Studio | R$ 139 | yes |
| jarvis | Vendor JARVIS | R$ 149 | yes |
| automations | Vendor Automations | R$ 149 | yes |
| bi_analytics | Vendor BI & Analytics | R$ 149 | yes |
| omnichannel | Vendor Omnichannel | R$ 199 | yes |
| content_planner | Vendor Content Planner | R$ 199 | yes |
| ads | Vendor Ads | R$ 199 | yes |
| gestao | Vendor Gestão | R$ 299 | yes |
| app_builder | Vendor App Builder | R$ 299 | yes |
| praca_ai | Praça.ai | R$ 299 | yes |
| content_studio | Vendor Content Studio | R$ 399 | yes |
| prospector | Vendor Prospector | R$ 399 | yes |
| ai_team | Vendor AI Team — 10 agentes | R$ 499 | yes |
| revenue_scout | Vendor Revenue Scout | R$ 499 | yes |
| sites_autopilot | Vendor Sites & Autopilot | R$ 499 | yes |
| arqdor_ai | arqdor.ai | configured commercially | yes where applicable |

`Growth included` means software access is included when the product is applicable to the tenant's segment. Implementation, custom development, paid-media spend, transactional third-party charges and excess consumption are not unlimited software entitlements.

## Growth Quota V1

Growth has unlimited users. It does not artificially limit normal CRM/software operations. The following expensive/high-value operations are metered monthly:

| Metric | Monthly included |
|---|---:|
| Content generations | 300 |
| Images | 100 |
| Videos | 10 |
| arqdor renders | 30 |
| Enriched prospects | 1,500 |
| AI-agent interactions | 10,000 |
| AI proposals/budgets | 500 |
| Intelligence analyses | 1,000 |
| Content Autopilot articles | 30 |
| Full sites | 3 |
| Landing pages | 10 |
| Ads campaign kits | 30 |
| Audio transcription | 600 minutes |
| Documents processed | 500 |
| Knowledge AI | 2,000 page-equivalents |
| Media interpretations | 200 |

These limits ship initially as **soft measurement limits** (`hard_limit=false`). We measure real usage and cost before enabling hard enforcement.

## Individual-product franchise V1

| Product | Included monthly |
|---|---|
| CRM Free | 30 CRM AI assists |
| CRM Pro | 100 CRM AI assists |
| Content Studio | 100 contents |
| Creative Studio | 20 images + 2 videos |
| Prospector | 500 enriched prospects |
| AI Team | 2,500 agent interactions |
| Sites & Autopilot | 2 sites + 12 Autopilot articles |
| Ads | 10 campaign kits |
| Propostas & Catálogo | 100 AI proposals/budgets |
| Knowledge AI | 500 page-equivalents |
| Revenue Scout | 250 intelligence analyses |

## Vendor Credits

Vendor Credits are an internal commercial weight, not OpenAI/Anthropic tokens and not a direct BRL conversion.

The customer should primarily see natural units such as `31 / 100 images`, `720 / 1,500 prospects`, `4 / 10 videos`. Internally every successful billable action also has a Vendor Credit weight and real provider/external/infrastructure cost.

Failed provider operations are audited but consume zero Vendor Credits and no customer franchise by default.

## System architecture

`Commercial offer -> technical modules -> feature -> quota -> usage ledger -> cost/margin`

Segments are contextual templates, not equivalent sellable modules. A clinic, salon, construction company or retailer can use the same commercial product with a segment-specific implementation of that product.

## Surfaces that must consume the same master

- Product Catalog
- Internal commercial product library
- Super Admin Products & Monetization
- Checkout/subscriptions
- Tenant access/entitlements
- Customer usage screen
- Contextual upsells
- Public website and pricing
- Billing and margin reports

The `vendor_commercial_catalog` SQL view is the read model intended to feed those surfaces.

## Customer-facing consumption rule

Only useful delivered outcomes consume franchise. Editing an existing result, viewing it, downloading it or a provider failure does not create another billable unit. A complete regeneration or a new useful result does.
