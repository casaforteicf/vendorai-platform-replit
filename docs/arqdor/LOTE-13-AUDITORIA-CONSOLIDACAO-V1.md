# Arqdor Lote 13 — fechamento do escopo 13.01–13.84 / Auditoria de integração

**Status:** planejamento integralmente percorrido; implementação **parcial** e **não homologada**. Este registro não atesta build, testes executados, editor funcional, publicação ou capacidade industrial. Branch: `feat/arqdor-lote13-furniture-core-20261010`, PR #3450. Nenhum merge ou deploy autorizado por este documento.

## Implementações preliminares existentes

- Peças, quantidades, chapas, fitas, etiquetas e dossiê técnico: módulos puros TS, sem fluxo industrial integrado.
- Armários paramétricos, biblioteca de templates, vistas ortográficas de referência.
- BOM por material, CSV, preparação de lotes de execução e referência a CRM (sem writes).
- Curvas amostradas, perfis e cálculo aproximado de volumes, laminação e limites de transporte.
- Multisseleção de peças, materiais por borda, consulta de biblioteca e colisão 2D retangular.
- Objetos multi-ofício e referências a RFQ, candidatos importados com autorização, sem publicação persistente.
- Painéis de pedra/vidro com área aproximada, vértices e faces de croquis 2D.
- Ripados, perfis metálicos, levantamento as-built, dependências entre fornecedores, envelopes 3D retangulares.
- Reconstrução de origem e confiança, multilaminados, impacto de revisão, retalhos elegíveis, checks de qualidade.
- Promob: indicação de intercâmbio; 3D/CAD: metadados e candidatos de reconstrução; sem conversores nativos.

## Critérios obrigatórios antes de homologação

1. **Build e teste:** executar TypeScript, Vitest e lint real, registrar resultados por arquivo e corrigir falhas (todos os testes adicionados permanecem não executados).
2. **Validação geométrica:** impedir autointerseções, aberturas fora de contorno, faces inválidas, tolerâncias industriais incorretas e falsa identificação de malha como peça fabricável.
3. **Interface:** integrar editor real 2D/3D, seleção, snap, catálogo, painel de propriedades, wizard, biblioteca e visualização de erros. Helpers sem interface não são funcionalidades finalizadas.
4. **Persistência:** vincular tenant, projeto, ambiente, objeto, revisão, arquivos privados e auditoria com autorização também no servidor (não apenas no frontend).
5. **Projetos importados:** executar antivírus, validação MIME/assinatura/arquivo, normalização de unidades, conversor licenciado se necessário, controle de direitos e proveniência verificável.
6. **Documentação técnica:** vincular desenhos e versões, revisar peças, ferragens, medição em obra, tolerâncias e revisão humana. CNC/CAM continua bloqueado.
7. **Vendor.ai:** integrar CRM, orçamento, fornecedores/RFQ, estoque, lotes e assistência usando serviços existentes com consentimento e aprovações.
8. **Teste ponta a ponta:** ambiente do Pré-Projeto -> móvel -> medidas e materiais -> revisão -> BOM e documentação -> RFQ simulada -> preparação de lote parcial; testar isolamento entre tenants.
9. **Entrega:** homologação separada, release controlado, monitoramento, rollback; não efetuar merge ou produção nesta fase.

## Próxima onda técnica sugerida

Onda A: corrigir build + testes e invariantes geométricos; Onda B: conectar interface e persistência do editor; Onda C: serviços existentes de cotação, catálogo, compras e CRM; Onda D: validação funcional com projeto real e documentação; Onda E: homologação do release com gate.

**Interpretação correta:** 84/84 sublotes tiveram requisitos abordados ou componentes preliminares adicionados; 0/84 podem ser declarados plenamente concluídos a partir das evidências atuais.
