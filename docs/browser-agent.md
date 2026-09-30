# Browser Agent — Vendor.ai

Fundação do agente navegador do Vendor.ai, inspirada em web agents como TinyFish, mas desacoplada de fornecedor.

Configuração:
- BROWSER_CDP_URL: endpoint WebSocket/CDP do Chromium remoto.
- BROWSER_ALLOWED_HOSTS: allowlist opcional, separada por vírgulas.

Endpoints:
- GET /browser-agent/status
- POST /browser-agent/run

O runtime usa o AI Gateway existente, bloqueia localhost/redes privadas, registra auditoria em agent_actions_log e exige aprovação explícita para ações potencialmente sensíveis.

Próximas camadas previstas:
- sessões persistentes por tenant;
- vault de credenciais;
- streaming de tela para modo assistido;
- fila para missões longas;
- adapters TinyFish/Browserbase/CDP próprio.
