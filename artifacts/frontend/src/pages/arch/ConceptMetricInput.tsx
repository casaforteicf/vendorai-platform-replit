import { useEffect, useState } from "react";

export function ConceptMetricInput({ value, min, max, onCommit, className }: {
  value: number; min: number; max: number; onCommit: (value: number) => void; className?: string;
}) {
  const [draft, setDraft] = useState(value.toFixed(2).replace(".", ","));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(value.toFixed(2).replace(".", ",")); setInvalid(false); }, [value]);
  const commit = () => {
    const number = /^\d+(?:[.,]\d+)?$/.test(draft.trim()) ? Number(draft.trim().replace(",", ".")) : NaN;
    if (!Number.isFinite(number) || number < min || number > max) { setInvalid(true); return; }
    setInvalid(false);
    if (number !== value) onCommit(number);
  };
  return <input type="text" inputMode="decimal" value={draft} aria-invalid={invalid}
    title={invalid ? `Informe uma medida entre ${min} e ${max} m.` : undefined}
    onChange={(event) => { setDraft(event.target.value); setInvalid(false); }} onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { event.preventDefault(); setDraft(value.toFixed(2).replace(".", ",")); setInvalid(false); }
    }} className={className} />;
}
