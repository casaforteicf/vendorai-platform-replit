# Visitor Intelligence smoke test

1. Login em um tenant e abrir duas rotas diferentes do app.
2. Confirmar ingestão de `session_start`, `screen_view` e `heartbeat` no tenant correto.
3. Confirmar que nenhum IP bruto é persistido.
4. Confirmar que cidade/estado/país aparecem apenas quando headers confiáveis do edge estão presentes.
5. Abrir painel Visitor Intelligence e validar `onlineNow`, página atual, origem, dispositivo e jornada.
6. Trocar de rota no SPA e validar novo `screen_view` em até 30s.
7. Deixar aba oculta e confirmar que heartbeat para de ser emitido.
8. Reabrir a aba e confirmar retorno da presença.
9. Validar isolamento entre dois tenants.
10. Confirmar que evento de telemetria nunca bloqueia navegação nem gera erro visível ao usuário.
