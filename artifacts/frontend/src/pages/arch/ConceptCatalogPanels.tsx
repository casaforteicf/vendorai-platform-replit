import { Box } from "lucide-react";

type Product = {
  id: string;
  nome: string;
  categoria?: string | null;
  subcategoria?: string | null;
  fornecedor?: string | null;
  imagens?: string[] | null;
  projectLibraryEnabled?: boolean;
  especificacoes?: Record<string, unknown> | null;
};

type Opening = {
  id: string;
  type: "door" | "window";
};

function openingKind(item: Product): "door" | "window" | null {
  const text = `${item.nome} ${item.categoria ?? ""} ${item.subcategoria ?? ""}`.toLocaleLowerCase("pt-BR");
  if (/porta|door|pivotante|camar[aã]o|porta de correr/.test(text)) return "door";
  if (/janela|window|maxim[- ]?ar|basculante|veneziana|esquadria/.test(text)) return "window";
  return null;
}

function openingDimensions(item: Product) {
  const specs = item.especificacoes;
  if (!specs || typeof specs !== "object") return {};
  const record = specs as Record<string, unknown>;
  const dims = record.dimensionsM && typeof record.dimensionsM === "object"
    ? record.dimensionsM as Record<string, unknown>
    : record;
  const width = Number(dims.width ?? dims.largura);
  const height = Number(dims.height ?? dims.altura);
  return {
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    height: Number.isFinite(height) && height > 0 ? height : undefined,
  };
}

type Props = {
  openingPickerId: string | null;
  opening?: Opening | null;
  catalogProducts: Product[];
  search: string;
  loading: boolean;
  projectMode: boolean;
  usedCounts: Record<string, number>;
  usedProducts: Product[];
  onCancelOpening: () => void;
  onApplyOpening: (product: Product) => void;
  onSelectUsed: (productId: string) => void;
};

export default function ConceptCatalogPanels({
  openingPickerId,
  opening,
  catalogProducts,
  search,
  loading,
  projectMode,
  usedCounts,
  usedProducts,
  onCancelOpening,
  onApplyOpening,
  onSelectUsed,
}: Props) {
  if (openingPickerId && opening) {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const products = catalogProducts
      .filter((item) => item.projectLibraryEnabled !== false)
      .filter((item) => openingKind(item) === opening.type)
      .filter((item) => !query || `${item.nome} ${item.categoria ?? ""} ${item.subcategoria ?? ""} ${item.fornecedor ?? ""}`.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 36);

    return (
      <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50/50 p-3">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-slate-900">Substituir {opening.type === "door" ? "porta" : "janela"}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">Escolha um produto real. Posição e vínculo com a parede serão preservados.</div>
          </div>
          <button type="button" onClick={onCancelOpening} className="rounded-lg border bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">Cancelar</button>
        </div>
        {loading ? (
          <div className="rounded-xl border border-dashed bg-white p-4 text-center text-xs text-slate-500">Carregando catálogo...</div>
        ) : products.length ? (
          <div className="grid grid-cols-2 gap-3">
            {products.map((item) => {
              const dims = openingDimensions(item);
              return (
                <button key={item.id} type="button" onClick={() => onApplyOpening(item)} className="overflow-hidden rounded-xl border bg-white text-left transition hover:border-sky-400 hover:shadow-sm">
                  <div className="aspect-[4/3] bg-slate-100">
                    {item.imagens?.[0] ? <img src={item.imagens[0]} alt={item.nome} className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center text-[10px] font-semibold text-slate-400">Sem imagem</div>}
                  </div>
                  <div className="p-2.5">
                    <div className="line-clamp-2 text-xs font-semibold text-slate-900">{item.nome}</div>
                    <div className="mt-1 text-[9px] text-slate-500">{[item.fornecedor, dims.width && dims.height ? `${dims.width.toFixed(2)} × ${dims.height.toFixed(2)} m` : null].filter(Boolean).join(" · ")}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-white p-4 text-center text-xs text-slate-500">Nenhum produto compatível encontrado. Ajuste a busca ou cadastre a esquadria no catálogo mestre.</div>
        )}
      </div>
    );
  }

  if (!projectMode) return null;

  return (
    <div className="mb-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-slate-900">Usados neste projeto</div>
          <div className="text-[10px] text-slate-500">Produtos reais já aplicados em objetos, móveis, eletros, louças, iluminação e esquadrias.</div>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{usedProducts.length}</span>
      </div>
      {usedProducts.length ? (
        <div className="grid grid-cols-2 gap-3">
          {usedProducts.map((item) => (
            <button key={item.id} type="button" onClick={() => onSelectUsed(item.id)} className="overflow-hidden rounded-xl border bg-white text-left transition hover:border-orange-300 hover:shadow-sm">
              <div className="relative aspect-[4/3] bg-slate-100">
                {item.imagens?.[0] ? <img src={item.imagens[0]} alt={item.nome} className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center"><Box className="h-8 w-8 text-slate-300" /></div>}
                <span className="absolute right-2 top-2 rounded-full bg-slate-950 px-2 py-1 text-[9px] font-bold text-white">{usedCounts[item.id] ?? 0}×</span>
              </div>
              <div className="p-2.5">
                <div className="line-clamp-2 text-xs font-semibold text-slate-900">{item.nome}</div>
                <div className="mt-1 line-clamp-1 text-[9px] text-slate-500">{[item.categoria, item.fornecedor].filter(Boolean).join(" · ")}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-center text-xs text-slate-500">Nenhum produto do catálogo foi aplicado ao projeto ainda.</div>
      )}
    </div>
  );
}