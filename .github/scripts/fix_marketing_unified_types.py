from pathlib import Path

context_path = Path("artifacts/frontend/src/components/marketing/MarketingContextSelector.tsx")
context = context_path.read_text()
context = context.replace(
    "function headers() {",
    "function headers(): Record<string, string> {",
    1,
)
context = context.replace(
    "        (profile) => profile.slug === requestedVerticalSlug || profile.id === requestedVerticalSlug,",
    "        (profile: { slug: string; id: string; name: string }) => profile.slug === requestedVerticalSlug || profile.id === requestedVerticalSlug,",
    1,
)
context_path.write_text(context)

content_path = Path("artifacts/frontend/src/pages/Content.tsx")
content = content_path.read_text()
content = content.replace(
    "varejoProducts?.map((p) => ({ id: p.id, nome: p.nome }))",
    "varejoProducts?.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome }))",
    1,
)
content = content.replace(
    "supermercadoProducts?.map((p) => ({ id: p.id, nome: p.nome }))",
    "supermercadoProducts?.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome }))",
    1,
)
content = content.replace(
    "insumosProducts?.map((p) => ({ id: p.id, nome: p.nome }))",
    "insumosProducts?.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome }))",
    1,
)
content = content.replace(
    "catalogProducts?.map((p) => ({ id: p.id, nome: p.nome }))",
    "catalogProducts?.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome }))",
    1,
)
content_path.write_text(content)
print("Tipos do gerador unificado ajustados")
