---
name: Prospector feature & pgvector
description: Durable rules/decisions for the Prospector feature, contract, and pgvector usage.
---

# Prospector + pgvector

- **Contract-first is mandatory for new prospector endpoints.** Backend Express handlers exist in `prospector.ts`, but the frontend consumes them only via Orval-generated hooks. Any new endpoint must be added to `lib/api-spec/openapi.yaml` first, then regenerated. The handlers' actual status codes must match the spec — e.g. endpoints that call the tenant-ownership guard can return 404, so document it.

- **Migration path for new tables = surgical raw DDL via `pg` against `SUPABASE_DATABASE_URL`**, NOT `drizzle-kit push`.
  **Why:** a full push prompts to *truncate `tenant_domains`* (unique-constraint drift), risking data loss. Apply only the new tables' `CREATE TABLE IF NOT EXISTS` directly. Run the script from inside `lib/db/` so Node ESM resolves the `pg` package.

- **pgvector is enabled in Supabase.** Drizzle exposes `vector("col", { dimensions: 1536 })`. Do not re-run the extension enable. When exposing a vector-bearing row in an OpenAPI response, omit the embedding column from the response schema to avoid client type noise.

- **All AI must route through the existing aiGateway** (`callOpenAI` from `lib/ai-gateway.js`), never the OpenAI SDK directly. A 402 "AI quota exhausted" from these endpoints is the gateway enforcing the tenant budget, not a bug. enrich degrades gracefully (saves Places data, empty AI arrays) when the gateway rejects; generate-message hard-fails 402.

- **Google Places uses the *New* Places API** (`POST places.googleapis.com/v1/places:searchText`, headers `X-Goog-Api-Key` + `X-Goog-FieldMask`) with secret `GOOGLE_PLACES_API_KEY`. The OAuth `GOOGLE_CLIENT_ID/SECRET` do NOT work for Places — a separate API key is required.

- **Prospecção em duas etapas (busca → prospectar).** `POST /prospector/search` {atividade, localidade} faz `searchText` (até 20 resultados, sem IA, sem gravar no banco) e devolve a lista. O usuário escolhe quais empresas prospectar; cada "Prospectar" chama o `enrich` existente (nomeEmpresa + endereco), que enriquece com IA e cria o lead (status 'novo' = já na pipeline). **Não há busca por nome de empresa na UI** — foi substituída.
  **Why:** o usuário pediu busca por atividade comercial+localidade retornando múltiplos negócios, com seleção manual antes de gastar cota de IA.
  **How to apply:** estado de "já prospectado" no frontend é indexado pela POSIÇÃO da linha (não pelo nome) — nomes repetem em franquias/filiais e key por nome marcaria todas as linhas homônimas como prospectadas.

- **Multi-tenant rule for optional `leadId` inputs:** any endpoint accepting a `leadId` and writing it must verify the lead belongs to the resolved tenant before persisting (else cross-tenant linkage). Pattern: select lead `where id = leadId AND tenant_id = tenantId`; 404 if absent.

- **Frontend route convention exception:** the Prospector page lives at `/app/prospector` (user-requested), unlike the rest of the app which uses root-relative paths (`/leads`, `/deals`).

- **Lead scoring is provisional.** `computeScore()` in `prospector.ts` is an isolated placeholder pending the user's "Módulo 3" criteria (never provided). Replace the weights once the real criteria arrive; do not treat current scores as final.

- **CNPJ enrichment via ReceitaWS** (`receitaws.com.br/v1/cnpj/{14 digits}`, no key). Degrades gracefully — enrich proceeds on Places data alone if ReceitaWS fails/empty.

- **Dedup must compare digits-only.** Lead dedup matches on `regexp_replace(telefone,'[^0-9]','','g')` (SQL) OR `documento = cnpjDigits`. Exact-string phone match creates duplicates across formatting variants.

- **CSV export must neutralize formula injection.** Any user-derived field rendered to CSV must prefix values starting with `= + - @ \t \r` with a single quote before quoting, or Excel/Sheets executes them.

- **pgvector similarity in Drizzle = raw `sql` literal, not a bound param.** Build the query vector as a string `[v1,v2,...]` and order with `sql\`${col} <=> ${vecLiteral}::vector\``. Cosine distance operator is `<=>`. Filter `embedding IS NOT NULL` to skip rows without embeddings.

- **Few-shot learning loop:** generate-message embeds the lead context, pulls top-3 prior approvals (action in approved/edited) as style examples, and stores each new draft's embedding so approvals compound. Drafts are stored as `generatedText = JSON {email,whatsapp}`; embedding is of the chosen-channel text. `approvedText` (edited) overrides on read.

- **Prospector automation gate:** tenant gains `prospect_status='automated'` (column added via raw ALTER, default 'learning') once approved+edited approval count >= 50; that transition also inserts an in-app notification once (guard on current status != 'automated' to avoid duplicates).

- **Scheduler step-advance rule:** any cadence job (e.g. orchestrateProspectCampaigns, 15-min cron) must (a) NOT mark a step sent when there is no content/artifact to send — skip and retry next cycle; (b) claim the step atomically with `UPDATE ... WHERE id=? AND dayXSentAt IS NULL RETURNING id` and only perform the side-effect (insert message/agent_task) when the claim returns a row. Prevents double-sends across overlapping runs. There is NO generic email transport — emails are logged as outbound `messages` rows (canal='email', enviadoPor='agente_ia'); only WhatsApp has a real executor (agent_tasks actionType='enviar_whatsapp').
