# ARQ-PARAM-30 — Integridade do catálogo e escopo da sincronização

Versão: 2026.10.12.30. Atualizado em 2026-10-12 (BRT).
Branch: feat/arqdor-direct-design-workspace-20261009. PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423.
Commit de código: 04e60dfb858a220183e353465778026da7bb1f12.

## Objetivo e entrega
Continuidade autorizada da consulta de preços e integração com orçamento. A consulta rejeita IDs duplicados de produtos, evitando seleção dependente da ordem. Catálogo indexado por Map; sincronização usa Set para localizar itens existentes e filtra inserções/atualizações pelo prefixo do conceito. Preserva itens manuais e de outros conceitos. Impacto restrito aos helpers existentes; sem alteração de schema, rota ou contrato.

Arquivos: artifacts/api-server/src/lib/arch-opening-budget.ts e arch-opening-budget.test.ts; este registro.
Dependência: ARQ-PARAM-26 a 29.

## Evidência local
Vitest: 18 arquivos e 94 testes passaram, incluindo dois casos novos (catálogo ambíguo em ambas as ordens e itens desejados de outro conceito).
Comando: /workspace/scratch/b8d85e303c4b/check/node_modules/.bin/vitest run --globals --environment jsdom artifacts/frontend/src/pages/arch/*.test.ts artifacts/frontend/src/pages/arch/*.test.tsx artifacts/api-server/src/lib/arch-opening-budget.test.ts
Typecheck estrito do helper passou: tsc --noEmit --strict --skipLibCheck --target es2022 --moduleResolution bundler --module esnext artifacts/api-server/src/lib/arch-opening-budget.ts.
AGENTS.md e registro operacional VENDI-03-v2026.10.09-contabo-operator.md consultados neste lote.

## Estado e pendências
Implementado com checks locais; validação técnica completa e homologação pendentes. Sem build completo, teste HTTP/banco real, E2E ou validação Contabo. Homologação/publicação adiadas pelo solicitante nesta conversa; nenhum merge/deploy executado. Responsável pelo próximo passo técnico: desenvolvimento, para testes API/banco em ambiente isolado quando disponível. Orçamento completo de outros elementos e integração comercial ampliada continuam pendentes. Não considerar todo o produto concluído.
