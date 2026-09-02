from pathlib import Path

path = Path("artifacts/frontend/src/pages/Deals.tsx")
text = path.read_text(encoding="utf-8")
old = '''                    <SelectContent>
                      {visibleEtapas.map((e) => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
'''
new = '''                    <SelectContent>
                      {visibleEtapas.filter((stage) => {
                        if (stage.value === "perdido") return true;
                        const currentOrder = kanbanColumns.find((column) => column.onDrop.etapa === deal.etapa)?.order ?? -1;
                        const targetOrder = kanbanColumns.find((column) => column.onDrop.etapa === stage.value)?.order ?? -1;
                        return currentOrder < 0 || targetOrder < 0 || targetOrder >= currentOrder;
                      }).map((e) => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
'''
if text.count(old) != 1:
    raise SystemExit(f"select mobile esperado uma vez, encontrado {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
