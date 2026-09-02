from pathlib import Path

path = Path("artifacts/api-server/src/services/google-ads-oauth.ts")
text = path.read_text()
old = '    return "https://appvendorai.com/api/auth/google-ads/callback";'
new = '    return "https://app.appvendorai.com/api/auth/google-ads/callback";'

if text.count(old) != 1:
    raise SystemExit(f"Esperava exatamente 1 callback legado, encontrei {text.count(old)}")

path.write_text(text.replace(old, new, 1))
