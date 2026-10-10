# ARQDOR RENDER-01 v0.6 — worker e renderização em blocos
- `render-cpu-preview.worker.ts` executa o diagnóstico fora da thread principal, processando pequenos grupos de linhas.
- `render-worker-client.ts` instancia worker sob demanda, envia trabalho, repassa blocos RGBA e permite encerrar/cancelar trabalho.
- `renderCpuPreview` aceita intervalo vertical de linhas mantendo projeção da câmera da imagem total.
- Teste de equivalência entre a imagem inteira e blocos independentes.
- Ainda protótipo: a BVH é reconstruída a cada bloco; pipeline não é incremental por amostras, não é GI/path tracing e não é conectado à interface de produção.
- Sem persistência, sem upload, sem novos serviços; worker só nasce quando explicitamente chamado.
- Testes, typecheck e build ainda não foram executados. Revisar memória/performance e cancelar jobs concorrentes antes de habilitar para usuários.
