# MKT-01 — fallback de imagem de referência na produção de mídia

Atualização: 2026-11-24. Branch: `fix/media-reference-fallback`.
Base: `3dddf6b78`.

## Sintoma

No Plano de Mídia da Krafht (`mediaPlanId=fbe6e68c-...`), a produção
mostrava **“2 material(is) com falha”** na aba Campanhas. O resumo não
mostrava a causa; o detalhe estava em `media_projects.context.executorDetail`.

## Causa (lida do banco de produção)

| Material | Detalhe real |
|---|---|
| Reels 1 (vídeo) | `GOOGLE_CLOUD_PROJECT not set` |
| Vídeo vertical Meta 1 (`meta_ad`) | `Não foi possível carregar a imagem de referência. Verifique se ela está acessível.` |
| tentativas antigas de anúncio | `Defina objetivo, período, orçamento total e medição antes de criar a campanha.` (fluxo antigo; os anúncios atuais já criam com `campaignControl`) |

A imagem de referência do anúncio estava numa pasta privada (R2/Supabase). O
`fetchImageBuffer` tentava baixá-la via HTTP interno sem sessão e recebia 401,
derrubando a produção inteira do anúncio. Além disso, no caminho de edição com
`gpt-image-1`, o `saveB64Image` era chamado com **um** argumento
(`saveB64Image(item.b64_json)`), perdendo `tenantId`/operação e falhando ao
salvar a imagem.

## Correção

- `generateImagesWithReference`: se a referência não puder ser baixada, **cai
  para geração texto→imagem** com o mesmo prompt/descrição, em vez de falhar.
  O criativo é criado e fica para revisão humana; loga apenas o tenant, sem
  vazar URL/token.
- Corrige a chamada `saveB64Image(tenantId, b64, operação, metadata)` no
  caminho de edição.
- `generateVeoVideo`: quando **nenhum** provedor de vídeo está configurado,
  devolve uma mensagem acionável listando o que falta (Google Vertex/Veo:
  `GOOGLE_CLOUD_PROJECT`, `GOOGLE_SERVICE_ACCOUNT_JSON`,
  `VENDORAI_VERTEX_VIDEO_GCS_URI`; ou `REPLICATE_API_TOKEN`).

## O que continua pendente

- **Vídeo não gera** enquanto não houver credencial de provedor no container de
  produção. Não existe hoje `GOOGLE_SERVICE_ACCOUNT_JSON`,
  `VENDORAI_VERTEX_VIDEO_GCS_URI` nem `REPLICATE_API_TOKEN` no ambiente da API;
  só o `GOOGLE_CLOUD_PROJECT` aparece em arquivos de env antigos. Sem isso, o
  Reels continuará falhando com a mensagem de configuração.
- Os dois projetos já marcados como `failed` no banco continuam assim até um
  retry (“Reprocessar falhas”); o retry do anúncio deve passar com o fallback.

## Validação

- `tsc -p artifacts/api-server/tsconfig.json --noEmit`: exit 0.
- `node artifacts/api-server/build.mjs`: exit 0.
- Sem teste automatizado do fallback (depende de fetch/OpenAI); a correção é
  coberta por typecheck/build e será exercitada no retry em produção após o
  deploy.

## Estado

Implementado e validado tecnicamente. **Sem merge/deploy automático.**
Próximo passo: revisar/mergear, aguardar o deploy e usar “Reprocessar falhas”
no plano. Para vídeo, provisionar as credenciais do provedor.
