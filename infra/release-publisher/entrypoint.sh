#!/usr/bin/env bash
# INF-15: retired Railway publisher. Fail closed rather than publish on container startup.
# Official path is Contabo homologation -> approved immutable release -> Cloudflare Pages.
set -euo pipefail
echo "Legacy release publisher disabled. Use the controlled Contabo release operator." >&2
exit 78
