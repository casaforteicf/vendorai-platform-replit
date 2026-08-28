from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found: {path}: {old}")
    p.write_text(text.replace(old, new, 1))

replace_once(
    "artifacts/api-server/src/routes/lead_proposals.ts",
    " * Supports text/HTML, PDF and DOCX/DOC using dependencies already present in the API. */",
    " * Supports text/HTML, PDF and DOCX using dependencies already present in the API. */",
)
replace_once(
    "artifacts/api-server/src/routes/lead_proposals.ts",
    '    } else if (ct.includes("word") || ct.includes("officedocument") || lowerUrl.endsWith(".doc") || lowerUrl.endsWith(".docx")) {',
    '    } else if (ct.includes("officedocument") || lowerUrl.endsWith(".docx")) {',
)
replace_once(
    "artifacts/frontend/src/pages/Configuracoes.tsx",
    '        accept=".html,.htm,.txt,.md,.pdf,.doc,.docx"',
    '        accept=".html,.htm,.txt,.md,.pdf,.docx"',
)
print("ok")
