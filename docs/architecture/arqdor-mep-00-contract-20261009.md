# Arqdor — MEP-00: contrato da infraestrutura integrada ao BIM
Status: proposta técnica para implementação; **não implementado**. Issue mãe: #3424. Data: 2026-10-09.

## Diagnóstico das estruturas existentes
- `lib/db/src/schema/arqdor_workspace_projects.ts`: projetos persistem `tenantId`, `id` e `contextBlob`; projeto é chave composta (tenant, project).
- `lib/db/src/schema/arqdor_engineering.ts`: `arqdor_engineering_systems` hoje descreve linhas/material de sistemas de esquadrias; NÃO reutilizar como entidades de elétrica/hidráulica. Evitar colisão semântica.
- O módulo MEP deve ler identidade, elementos e transformações da arquitetura central. Até existir contrato estável do BIM, usar IDs externos validados, sem assumir geometria livre no servidor.

## Modelo recomendado (proposta)
Banco relacional Drizzle/Postgres, nomes separados com prefixo `arqdor_mep_`; escopo tenant obrigatório em todas as linhas:
- `arqdor_mep_systems`: id, tenant_id, project_id, discipline, name, status, config, revision, timestamps.
- `arqdor_mep_networks`: id, tenant_id, project_id, system_id, network_type, specifications, source_equipment_id.
- `arqdor_mep_nodes`: id, tenant_id, project_id, network_id, floor_id, room_id?, host_element_id?, position_xyz_mm, elevation_mm, node_type, properties.
- `arqdor_mep_segments`: id, tenant_id, project_id, network_id, from_node_id, to_node_id, geometry/polyline_mm, diameter_or_section, material, slope, properties.
- `arqdor_mep_devices`: id, tenant_id, project_id, system_id, catalog_product_id?, floor_id, room_id?, host_element_id?, position_xyz_mm, orientation, ports, parameters, properties.
- `arqdor_mep_connections`: id, tenant_id, project_id, network_id, port_a_ref, port_b_ref, kind, properties.
- `arqdor_mep_conflicts`: id, tenant_id, project_id, source_ref, target_ref, type, severity, status, detection_revision, assignee?, resolution.
- `arqdor_mep_revisions`: tenant_id, project_id, revision, architecture_revision, author, created_at, change_set, validation.

**Restrições essenciais**
1. Chaves estrangeiras compostas / validação para impedir referências cruzadas de tenant/projeto. `system_id`, `network_id`, nós e arestas nunca podem cruzar tenant ou projeto.
2. Coordenadas normalizadas em milímetros (XYZ, z absoluta/relativa documentada); unidade original só na visualização. Valores técnicos com unidade explícita e validação por disciplina.
3. Alteração de parede, laje, abertura ou pavimento provoca cálculo de impacto em dispositivos/rotas ancorados; vínculos são mantidos somente quando geometricamente válidos. Caso contrário status `requires_review`.
4. Redes são grafos de conexões verificáveis; trajeto desenhado não equivale a circuito dimensionado. Proibir percursos órfãos silenciosos; mostrar pendência de conexão.
5. Controle de concorrência otimista por `revision` do projeto e versão do sistema; APIs rejeitam escrita com versão desatualizada, preservando histórico.
6. Auditoria de autor/data/alteração e versões; soft delete quando necessário. Persistência round-trip e migração compatível para projetos anteriores.
7. Catálogo Universal é referência, não cópia de produto; orçamento e execução usam quantitativos rastreáveis ao elemento.
8. Cálculos elétricos, hidráulicos, térmicos e solares indicam premissas, versão de regra e responsável técnico; sugestões IA não são projetos automaticamente aprovados.

## Disciplinas (sem confundir cadastro com motor técnico pronto)
- elétrica e iluminação (tomadas, quadros, circuitos, cabos, eletrodutos, aterramento)
- água fria/quente, esgoto, ventilação sanitária
- pluvial e drenagem
- climatização/ventilação
- piso aquecido elétrico/hidrônico
- automação, dados, comunicação, CFTV e segurança
- fotovoltaico, baterias, solar térmico
- gás, combate a incêndio e instalações especiais (piscina, irrigação, recarga EV)

## Fluxo mínimo MEP-01
1. No editor residencial, selecionar Instalações > Elétrica / Hidrossanitário > pavimento.
2. Adicionar ponto ancorado ao ambiente, parede ou piso; exibir propriedades contextuais.
3. Traçar segmento conectando nós e atribuir rede/circuito; validar conectividade.
4. Alternar vistas de pontos e redes 2D/3D sem transformar em cópias independentes.
5. Mover parede host e gerar análise de impacto nos dispositivos e caminhos.
6. Salvar/sair/reabrir preservando IDs, referências, rotas, atributos e versões.
7. Extrair lista de pontos e comprimentos vinculados aos IDs do modelo.

## Interface
Camadas por disciplina, filtros por pavimento, vista 2D com símbolos e 3D com equipamentos e percursos; ferramenta de pontos, roteamento, equipamentos, propriedades, conflitos e quantitativos. Dados avançados recolhidos. Vistas e relatórios evidenciam `rascunho / pré-estudo / revisão técnica / aprovado`.

## Fases
MEP-00 (este documento) contrato e arquitetura;
MEP-01 modelo persistente + pontos/redes elétrica e hidrossanitário + testes;
MEP-02 pluvial, climatização, automação, piso aquecido e solar;
MEP-03 regras especializadas, clash detection robusta, documentação, orçamentos e integração obras;
MEP-04 interoperabilidade e trabalho multidisciplinar.

## Aceite obrigatório para MEP-01
- Construir caso sala + cozinha + banheiro com uma tomada, luminária, ponto hidráulico, ponto de esgoto e respectivas redes; IDs estáveis.
- Garantir visão coerente 2D e 3D, salvar/reabrir com igualdade estrutural.
- Detectar host removido e parede deslocada, sem abandonar conexões silenciosamente.
- Rejeitar acesso cruzado entre tenants/projetos e edição com versão defasada.
- Quantidades vinculadas a elementos verificáveis e somas recomputáveis.
- Testes unitários da conectividade/validação, integração persistência/API e e2e do editor.
- Homologação isolada antes de merge e qualquer publicação.

## Limites
Este documento é somente a primeira entrega de especificação técnica: **não contém migração SQL, interface, API operacional ou sistemas dimensionados**, tampouco validação runtime. Nenhum merge/deploy autorizado por este PR.
