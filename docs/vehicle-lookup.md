# Vehicle Lookup / Busca de veículos

## Arquitetura e fluxo

`POST /api/vehicles/lookup` é uma rota autenticada e limitada por tenant. A entrada única é normalizada, classificada como placa ou chassi e validada. O serviço consulta `vehicle_lookup_cache`; em um miss chama o provider configurado, normaliza sem completar campos desconhecidos, persiste em `vehicles`, grava histórico mascarado e atualiza o cache.

Providers implementam `VehicleLookupProvider`. `mock` permite desenvolvimento sem credenciais. `senatran` mantém o contrato externo isolado em `SenatranVehicleProvider`. O frontend nunca recebe `provider_data`, certificados ou tokens.

## Endpoint

```http
POST /api/vehicles/lookup
Authorization: Bearer <jwt>
Content-Type: application/json

{"query":"ABC1D23"}
```

Retorna `success`, `searchType`, `vehicle`, `cacheHit`, `confidenceReasons` e `possibleVersions`. Não encontrado retorna `success: false` e `errorCode: NOT_FOUND`.

## Configuração

- `VEHICLE_LOOKUP_PROVIDER`: `mock` ou `senatran`.
- `VEHICLE_LOOKUP_CACHE_TTL`: validade em segundos (padrão 86400).
- `VEHICLE_LOOKUP_RATE_LIMIT`: consultas/minuto (padrão 20).
- `VEHICLE_LOOKUP_TIMEOUT_MS`: timeout externo (padrão 8000).
- `VEHICLE_LOOKUP_SENATRAN_BASE_URL` e `VEHICLE_LOOKUP_SENATRAN_TOKEN`.
- `VEHICLE_LOOKUP_SENATRAN_CERT_PATH` e `VEHICLE_LOOKUP_SENATRAN_CERT_PASSPHRASE`: reservadas para o transporte mTLS exigido pelo contrato SERPRO.

O contrato final e o transporte do certificado dependem do credenciamento SENATRAN/SERPRO. Não há scraping nem tentativa de contornar autenticação.

## Cache, privacidade e segurança

As chaves são SHA-256 com escopo do tenant. O histórico guarda apenas a consulta mascarada. Dados do proprietário não são solicitados nem persistidos. Logs contêm código de erro e tenant, nunca consulta completa ou credenciais. O estoque impede duplicação por placa/chassi dentro do tenant.

## Mock

Fixtures disponíveis: `ABC1D23`, `ABC1234` e chassi `9BWZZZ377VT004251`. O chassi demonstra retorno ambíguo para seleção humana de versão.

## Testes

`pnpm --filter @workspace/api-server test -- vehicle-lookup.unit.test.ts` cobre placas antiga/Mercosul, hífen, espaço, lowercase, chassi, inválidos, aliases, nulos e ambiguidade. Cache e isolamento também são garantidos pelas chaves e constraints com `tenant_id`; testes de integração dependem de PostgreSQL de teste.
