import React, { useMemo } from "react";
import { useDocumentationStudio } from "./DocumentationStudioContext";
import { buildDefaultItems } from "./documentationData";
import { DocumentItemCard } from "./DocumentItemCard";
import { MemorialEditor } from "./MemorialEditor";
import { PrintSelector } from "./PrintSelector";
import { QuantityTable } from "./QuantityTable";
import { TechnicalPreview } from "./TechnicalPreview";

export function DocumentationCanvas() {
  const { discipline, view } = useDocumentationStudio();
  const items = useMemo(() => buildDefaultItems(discipline), [discipline]);

  if (view === "memorial") return <MemorialEditor discipline={discipline} />;
  if (view === "quantitativos") return <QuantityTable discipline={discipline} />;
  if (view === "impressao") return <PrintSelector items={items} />;
  if (view === "plantas") return <TechnicalPreview discipline={discipline} />;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <DocumentItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
