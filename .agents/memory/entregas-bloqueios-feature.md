---
name: Entregas (delivery) + Bloqueios de agenda feature
description: How the driver-delivery tracking and agenda-block features are wired into the existing round-robin/slots/proposal-accepted flow.
---

Motorista = user with `userFunction: "entrega"` (no separate vehicles/drivers table). Reused `buildUserFunctionFilter` and `assignedTo` — no new permission logic needed.

`entregas` rows are auto-created inside `proposalAccepted()` (best-effort, non-blocking try/catch) — one delivery flow can silently no-op on failure without blocking the sale.

**Why:** the spec explicitly requires delivery creation to never block proposal acceptance; sale approval must succeed even if delivery scheduling fails.

Turno (shift) capacity check lives in `artifacts/api-server/src/lib/entregas.ts` (`checkTurnoCapacity`, `pickNextMotorista`) and mirrors the existing seller round-robin (`lastAssignedAt`) pattern — copy that pattern for any future "N eligible resources, skip blocked/at-limit ones" assignment logic.

`bloqueios_agenda` (any `responsavelId` blocked for a date range + `periodo`) is layered into `GET /tenants/:tenantId/agendamentos/slots` by subtracting blocked windows (manha=08-12h, tarde=13-18h, dia_inteiro=full day, BRT) — and must also be checked before round-robin picks a motorista, not just at slot-query time.

**How to apply:** any new "resource availability" feature (rooms, staff, equipment) in this codebase should check `bloqueios_agenda` the same way, keyed by `responsavelId`, rather than inventing a parallel blocking mechanism.
