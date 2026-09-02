from pathlib import Path

path = Path("scripts/patch-pipeline-active-processes.py")
text = path.read_text(encoding="utf-8")
old = '''header_end = '      </div>\\n\\n      {/* Pipeline mode tabs */}'
if header_end in text:
    text = text.replace(header_end, '      </div>\\n\\n      <PipelineNav active="comercial" />\\n\\n      {/* Pipeline mode tabs */}', 1)
else:
    # fallback insert before first desktop/mobile pipeline body marker
    marker = '      {/* Mobile column selector */}'
    if marker not in text:
        raise SystemExit('Deals pipeline selector insertion marker not found')
    text = text.replace(marker, '      <PipelineNav active="comercial" />\\n\\n' + marker, 1)
'''
new = '''header_end = '      </div>\\n\\n      {/* Pipeline mode tabs */}'
if header_end in text:
    text = text.replace(header_end, '      </div>\\n\\n      <PipelineNav active="comercial" />\\n\\n      {/* Pipeline mode tabs */}', 1)
else:
    marker = '      {/* ── Pipeline Clássico — Mobile column picker ────────────────────── */}'
    if marker not in text:
        raise SystemExit('Deals pipeline selector insertion marker not found')
    text = text.replace(marker, '      <PipelineNav active="comercial" />\\n\\n' + marker, 1)
'''
if old not in text:
    raise SystemExit("bloco de marcador não encontrado")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
