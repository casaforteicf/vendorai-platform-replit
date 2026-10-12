# ARQ-PARAM-24 — conferência de esquadrias

Versão: 2026.10.12.24
Código: 7602efb3e5489317cc4c216dd745f38949754c5d
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Quadro e CSV sinalizam piso inválido, parede degenerada, vão fora do comprimento/altura da parede, ID duplicado e sobreposição horizontal/vertical com outra abertura. Considera offset normalizado centrado. Aberturas que apenas encostam nas bordas não são marcadas como sobrepostas. Não muda medidas autorais nem bloqueia edição/exportação.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptOpeningSchedule.ts
- artifacts/frontend/src/pages/arch/conceptOpeningSchedule.test.ts
- artifacts/frontend/src/pages/arch/ConceptOpeningSchedule.test.tsx

## Verificação
76 testes locais aprovados em 16 arquivos focados. Casos novos de largura/altura fora da parede, parede degenerada, colisões/contato, duplicidade e atualização da interface após mudança de geometria. Sem navegador real, download real ou build completo.

## Limites e pendências
Conferência usa parede padrão de 2,80 m, não altura individual. Avisos informativos; não são cálculo estrutural, orçamento nem verificação completa de acessibilidade. Produtos/perfis/preços, múltiplas vistas/PDF e validação real ainda pendentes. Homologação/publicação Contabo adiadas pelo usuário; sem merge/main/deploy.
