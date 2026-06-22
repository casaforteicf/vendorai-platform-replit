---
name: Demo session auth (vendorai-core frontend)
description: How the demo login is kept from becoming a sticky/permanent session.
---

Demo login (`/auth/demo-login`, user `demo@demo.com`) must behave as a "try-it"
session that does NOT auto-resume when the app is reopened. Real logins persist
normally via `vendorai_token` in localStorage.

**Rule:** the auth token stays in `localStorage` under `vendorai_token` (many
pages read it directly — do not move it). Demo-ness is detected by decoding the
JWT `email` claim (`demo@demo.com`), not by a separate localStorage flag. A demo
session is only kept alive while a per-tab `sessionStorage` marker
(`vendorai_demo_session=active`) is present; on a fresh open the marker is gone
so the demo token is cleared and the user lands on `/login`.

**Why:** persisting the demo token like a normal login made the app open straight
into the demo account every time. Detecting demo from the JWT (instead of a flag)
also auto-clears legacy sticky demo sessions created before this fix.

**How to apply:** `AuthContext.login()` takes `{ isDemo }`; the Login page passes
it for the demo button. `readInitialToken()` does the JWT check + sessionStorage
marker logic. If you change token storage key/location, update every direct
`localStorage.getItem("vendorai_token")` reader across pages.
