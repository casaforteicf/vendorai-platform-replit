#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-https://app.appvendorai.com}"
DB_URL="${APP_DATABASE_URL:-${SUPABASE_DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "APP_DATABASE_URL/SUPABASE_DATABASE_URL não configurada." >&2
  exit 2
fi

RUN_KEY="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
QA_NAME="QA TEMP Arqdor ${RUN_KEY}"
QA_EMAIL="qa-arqdor-${RUN_KEY}@vendorai.invalid"
QA_TITLE="QA TEMP Arqdor Handoff ${RUN_KEY}"

concept_id=""
project_id=""
lead_id=""
deal_id=""
tenant_id=""
user_id=""

sql_scalar() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq "$@"
}

cleanup() {
  set +e
  if [[ -n "$tenant_id" && -n "$concept_id" ]]; then
    echo "Limpando dados QA TEMP do run ${RUN_KEY}..."
    psql "$DB_URL" -v ON_ERROR_STOP=1       -v tenant_id="$tenant_id"       -v user_id="$user_id"       -v concept_id="$concept_id"       -v project_id="$project_id"       -v lead_id="$lead_id"       -v deal_id="$deal_id"       -v qa_email="$QA_EMAIL"       -v qa_name="$QA_NAME" <<'SQL'
BEGIN;
DELETE FROM arch_concept_projects
 WHERE id = :'concept_id'
   AND tenant_id = :'tenant_id'
   AND owner_user_id = :'user_id';

DELETE FROM arch_ai_renders
 WHERE tenant_id = :'tenant_id'
   AND project_id = NULLIF(:'project_id','');

DELETE FROM arch_projetos
 WHERE id = NULLIF(:'project_id','')
   AND tenant_id = :'tenant_id'
   AND cliente_email = :'qa_email';

DELETE FROM deals
 WHERE id = NULLIF(:'deal_id','')
   AND tenant_id = :'tenant_id'
   AND lead_id = NULLIF(:'lead_id','')
   AND titulo = ('Projeto residencial — ' || :'qa_name');

DELETE FROM leads
 WHERE id = NULLIF(:'lead_id','')
   AND tenant_id = :'tenant_id'
   AND email = :'qa_email'
   AND source = 'arqdor_concept'
   AND metadata->>'arqdorConceptId' = :'concept_id';
COMMIT;
SQL
  fi
}
trap cleanup EXIT

echo "1/7 Login demo em produção"
login_json="$(curl --retry 2 --retry-delay 2 -fsS   -H 'Content-Type: application/json'   -d '{"email":"demo","password":"demo"}'   "$BASE_URL/api/auth/demo-login")"

token="$(jq -r '.token // empty' <<<"$login_json")"
tenant_id="$(jq -r '.tenant.id // .user.tenantId // empty' <<<"$login_json")"
user_id="$(jq -r '.user.id // empty' <<<"$login_json")"
if [[ -z "$token" || -z "$tenant_id" || -z "$user_id" ]]; then
  echo "Login demo não retornou token/tenant/user válidos." >&2
  exit 3
fi
AUTH="Authorization: Bearer $token"

echo "2/7 Garantir identidade QA única"
preexisting_lead="$(sql_scalar   -v tenant_id="$tenant_id"   -v qa_email="$QA_EMAIL"   -c "select id from leads where tenant_id=:'tenant_id' and email=:'qa_email' limit 1;")"
if [[ -n "$preexisting_lead" ]]; then
  echo "E-mail QA já existe inesperadamente: $preexisting_lead" >&2
  exit 4
fi

echo "3/7 Criar Concept temporário"
concept_payload="$(jq -n   --arg title "$QA_TITLE"   --arg name "$QA_NAME"   --arg email "$QA_EMAIL"   '{
    title:$title,
    currentStep:6,
    lot:{width:12,depth:30},
    configuration:{
      floors:1,
      desiredArea:80,
      typology:"terrea_2q",
      layoutPreferences:{},
      wallFirstFloors:[],
      showDimensions:true,
      customWalls:[],
      customOpenings:[],
      spaceProfiles:[]
    },
    rooms:[
      {id:"qa-sala",kind:"sala",label:"Sala",width:4,depth:4,floor:0,x:1,y:1},
      {id:"qa-quarto",kind:"quarto",label:"Quarto",width:3,depth:3,floor:0,x:5,y:1}
    ],
    openingOverrides:{},
    customerProfile:{
      name:$name,
      email:$email,
      budgetRange:"QA TEMP",
      timeframe:"QA TEMP",
      notes:"Smoke automático de produção; registro deve ser removido ao final."
    },
    facadePreferences:{
      style:"contemporaneo",
      roof:"platibanda",
      primaryMaterial:"pintura",
      accentMaterial:"madeira",
      facadeTone:"claro",
      frameTone:"preto",
      landscaping:"leve"
    },
    conceptRender:{},
    selectedVariant:0
  }')"

create_code="$(curl -sS -o /tmp/concept-create.json -w '%{http_code}'   -X POST   -H "$AUTH"   -H 'Content-Type: application/json'   -d "$concept_payload"   "$BASE_URL/api/arch/concept-projects")"
cat /tmp/concept-create.json
if [[ "$create_code" != "201" ]]; then
  echo "Falha ao criar Concept: HTTP $create_code" >&2
  exit 5
fi
concept_id="$(jq -r '.id // empty' /tmp/concept-create.json)"
if [[ -z "$concept_id" ]]; then
  echo "Concept criado sem id." >&2
  exit 6
fi

echo "4/7 Promover Concept pela primeira vez"
promote1_code="$(curl -sS -o /tmp/promote1.json -w '%{http_code}'   -X POST   -H "$AUTH"   "$BASE_URL/api/arch/concept-projects/$concept_id/promote")"
cat /tmp/promote1.json
if [[ "$promote1_code" != "201" ]]; then
  echo "Primeira promoção deveria retornar 201, recebeu $promote1_code" >&2
  exit 7
fi
already1="$(jq -r '.alreadyPromoted' /tmp/promote1.json)"
project_id="$(jq -r '.project.id // empty' /tmp/promote1.json)"
lead_id="$(jq -r '.leadId // empty' /tmp/promote1.json)"
deal_id="$(jq -r '.dealId // empty' /tmp/promote1.json)"
if [[ "$already1" != "false" || -z "$project_id" ]]; then
  echo "Primeira promoção não criou projeto novo corretamente." >&2
  exit 8
fi

echo "5/7 Repetir promoção para validar idempotência"
promote2_code="$(curl -sS -o /tmp/promote2.json -w '%{http_code}'   -X POST   -H "$AUTH"   "$BASE_URL/api/arch/concept-projects/$concept_id/promote")"
cat /tmp/promote2.json
if [[ "$promote2_code" != "200" ]]; then
  echo "Segunda promoção deveria retornar 200, recebeu $promote2_code" >&2
  exit 9
fi
already2="$(jq -r '.alreadyPromoted' /tmp/promote2.json)"
project2="$(jq -r '.project.id // empty' /tmp/promote2.json)"
if [[ "$already2" != "true" || "$project2" != "$project_id" ]]; then
  echo "Idempotência falhou: project1=$project_id project2=$project2 already2=$already2" >&2
  exit 10
fi

echo "6/7 Reabrir Concept e Projeto"
concept_get_code="$(curl -sS -o /tmp/concept-get.json -w '%{http_code}'   -H "$AUTH"   "$BASE_URL/api/arch/concept-projects/$concept_id")"
project_get_code="$(curl -sS -o /tmp/project-get.json -w '%{http_code}'   -H "$AUTH"   "$BASE_URL/api/arch/projetos/$project_id")"
if [[ "$concept_get_code" != "200" || "$project_get_code" != "200" ]]; then
  echo "Reabertura falhou: concept=$concept_get_code project=$project_get_code" >&2
  exit 11
fi
status="$(jq -r '.status // empty' /tmp/concept-get.json)"
linked_project="$(jq -r '.archProjetoId // empty' /tmp/concept-get.json)"
opened_project="$(jq -r '.projeto.id // .id // empty' /tmp/project-get.json)"
if [[ "$status" != "submitted" || "$linked_project" != "$project_id" || "$opened_project" != "$project_id" ]]; then
  echo "Persistência pós-handoff inválida: status=$status linked=$linked_project opened=$opened_project" >&2
  exit 12
fi

echo "7/7 Verificar banco e preparar limpeza"
db_state="$(sql_scalar   -v tenant_id="$tenant_id"   -v concept_id="$concept_id"   -v project_id="$project_id"   -c "select status || '|' || coalesce(arch_projeto_id,'') from arch_concept_projects where tenant_id=:'tenant_id' and id=:'concept_id' and arch_projeto_id=:'project_id';")"
if [[ "$db_state" != "submitted|$project_id" ]]; then
  echo "Banco não refletiu handoff esperado: $db_state" >&2
  exit 13
fi

echo "ARQDOR_PRODUCTION_HANDOFF_SMOKE=PASS"
echo "concept_id=$concept_id"
echo "project_id=$project_id"
echo "lead_id=$lead_id"
echo "deal_id=$deal_id"
