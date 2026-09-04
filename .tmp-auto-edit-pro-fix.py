from pathlib import Path
p = Path('.tmp-auto-edit-pro.py')
s = p.read_text()
start = s.index("bs = rep(bs, '''OBJETIVO:")
end = s.index("bs = rep(bs, '''emoji:", start)
replacement = "bs = rep(bs, 'OBJETIVO: ${AI_EDIT_GOAL_LABELS[goal]}', r'OBJETIVO: ${AI_EDIT_GOAL_LABELS[goal]}\\nDIREÇÃO: ${AI_EDIT_GOAL_GUIDANCE[goal]}', 1)\n"
s = s[:start] + replacement + s[end:]
p.write_text(s)
