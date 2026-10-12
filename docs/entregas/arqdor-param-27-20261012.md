# ARQ-PARAM-27 — arredondamento e geometria do orçamento

Versão: 2026.10.12.27
Código: b5a782d49bd5b55a4f4c709baf06c7274f9fbf2b
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Arredondamento decimal half-up para preço e quantidade, multiplicação em centavos com BigInt, evitando deriva binária monetária. Helper de validação geométrica reutilizado na rota de consulta/aplicação: parede presente, medidas/piso válidos, comprimento/altura disponíveis e sobreposição de vãos horizontal/vertical. Sobreposições entram nas pendências da prévia e bloqueiam envio; contato de bordas permitido.

## Arquivos
- artifacts/api-server/src/lib/arch-opening-budget.ts
- artifacts/api-server/src/lib/arch-opening-budget.test.ts
- artifacts/api-server/src/routes/arch.ts

## Verificação
87 testes locais aprovados em 18 arquivos focados (81 frontend, 6 helper backend). TypeScript do helper aprovado. Casos de 1,005 arredondado para 1,01, total de meio centavo, sobreposição/contato, parede ausente e abertura fora da parede. Rotas integradas por inspeção, sem execução HTTP/banco. Sem build completo.

## Pendências
Ainda exige validação real de sessão/tenant, transação, concorrência e gravação/reabertura do orçamento. Altura de parede 2,80 m. Integração cobre esquadrias, não orçamento integral da obra. Homologação/publicação Contabo adiadas pelo usuário; sem merge/main/deploy.
