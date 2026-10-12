# Onda 03 — GLB/Blender · v2026.10.10-wave03.1

PR #3422, requisito ARQ-27 e referências ARQ-07/08/09/25/31 e REN. SHA original: aa0a589ddd61938b538c62edae1ead4e7c63fb28.

Execução Python original: 70 testes, 7 NameError por imports ausentes e 1 falha de fixture. Corrigida importação de seis funções já existentes (sem alterar implementação). Fixture de prioridade tinha dois candidatos em conflito porque ambos omitiam dimensões; candidato não conflitante agora tem dimensões calibradas. 70 testes Python passaram após correção.

12 testes Node do ModelFileStore passaram com Node 24 --experimental-transform-types: isolamento tenant/projeto, integridade, restart, symlinks, calibração imutável e settings. Testes executados em arquivos do SHA original, isolados, sem banco real ou Blender/GPU.

Não houve execução de bpy, GPU, Flask worker, conversor OBJ/FBX real, build completo backend/frontend, migrations, homologação ou publicação. Não declarar esses fluxos homologados. Código de runtime permanece inalterado por esta correção de testes. Total transversal da execução Onda 03: 243 testes focados aprovados, nenhum build completo certificado.
