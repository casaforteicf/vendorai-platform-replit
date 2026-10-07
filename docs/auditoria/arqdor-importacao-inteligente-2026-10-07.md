# ARQDOR — Importação Inteligente de Projeto · caso de aceite 07/10/2026

## Objetivo

Validar o novo fluxo de Importação Inteligente com um projeto arquitetônico residencial real de múltiplas pranchas, mantendo o documento-fonte privado e sem persistir dados pessoais na Biblioteca Universal.

## Regras de produto

1. A importação do PDF deve gerar automaticamente a **Memória da Obra**.
2. Plantas, fachadas, cobertura e componentes reutilizáveis devem alimentar automaticamente a **Biblioteca Universal**, sem perguntar ao usuário.
3. A Biblioteca Universal não pode receber proprietário, CPF/CNPJ, telefone, e-mail, endereço, matrícula ou outro identificador da obra.
4. A geometria do pré-projeto só pode ser aplicada quando houver escala suficiente e confiança mínima; caso contrário deve permanecer em revisão/calibração.
5. Cota explícita e quadro técnico têm prioridade sobre inferência visual.
6. Linhas de cota, terreno, chamadas e anotações não podem virar paredes.

## Caso de teste arquitetônico anonimizado

Documento: 6 pranchas de projeto arquitetônico/executivo residencial.

Referências objetivas para conferência:
- área total indicada: **377,23 m²**;
- planta baixa técnica em escala 1:100;
- quadro de portas e janelas;
- janelas detalhadas individualmente;
- cobertura com telha shingle, estrutura metálica e inclinação indicada de **60%**;
- cortes arquitetônicos;
- elevações/fachadas;
- notas construtivas;
- parede de alvenaria especificada com tijolo de 9 furos de **14 cm**, além de cadeias de cotas acabadas recorrentes próximas de 15 cm;
- exemplo de esquadria: **J04 = 1,20 x 2,20 m, peitoril 0,70 m**, com especificação e quantidade no quadro.

## Aceite do Bloco 1 — Memória + geometria 2D

Ao importar:
- detectar todas as folhas relevantes;
- classificar planta, cobertura, cortes, fachadas, quadro/detalhes e notas;
- gerar memória estruturada de ambientes, esquadrias, materiais, cobertura, notas e inconsistências;
- gerar pelo menos uma planta candidata em `memory.floorPlans`;
- paredes em coordenadas normalizadas devem preservar o perímetro e os recuos da planta;
- ao calibrar, converter para metros sem alterar distribuição;
- preservar espessura de parede quando suportada pelo desenho/cota;
- vincular J/P à parede correta por `wallId`/índice original;
- detectar encontros L/T/cruzamento e encaixar apenas tolerâncias pequenas;
- descartar segmentos de baixa confiança sem deslocar o vínculo das esquadrias;
- abrir a geometria resultante no modelo wall-first do Arqdor.

## Aceite do Bloco 2 — Fachada/cortes/cobertura

- identificar elevações frontal, fundos e laterais quando nomeadas;
- extrair materiais e elementos arquitetônicos somente quando explícitos;
- extrair alturas e níveis dos cortes sem inventar dados ausentes;
- cruzar códigos de esquadrias com quadro/detalhes;
- preservar cobertura e inclinação quando explicitamente indicadas;
- gerar modelos de fachada e cobertura na Biblioteca Universal.

## Aceite da Biblioteca Universal

Para cada item:
- `kind` coerente;
- arquitetura reutilizável;
- metadados pesquisáveis;
- proveniência por página/evidência sem PII;
- confiança;
- deduplicação por assinatura arquitetônica;
- itens abaixo do limiar ficam `needs_review`, não são descartados nem tratados como confirmados.

## Não abrangido por este aceite

- aprovação automática de geometria de baixa confiança;
- criação de medida inexistente;
- substituição silenciosa de Projeto Mestre congelado;
- publicação/merge/deploy automático.
