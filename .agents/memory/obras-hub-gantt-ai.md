---
name: Obras Hub AI Diary + Draggable Gantt
description: Pattern for IA de Diário de Obra endpoint and div-based draggable Gantt replacing Recharts.
---

## IA de Diário de Obra

- Column `resumo_ia TEXT` added to `obra_diario` via startup migration in `api-server/src/index.ts`.
- Endpoint: `POST /tenants/:tenantId/obras/:obraId/diario/:diarioId/resumo-ia` in `construcao.ts`.
- Pattern: `resolveAIKey(tid, "anthropic")` → `new Anthropic({ apiKey })` → `claude-3-5-haiku-20241022`, max_tokens 300.
- Prompt builds from: climaTempo, maoDeObra, conteudo, observacoes, fotos count.
- Response: `(message.content[0] as { type: string; text: string }).text`.
- Saved to DB via `UPDATE obra_diario SET resumo_ia = ? WHERE id = ?`.
- PDF (`pdf-diario.ts`): `resumoIA?: string | null` in `DiarioEntry`; sky-blue `resumo-ia-box` CSS block rendered after `obs-box`.
- Frontend: `generatingAI: string | null` state; `handleGerarResumoIA()` hits the endpoint, invalidates query, shows toast. "Resumo IA" / "Regerar IA" button (sky outline, Sparkles icon). Display in expanded entry card.

## Draggable Gantt

- Recharts `BarChart` replaced by `DraggableGantt` (pure div/CSS, no Recharts dependency).
- Drag state stored in `dragRef` (useRef) to avoid stale closures — never store in useState for drag math.
- `forceUpdate` pattern: `const [, forceUpdate] = useState(0)` triggered on move/up to re-render preview.
- 3 drag modes: `"move"` (bar body) shifts offset+keeps duration; `"left"` handle changes start; `"right"` handle changes end.
- Event listeners attached on `mousedown` inside `startDrag()` and removed in `onUp` — avoids global listener leaks.
- Container width measured via `containerRef.current.getBoundingClientRect().width - LABEL_W` on each move.
- On mouseup: `addDays(projectStart, prevOffset)` for new start; calls `onUpdateDates(rowId, newStart, newEnd)`.
- `handleUpdateDates` in `Cronograma` calls `updateEtapa` + invalidates query + shows toast.

**Why:** Recharts `BarChart` has no native drag API; a div-based approach gives full pixel control.
**How to apply:** Any future Gantt enhancement goes in `DraggableGantt` component (before `Cronograma` function in `ObraDetalhe.tsx`).
