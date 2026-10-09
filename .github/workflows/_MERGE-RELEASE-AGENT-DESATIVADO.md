# merge-release-agent — DESATIVADO em 2026-10-09

Este agente de "Squash merge + Publish" gerou o commit `13be9570`
("release consolidada v1-v7"), que entrou com arquivos CORROMPIDOS
(linhas embaralhadas/duplicadas e `\n` literais), deixando a `main`
sem compilar por dias.

Desativado (renomeado para `.disabled`, o GitHub só executa `.yml`)
até o processo de merge/release ser refeito de forma confiável
(ver pipeline de deploy automático na Contabo — Fase 1).

NÃO reative sem corrigir a causa do embaralhamento de arquivos.
