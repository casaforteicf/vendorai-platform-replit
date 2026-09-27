import React from "react";

export type ManufacturerItem = {
  id: string;
  name: string;
  category: string;
  status: "available" | "future";
};

const manufacturers: ManufacturerItem[] = [
  { id: "evviva", name: "Evviva", category: "Cozinhas planejadas", status: "future" },
  { id: "bertolini", name: "Bertolini", category: "Móveis planejados", status: "future" },
  { id: "dellanno", name: "Dell Anno", category: "Móveis planejados", status: "future" },
  { id: "todeschini", name: "Todeschini", category: "Móveis planejados", status: "future" },
  { id: "sca", name: "SCA", category: "Móveis planejados", status: "future" },
];

type ManufacturerLibraryProps = {
  onSelect?: (item: ManufacturerItem) => void;
};

export function ManufacturerLibrary({ onSelect }: ManufacturerLibraryProps) {
  return (
    <div className="flex h-full flex-col bg-white p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Fabricantes</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Bibliotecas oficiais</h3>
        <p className="mt-1 text-xs text-slate-500">
          Somente bibliotecas oficiais conectadas aparecem nesta lista.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {manufacturers.filter((item) => item.status === "available").map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item)}
            className="w-full rounded-3xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-violet-200 hover:bg-violet-50"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{item.name}</p>
              <p className="mt-1 text-xs text-slate-500">{item.category}</p>
            </div>
          </button>
        ))}
        {manufacturers.every((item) => item.status !== "available") && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            Nenhuma biblioteca oficial está conectada a este ambiente.
          </div>
        )}
      </div>
    </div>
  );
}
