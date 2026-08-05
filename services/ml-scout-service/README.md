# ML Scout Service

Microserviço Python separado do backend principal (Node/TS) do
Vendor.ai — só existe porque LightGBM roda em Python, não em Node.

## O que faz

- `GET /status` — quantos exemplos rotulados a feature store
  (`ml_feature_snapshots`) já acumulou, e se já dá pra treinar
- `POST /train` — treina um modelo novo. **Recusa treinar** (HTTP 422)
  se não tiver pelo menos 100 exemplos rotulados no total e 20 por
  classe (ganho/perdido) — ver `MIN_EXAMPLES_TO_TRAIN` em `db.py`
- `POST /predict` — dado um conjunto de features, devolve a
  probabilidade do modelo ativo. Se não existir modelo treinado ainda,
  devolve `{"hasModel": false, "probability": null}` — nunca inventa
  número

## Por que não treinou nada ainda

Hoje (04/08/2026), `ml_feature_snapshots` está zerada — a feature store
só foi criada essa semana. Rodar `/train` agora devolveria 422. Isso é
o comportamento correto, não um bug — só treina quando tiver dado real
de verdade, nunca com exemplo simulado.

## Deploy

1. Criar um serviço novo no Railway (projeto `responsible-flow`,
   mesmo onde está o backend principal), apontando pra esse diretório
   (`services/ml-scout-service`)
2. Variáveis de ambiente necessárias:
   - `DATABASE_URL` — mesma connection string do Postgres/Supabase que
     o backend Node já usa
   - `ML_SERVICE_INTERNAL_KEY` — uma chave qualquer (gerar uma nova),
     compartilhada com o backend Node pra autenticar as chamadas entre
     os dois serviços
3. Railway detecta `railway.json` automaticamente (build Nixpacks,
   comando de start já configurado)

## Quando ativar de verdade

Assim que `GET /status` mostrar `prontoParaTreinar: true` (acontece
sozinho conforme os tenants forem operando — vendas fechando, negócios
sendo ganhos/perdidos), aí sim vale chamar `POST /train` e conectar o
resultado nas regras do Revenue Scout como mais um sinal, não como
substituto das regras que já existem.
