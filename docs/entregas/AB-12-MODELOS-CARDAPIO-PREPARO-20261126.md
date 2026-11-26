# AB-12 — modelos de cardápio, escala semanal e modo de preparo

Data: 2026-11-26.

## Entregue

- Migração 572: modo de preparo, modelos, grade semanal, snapshot diário e
  categoria/percentual no prato.
- Importação de receita captura e salva o modo de preparo; preview editável.
- Ficha técnica exibe/edita o modo de preparo.
- Modelos reutilizáveis por serviço, com categoria e percentual por prato.
- Grade semanal e geração dos próximos 30 dias sem sobrescrever dias existentes.
- Cardápio do dia aceita categoria/percentual e mantém cópia do modelo.
- Briffing com adultos, crianças 7–12 (50%), crianças 0–6 (30%), 300 g de
  proteína e 150 g de acompanhamento por adulto, referência pelo maior
  ingrediente da ficha.
- API valida percentuais por grupo e impede total de hóspedes no campo de
  porções por hóspede.

## Validação

- `vitest restaurante-importacao`: 17/17.
- `vitest briffing`: 25/25.
- `vitest Briffing.test.tsx`: 7/7.
- `tsc -p tsconfig.launch-ci.json --noEmit`: exit 0.
- `vite build`: exit 0.
