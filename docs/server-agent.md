# Vendi Server / Terminal Agent

Capacidade operacional do Vendi para executar comandos em um servidor autorizado por SSH.

## Segurança

- acesso restrito a Superadmin;
- chave SSH permanece somente no backend;
- comandos de escrita exigem aprovação explícita por execução;
- comandos destrutivos críticos são bloqueados;
- saída limitada para evitar vazamento/acúmulo excessivo;
- todas as execuções são registradas em `agent_actions_log`.

## Variáveis

- `SERVER_AGENT_HOST`
- `SERVER_AGENT_PORT` (padrão 22)
- `SERVER_AGENT_USER`
- `SERVER_AGENT_PRIVATE_KEY`: PEM ou base64 do PEM
- `SERVER_AGENT_PRIVATE_KEY_PATH`: alternativa ao valor inline

## Endpoints

- `GET /server-agent/status`
- `POST /server-agent/execute`

Exemplo de leitura:

```json
{
  "command": "cd /home/vendorai/vendorai-platform-replit && git status --short",
  "mode": "read"
}
```

Exemplo de escrita:

```json
{
  "command": "cd /home/vendorai/vendorai-platform-replit && sudo -n docker ps",
  "mode": "write",
  "approved": true
}
```
