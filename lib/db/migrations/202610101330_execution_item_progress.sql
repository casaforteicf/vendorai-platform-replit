-- LOTE 06: progresso quantitativo independente do status do lote.
-- Somente homologação após revisão de esquema.
ALTER TABLE execution_lot_items
  ADD COLUMN IF NOT EXISTS completed_quantity numeric(18,6) NOT NULL DEFAULT 0;
ALTER TABLE execution_lot_items
  ADD CONSTRAINT execution_lot_items_completed_quantity_chk
  CHECK (completed_quantity >= 0 AND completed_quantity <= quantity);
