import type { Ui20Service } from "./ui20ServiceVisibility";
export const ui20RouteGroups: Record<Ui20Service, readonly string[]> = {
  home: ["/", "/tad", "/dashboard", "/trabalho"],
  crm: ["/leads", "/deals", "/pipeline-operacional", "/pipeline-relacionamento", "/empresas", "/contacts-nonleads"],
  omnichannel: ["/conversations"],
  prospecting: ["/app/prospector"],
  agenda: ["/agenda"],
  commercial: ["/propostas", "/catalogo", "/pacotes"],
  intelligence: ["/vkg", "/scout", "/relatorios"],
  works: ["/obras", "/insumos", "/composicoes"],
  library: ["/midias"],
  marketing: ["/marketing", "/content", "/content-studio", "/content-autopilot", "/ads", "/analytics", "/campanhas", "/diagnostico-planejamento"],
  erp: ["/erp", "/estoque", "/entregas"],
  ia: ["/agents", "/vendi", "/base-conhecimento", "/brain"],
  marketplace: ["/marketplace"],
  arqdor: ["/arch"],
  support: ["/faq", "/suporte"],
  settings: ["/configuracoes", "/usuarios", "/organizacao"],
};
const normalize = (value: string) => (value.split(/[?#]/)[0].replace(/\/$/, "") || "/");
export function ui20ServiceForPath(location: string): Ui20Service | null {
  const path = normalize(location);
  // Longest, boundary-aware prefix wins; avoids '/marketing' catching unrelated names.
  const matches = (Object.entries(ui20RouteGroups) as [Ui20Service, readonly string[]][])
    .flatMap(([id, paths]) => paths.filter(prefix => path === prefix || (prefix !== "/" && path.startsWith(prefix + "/"))).map(prefix => ({id, length:prefix.length})))
    .sort((a,b)=>b.length-a.length);
  return matches[0]?.id ?? null;
}

/** Presentation-only: the shared Media Library appears inside Marketing. */
export function ui20SidebarServiceForPath(location: string): Ui20Service | null {
  const path = normalize(location);
  return path === "/midias" || path.startsWith("/midias/")
    ? "marketing"
    : ui20ServiceForPath(location);
}
