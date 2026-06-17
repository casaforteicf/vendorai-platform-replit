---
name: Express router.use wildcard middleware blocks downstream routers
description: router.use(middleware) sem path em um sub-router bloqueará requests de routers registrados depois dele no router principal.
---

**Regra:** Nunca usar `router.use(requireRole(...))` sem path em sub-routers. Sempre colocar o guard em cada rota individualmente.

**Por quê:** Em Express, `router.use(fn)` sem path roda para TODA request que chega ao sub-router. Quando o router principal tem `mainRouter.use(subRouter)` sem path, TODA request passa pelo subRouter. Se uma request não é tratada por nenhum router anterior ela cai no subRouter onde o `router.use(requireRole)` rejeita imediatamente — mesmo que o path não corresponda a nenhuma rota do subRouter.

**Como aplicar:** Ao adicionar novos routers após `partnerRouter` ou `adminPartnersRouter` em `routes/index.ts`, qualquer request que não seja tratada por um router anterior vai cair nesses routers e será bloqueada pelo antigo `router.use(requireRole)` wildcard. A correção aplicada foi mover o `requireRole` para cada rota individual em `partner.ts` e `admin_partners.ts`.

**Detectar:** Sintoma = 403 "Insufficient permissions" em rotas que NÃO têm requireRole explícito, com tempo de resposta <50ms (muito rápido para ser OpenAI ou DB). Verificar se o router afetado está registrado DEPOIS de partner/admin_partners em routes/index.ts.
