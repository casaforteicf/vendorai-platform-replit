# MKT-P2-CHANNEL — Playbook de canais (P2.1)

Data: 2026-11-27
Branch: `feat/mkt-channel-playbook` (base `main` @ cda4f6d16)

## Objetivo
Regras objetivas por canal, aplicadas na revisão e expostas pela API.

## Entregue
- **Módulo puro** `@workspace/vendor-brain/channel-playbook`:
  - `channelKeyFor(canal)` e `channelRuleFor(canal)`;
  - `validatePieceForChannel({canal, tipo, mediaCount, hasVideo, destination})`;
  - regras: formatos aceitos, vídeo obrigatório (Reel/TikTok/YouTube), limite de mídias,
    link clicável, destinos permitidos e destino obrigatório no Google;
  - **7 testes**.
- **API**: `GET /marketing/pieces` e `/pieces/:id` devolvem `channelIssues` por peça.
- **Revisão**: painel “Qualidade do material” mostra **“Ajustes necessários para o canal”**
  com os problemas encontrados.

## Validação
- API build **EXIT 0**; frontend build **EXIT 0**.
- Testes: vendor-brain **51/51**; funil **7/7**.

## Pendente (P2.2)
- Enforcement na publicação (bloquear com código de erro em vez de só avisar).
- TikTok Ads / LinkedIn Ads (decisão comercial + conectores).
