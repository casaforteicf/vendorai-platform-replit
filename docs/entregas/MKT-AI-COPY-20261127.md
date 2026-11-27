# MKT-AI-COPY — Copy gerada pela IA na revisão

Data: 2026-11-27
Branch: `feat/mkt-ai-copy-button` (base `main` @ 1f26fe1f2)

## Objetivo
Garantir que a revisão sempre tenha **headline, texto de apoio e CTA escritos pela IA**
— não o enunciado do planejamento.

## Entregue
### Backend
- `POST /api/tenants/:tenantId/content-calendar/:id/ai-copy`
  - usa o contexto da campanha/canal/tema + `callOpenAI` (`content_generator`);
  - prompt exige JSON `{headline, supportingText, cta}` com limites (70/140/60);
  - devolve 502 se a IA não completar e 503 em falha do provedor;
  - registra uso no gateway (custo rastreado por tenant).

### Frontend
- Botão **“Gerar texto com IA”** em Ajustes rápidos (ao lado de Redefinir).
- Preenche headline/texto/CTA; usuário revisa e clica em “Salvar ajustes”.
- Estado de carregamento e toast de erro.

## Validação
- API build: `node build.mjs` **EXIT 0**.
- Frontend build: **EXIT 0**.
- Testes do funil: **7/7**.

## Observação
O vídeo de fotos continua sem texto queimado (o overlay é da prévia); a copy agora pode ser
aplicada na peça e usada na publicação."""
