from pathlib import Path

path = Path("artifacts/frontend/src/pages/Deals.tsx")
text = path.read_text(encoding="utf-8")
old = '''        targetOrder !== -1 &&
        targetOrder < sourceOrder &&
      ) {'''
new = '''        targetOrder !== -1 &&
        targetOrder < sourceOrder
      ) {'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"esperado 1 match, encontrado {count}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
