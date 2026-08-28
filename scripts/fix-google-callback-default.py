from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found: {path}: {old}")
    p.write_text(text.replace(old, new, 1))

replace_once(
    "artifacts/api-server/src/routes/google-login.ts",
    '    callbackUrl: process.env.GOOGLE_CALLBACK_URL?.trim() ?? "",',
    '    callbackUrl: process.env.GOOGLE_CALLBACK_URL?.trim() || (process.env.NODE_ENV === "production" ? "https://app.appvendorai.com/api/auth/google/callback" : ""),',
)
replace_once(
    "artifacts/api-server/src/routes/google-login.ts",
    '    req.log?.error("google-login: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/JWT_SECRET ausentes");',
    '    req.log?.error("google-login: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/JWT_SECRET ou callback OAuth ausentes");',
)
replace_once(
    ".env.example",
    "GOOGLE_CALLBACK_URL=",
    "GOOGLE_CALLBACK_URL=https://app.appvendorai.com/api/auth/google/callback",
)
print("ok")
