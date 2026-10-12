# ARQDOR — LOTE 13 — ESPECIFICACAO MESTRE V3.2

Status: especificacao funcional. **Nao significa funcionalidade implementada.**
Branch: feat/arqdor-lote13-furniture-core-20261010 — PR #3450.
Politica: nenhuma alteracao de producao, merge ou deploy implicita. CNC e integracao CAM somente em fase posterior.

## Objetivo
Editor universal para um mesmo ambiente com planejados, sob medida, moveis soltos, eletros, metais, bambu, ripados, pedras naturais, Silestone, Dekton, vidros, espelhos e acabamentos. Gerar documentacao diferenciada por oficio e integrar os motores existentes de cotacao, compras, CRM, execucao e assistencia.

## Principios de arquitetura
- Fonte de verdade: projeto versionado com identidade imutavel por objeto, peca, componente e revisao.
- Projeto > ambiente > objeto > conjunto > componente > peca/material ou referencia de produto comercial.
- Geometria (mm e sistema cartesiano definido), representacao visual, produto comercial e composicao fisica sao entidades distintas.
- Objetos podem ser fabricaveis, comerciais ou hibridos.
- Faces possuem identificadores; pintura/textura visual nao se confunde com camada fisica consumivel.
- Dados multi-tenant com RBAC, trilha de auditoria e acesso a arquivos por permissao.
- IA sugere; calculos dimensionais e de quantitativos sao deterministas e verificaveis.
- Publicacao de modelos privados para biblioteca compartilhada exige direitos e autorizacao.
- Liberacao para fabricacao depende de validacao tecnica, medidas de obra, documentos e aprovacao.
- Importacao nunca inventa precisao: fontes e grau de confianca acompanham geometrias derivadas.

## Telas e navegacao
1. Inicio: projetos, revisoes e modelos favoritos.
2. Wizard: ambiente existente, ambiente vazio, projeto importado, modelo ou IA.
3. Studio: arvore do projeto a esquerda; cena 2D/3D ao centro; propriedades e catalogos a direita; historico e alertas.
4. Biblioteca: universal / tenant / usuario / fabricantes / parceiros, filtros por tipo/ambiente/SKU/material.
5. Oficina tecnica: pecas, operacoes, desenhos, etiquetas, listas e corte.
6. Central de cotacoes: fornecedores elegiveis, documentos RFQ, propostas, comparacao, pedidos.
7. Execucao: lotes parciais, checklists, instalacao, aceite e assistencia.

## Fluxo extremo-a-extremo
Levantamento/importacao > selecao de ambiente > modelagem ou composicao > catalogos e materiais > validacao de interferencia > revisao congelada > geracao de BOM/desenhos/etiquetas/corte > RFQ e orcamento > aprovacao > compra/fabricacao em lotes > conferencia/instalacao > aceite > assistencia.

## Sub-lotes (escopo detalhado)
### 13.01 — Fundacao multi-tenant
**Requisito:** Projeto -> ambiente -> objeto -> conjunto -> componente -> peca -> material/produto; identidade estavel; permissoes.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.02 — Editor 2D/3D
**Requisito:** Selecao, snap, alinhamento, transformacoes precisas, orbit/pan/zoom, desfazer/refazer.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.03 — Importacao e referencias
**Requisito:** Importar plantas/modelos, conservar origem, detectar escala, reconstruir parametrico com confianca.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.04 — Biblioteca universal
**Requisito:** Modelos por tipo/ambiente/uso, revisoes, instanciacao sem modificar original.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.05 — Catalogo fabricantes
**Requisito:** SKU, variantes, dimensoes, arquivo 3D, instrucoes, restricoes, vigencia.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.06 — Modulos planejados
**Requisito:** Configuracao de familias parametrizadas, vãos, portas, gavetas, regras.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.07 — Parametria
**Requisito:** Dependencias dimensionais, formulas, limites, recalculo deterministico.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.08 — Materiais
**Requisito:** Fabricante/linha/SKU/espessura/acabamento/textura/preco, equivalencias autorizadas.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.09 — Pecas
**Requisito:** IDs por peca e unidade, ambiente, movel, grupo, medidas, materia-prima.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.10 — Desenhos tecnicos
**Requisito:** Vistas, cortes, cotas e explodidos vinculados a revisao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.11 — Quantitativos
**Requisito:** BOM por material, espessura, SKU, unidade, ambiente, objeto e fornecedor.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.12 — Orcamento
**Requisito:** Composicao custos materiais, operacoes, perdas, transporte, margem e tributos.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.13 — Integracao CRM
**Requisito:** Projeto e itens ligados a cliente, negocio, proposta e versoes.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.14 — Corte chapas
**Requisito:** Nesting sujeito a veio, kerf, margem, defeitos e estoque.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.15 — Operacoes manufatura
**Requisito:** Furacoes/rasgos/rebaixos de acordo com ferragem e sistema construtivo.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.16 — Exportacoes
**Requisito:** PDF, CSV/XLSX, formatos tecnicos permitidos, metadados revisao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.17 — CNC futuro
**Requisito:** Camada de adaptadores; nao libera codigo maquina sem validacao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.18 — Etiquetas
**Requisito:** Codigo por unidade fisica, QR seguro, revisao e rastreio.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.19 — Estoque e compras
**Requisito:** Reservas, unidades, substituicao aprovada, recebimento e saldo.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.20 — Instalacao
**Requisito:** Lotes parciais, checklists, aceite digital e assistencia.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.21 — IA assistente
**Requisito:** Sugere composicao e alternativas; nao substitui calculo deterministico.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.22 — Versionamento
**Requisito:** Snapshots, diff, aprovacao, historico e rollback de projeto.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.23 — Curvas
**Requisito:** Arcos/splines, limites e transformacao em componentes fabricaveis.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.24 — Superficies livres
**Requisito:** Contornos, faces e operacoes de edicao parametrica.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.25 — Perfis
**Requisito:** Extrusoes, secoes, trajetorias e comprimentos.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.26 — Costelas
**Requisito:** Estruturas por seccionamento para formas organicamente compostas.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.27 — Laminacao
**Requisito:** Camadas, adesivos, raios minimos e sentido de fibras.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.28 — Estruturas especiais
**Requisito:** Metal/madeira/compostos, suportes, conectores.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.29 — Divisao transportavel
**Requisito:** Particionamento de objetos grandes e juntas de montagem.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.30 — Planificacao
**Requisito:** Desenvolvimento de superficies suportadas e alertas de nao planificaveis.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.31 — Multisselecao
**Requisito:** Edicao em lote so nos itens selecionados; undo.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.32 — Materiais por peca
**Requisito:** Mudanca isolada ou por conjunto com precedencias.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.33 — Fitas por borda
**Requisito:** Frontal/traseira/direita/esquerda, codigo, espessura, cor.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.34 — Chapas e espessuras
**Requisito:** Catalogo de medidas comerciais, espessuras e estoque.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.35 — Ferragens
**Requisito:** Biblioteca de componentes com geometrias e regras de instalacao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.36 — Furacao manual
**Requisito:** Edicao, coordenadas, profundidade, face, tolerancias e auditoria.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.37 — Caderno tecnico
**Requisito:** Documentacao indexada projeto/ambiente/movel/conjunto/peca.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.38 — Wizard de projeto
**Requisito:** Iniciar por ambiente, referencia, biblioteca, importacao ou IA.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.39 — Biblioteca inteligente
**Requisito:** Busca por texto/filtros, variantes, favoritos, classificacao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.40 — Drag and drop
**Requisito:** Posicionamento 2D/3D, snap, aviso de colisoes.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.41 — Produtividade
**Requisito:** Duplicar, espelhar, array, alinhar, distribuir e propriedades em lote.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.42 — Criacao por IA
**Requisito:** Sugestoes explicaveis e editaveis com confirmacao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.43 — Reuso de importacao
**Requisito:** Extrair candidatos a modelos, publicar so com autorizacao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.44 — Permissoes bibliotecas
**Requisito:** Universal, privada, pessoal e parceiros; direitos/licencas.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.45 — Componentes universais
**Requisito:** Painel, linear, solido, item adquirido e misto.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.46 — Processos diversos
**Requisito:** Serralheria, tapeçaria, madeira, vidro, pedra com motores especializados.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.47 — Moveis soltos
**Requisito:** Representacao comercial, geometria, variantes, SKU sem fabricar.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.48 — Itens parceiros no projeto
**Requisito:** Referencias vinculadas a ambiente, conjunto e dependencias tecnicas.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.49 — Cotacoes integradas
**Requisito:** Motor Arqdor/Vendor existente; RFQ, comparativo, aprovacao, pedidos.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.50 — Composicao de ambientes
**Requisito:** Multiplas especialidades em uma unica cena e orcamento.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.51 — Pedras e sinterizados
**Requisito:** Familias naturais, quartzo, Silestone, Dekton, SKU e restricoes.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.52 — Vidros e espelhos
**Requisito:** Catalogo, espessuras, lapidacao, pelicula, fixacao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.53 — Tampos e bancadas
**Requisito:** Desenho de contorno, frontao, rodabanca, painel e cubas.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.54 — Beneficiamentos
**Requisito:** Emendas, veios, paginação, bordas, furos, recortes e tolerancias.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.55 — Detalhamento especialidades
**Requisito:** Pranchas e memoriais marmoraria/vidracaria.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.56 — Quantitativos especiais
**Requisito:** Area, perimetro, comprimento, chapa e perda por processo.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.57 — Dependencias de equipamentos
**Requisito:** Compatibilizar vao, ventilacao, recortes e instalacoes.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.58 — Fornecedores especializados
**Requisito:** Documentos RFQ, medicao final, proposta e execucao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.59 — Geometria universal
**Requisito:** Primitivas, esboco 2D, curvas, solidos e extrusao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.60 — Subobjetos
**Requisito:** Editar vertices, arestas e faces com selecao clara.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.61 — Booleanas
**Requisito:** Uniao, subtracao, intersecao, furos, rasgos, pockets.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.62 — Acabamentos por face
**Requisito:** Face IDs estaveis e mapeamento UV; separar visual/fisico.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.63 — Paineis decorativos
**Requisito:** Ripado, bambu, acustico e multilaminado parametricos.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.64 — Serralheria catalogo
**Requisito:** Perfis metalicos, tubos, chapas, acabamentos e ferragens.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.65 — Estruturas mistas
**Requisito:** Solda/parafuso/encaixe, submontagens, documentacao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.66 — Quantitativos por oficio
**Requisito:** Perfis lineares, metais peso/area, tecidos, chapas, pedras.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.67 — Compatibilizacao multi-fornecedor
**Requisito:** Associacao de dependencias, entregas e interfaces.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.68 — Levantamento em obra
**Requisito:** Medidas as-built, fotos, tolerancias, georreferencia local.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.69 — Interferencias
**Requisito:** Colisao, abertura, folgas, envelope manutencao, orientacoes.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.70 — Sistemas construtivos
**Requisito:** Regras versionadas por tenant e fabricante; defaults explicitos.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.71 — Reconstrucao importada
**Requisito:** Estimativa de escala/geometria com nivel de confianca.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.72 — Materiais multicamada
**Requisito:** Substrato, adesivo, revestimento, espessura, custo, peso.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.73 — Detalhes reutilizaveis
**Requisito:** Juntas, fixacoes e encontros parametrizados versionados.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.74 — Impacto de revisoes
**Requisito:** Grafo dependencias, diffs e obsolescencia de documentos/pedidos.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.75 — Qualidade producao
**Requisito:** Checklists, rastreio, nao-conformidades, retrabalho.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.76 — Sobras
**Requisito:** Estoque de retalhos, elegibilidade e reserva.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

### 13.77 — Colaboracao
**Requisito:** Permissoes por especialidade, comentarios, RFI e aceite por revisao.
**Aceite:** criar, editar e consultar conforme regra, preservar referencias ao projeto/tenant/revisao, validar entradas e incluir testes unitarios e ao menos um fluxo integrado pertinente antes de marcar concluido.

## Contratos de dados e eventos
- ProjectRevision {tenantId,projectId,revisionId,status,createdAt,authorId,parentRevisionId}
- SceneObject {id,tenantId,projectId,roomId,kind,source,geometryRef,transform,assemblyId?,revisionId}
- Component {id,objectId,parentComponentId?,classification,materialAssemblyId?,vendorProductId?,quantity}
- Part {id,componentId,revisionId,geometryRef,operations[],edgeAssignments[],manufacturingRoute}
- MaterialAssembly {id,layers[],faceAssignments[],coreMaterialId?,finishIds[]}
- CatalogProduct {manufacturerId,sku,variantId,technicalConstraints,model3dRef?,availableUnits}
- DependencyEdge {sourceEntityId,targetEntityId,reason,impactType}
- TechnicalArtifact {id,sourceRevisionId,type,checksum,status}
- QuoteLine {itemId,supplierId,productSku?,quantity,unit,revisionId,terms,attachments}
- Events: scene.object.changed, component.material.changed, supplier.product.changed, revision.frozen, technical.artifact.invalidated, quote.received, execution.lot.created.

## Regras de recalculo e revisoes
1. Editar gera evento e invalida artefatos afetados no grafo de dependencias.
2. Recalcular somente subarvore afetada, mantendo objetos nao alterados.
3. Se alteracao dimensional repercutir em produto de terceiro, sinalizar compatibilizacao.
4. Revisionar apos validacao; documentos finais registram ID e checksum da revisao.
5. Alteracao posterior nao reescreve pedidos, documentos ou lotes anteriormente aprovados.

## Seguranca e validacao
- Separacao tenant e permissao em toda leitura/escrita/arquivo/QR.
- Validar geometria fechada, espessuras positivas, dimensoes, unidades, colisao e limites de operacoes por processo.
- Nao afirmar que operacao e segura para maquina com dados incompletos.
- Mudanca em catalogo de fornecedor nao modifica versoes aprovadas do projeto sem aceite.
- Orquestracao de cotacao reaproveita servicos existentes, evitando logica duplicada.

## Entregas por ondas
Onda 1: modelo/persistencia, editor basico, biblioteca, pecas, materiais por face, geometria paramétrica, revisoes.
Onda 2: detalhamento por oficio, operacoes, etiquetas, quantitativos, planos de corte, validacoes.
Onda 3: produtos terceiros, RFQ integrado, orcamentos, compras, entregas parciais.
Onda 4: superficies e geometrias complexas, multi-oficio, auditoria de impacto, colaboracao e instalacao.
Onda futura: CNC/CAM e pos-processadores, somente apos homologacao dos dados industriais.

## Criterios globais de pronto
- Ambiente misto inclui movel planejado, movel livre, eletro, bancada de pedra, espelho, estrutura metalica, painel ripado e componente personalizado.
- Pode modificar uma face e uma unica peca sem alterar similares.
- Pode desenhar recorte/furo/rasgo geometricamente e visualizar efeito/operacao.
- Pode identificar e cotar diferentes fornecedores por especialidade, mantendo revisao e vinculo ao item.
- Relatorios sao reprodutiveis e apontam pendencias em vez de certificar fabricacao indevidamente.
- Testes de isolamento, calculo, unidade, revisao, grafo de dependencias e integracao passam.

## Estado de implementacao ao registrar este documento
Ja existem no PR #3450 seis arquivos do nucleo inicial de chapas, identificacao, furacao declarada, etiquetas estruturadas e caderno tecnico preliminar, incluindo testes adicionados mas nao executados. Este documento e planejamento adicional, nao entrega do editor nem dos 77 sublotes.


## ADENDO V3.3 — IMPORTACAO UNIVERSAL — SUBLOTES 13.78 A 13.84
Escopo proposto: 84 sublotes. O adendo amplia a especificacao, nao certifica conversores implementados.

### 13.78 — Central de Importacao e Diagnostico
Receber arquivos com verificacao de tamanho, extensao, MIME, assinatura de bytes, antivirus, controle de tenant e armazenamento privado; diagnosticar tipo, unidade, eixo, escala, camadas e confianca. Nunca marcar como fabricavel sem engenharia validada.

### 13.79 — SketchUp, DWG e DXF
SKP por SDK/plugin/export autorizado; DWG por conversor autorizado; DXF por parser verificado. Preservar componentes, layers e cotas disponiveis e vincular IDs de origem.

### 13.80 — IFC, Revit e familias BIM
IFC por adaptador BIM com propriedades e hierarquias; RVT/RFA por integracao licita, plugin ou export IFC. Nunca prometer leitura nativa sem validar licencia, versao e SDK.

### 13.81 — Promob
Descobrir formatos reais por versao e possiveis APIs/exportacoes oficiais. Quando nao houver compatibilidade nativa, guiar para intercambio suportado; registrar perda de semantica e bloquear engenharia automatica insegura.

### 13.82 — Formatos 3D e CAD industrial
GLB, glTF, OBJ, FBX, STL, 3DM, STEP, IGES; separar malha visual, B-Rep, curvas, unidade e propriedades; armazenar geometria bruta e transformacoes, sem presumir parametria.

### 13.83 — Reconstrucao parametrica
Identificar ambientes, paredes, objetos, conjuntos e possiveis pecas; mapear material original e componente; criar entidades somente com regras geometricas verificaveis e grau de confianca; revisao humana em ambiguidades.

### 13.84 — Detalhamento e Biblioteca
Gerar modelos reutilizaveis na biblioteca autorizada, preservar direitos e origem; vincular estrutura de pecas quando comprovada; detalhamento e corte apenas apos revisao tecnica e validacao de espessura, cotas, ferragens e materiais.

### Contrato de implementacao e criterios de aceite
- Registro de formatos centralizado no modulo shared/universal-import-contract.ts.
- O diagnostico inicial reconhece extensao mas NAO extrai geometria, NAO valida MIME/bytes, NAO cria modelo e NAO declara producao pronta.
- Pipeline futuro: preflight seguro -> adaptador sandboxed -> normalizacao/unidades -> interpretacao semantica -> reconstrução -> validacao -> versao -> biblioteca.
- Guardar sourceFileId, sourceHash, adapterVersion, coordinateSystem, precision, confidence, warnings, licensing e allowedUsage.
- Testes cobrem extensoes, aliases, nomes desconhecidos e sinalizacao obrigatoria de conversores proprietarios; testes de parsing ficam para adaptadores reais.
- Importacoes privadas nao se tornam publicas por padrao.
