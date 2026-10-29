# Observações operacionais iniciais — 24/10/2026

**Origem:** consultas de somente leitura realizadas pelos conectores Contabo, GitHub, Browser Agent e Cloudflare durante a auditoria. Não equivale a testes completos de todos os sistemas.

- API produção: endpoint de saúde respondeu `{"status":"ok"}`.
- API homologação: endpoint de saúde respondeu `{"status":"ok"}`.
- Browser Agent: `configured=true`, `vendiAutonomyEnabled=true`, runtime CDP; isso **não** prova missão concluída.
- Cloudflare: `401 Invalid API Token` na consulta de status da conexão; não modificar nem expor segredo em Issues.
- GitHub: última main conferida `c713d1cc3852c7164bda58006df549d3715ec45a`.
- Execuções recentes de VendorAI Stability Gate e Frontend PR Check apresentaram falhas; investigar **logs dos jobs**, não presumir defeito funcional único.
- Contabo (consulta anterior): 16 containers em execução; uso de disco ~83%, 80/96GB; existem imagens reclamáveis reportadas pelo Docker, porém preservar rollback, volumes e bancos.
- Produção/homologação com APIs ativas: healthcheck isolado não garante integridade de jornadas, isolamento por tenant ou execução das migrations.

## Bloqueadores de publicação autônoma
1. Diagnosticar e recuperar gates de CI.
2. Corrigir/renovar acesso Cloudflare com mecanismo seguro, sem colar tokens em arquivos do GitHub.
3. Inventariar operadores e ambientes, garantindo destino correto.
4. Rodar piloto controlado: tarefa pequena → PR → CI → homologação → evidências → publicação autorizada → saúde/rollback.

## Segurança operacional
Não apagar imagens/volumes sem análise. Não aplicar migration cega. Não alternar credenciais de produção sem checklist e rollback. Não declarar automaticamente concluídos itens em discussão.
