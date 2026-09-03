from pathlib import Path

path = Path("artifacts/api-server/src/routes/praca_delivery_ops.ts")
text = path.read_text(encoding="utf-8")

old_setup = '''const router: IRouter = Router();
export const pracaDeliveryPublicRouter: IRouter = Router();
pracaDeliveryPublicRouter.use(rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
}));'''

new_setup = '''const router: IRouter = Router();
export const pracaDeliveryPublicRouter: IRouter = Router();

// IMPORTANT: this public router is mounted without a path before the global
// authenticate middleware. A router.use(rateLimit(...)) here would therefore
// rate-limit every API request that was not handled by an earlier public router,
// including all authenticated CRM routes. Keep the limiter attached only to the
// two public delivery-portal endpoints below.
const publicDeliveryRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});'''

if old_setup not in text:
    raise SystemExit("rate limiter setup anchor not found")
text = text.replace(old_setup, new_setup, 1)

old_get = 'pracaDeliveryPublicRouter.get("/public/praca-delivery/:trackingToken", async (req, res) => {'
new_get = 'pracaDeliveryPublicRouter.get("/public/praca-delivery/:trackingToken", publicDeliveryRateLimiter, async (req, res) => {'
if old_get not in text:
    raise SystemExit("public delivery GET anchor not found")
text = text.replace(old_get, new_get, 1)

old_post = 'pracaDeliveryPublicRouter.post("/public/praca-delivery/:trackingToken/messages", async (req, res) => {'
new_post = 'pracaDeliveryPublicRouter.post("/public/praca-delivery/:trackingToken/messages", publicDeliveryRateLimiter, async (req, res) => {'
if old_post not in text:
    raise SystemExit("public delivery POST anchor not found")
text = text.replace(old_post, new_post, 1)

if 'pracaDeliveryPublicRouter.use(rateLimit(' in text:
    raise SystemExit("unsafe wildcard limiter still present")

path.write_text(text, encoding="utf-8")
