import { useEffect, useId, useState } from "react";

export function ConceptMetricInput({ value, min, max, onCommit, className, selectionId }: {
  value: number; min: number; max: number; onCommit: (value: number) => void | boolean; className?: string; selectionId?: string;
}) {
  const [draft, setDraft] = useState(value.toFixed(2).replace(".", ","));
  const [invalid, setInvalid] = useState(false);
  const [rejected, setRejected] = useState(false);
  const errorId = useId();
  useEffect(() => { setDraft(value.toFixed(2).replace(".", ",")); setInvalid(false); setRejected(false); }, [value, selectionId]);
  const commit = () => {
    const number = /^\d+(?:[.,]\d+)?$/.test(draft.trim()) ? Number(draft.trim().replace(",", ".")) : NaN;
    if (!Number.isFinite(number) || number < min || number > max) { setInvalid(true); return; }
    setInvalid(false);
    setRejected(false);
    if (number !== value && onCommit(number) === false) {
      setDraft(value.toFixed(2).replace(".", ","));
      setRejected(true);
    }
  };
  return <><input type="text" inputMode="decimal" value={draft} aria-invalid={invalid || rejected} aria-describedby={invalid || rejected ? errorId : undefined}
    title={invalid ? `Informe uma medida entre ${min} e ${max} m.` : undefined}
    onChange={(event) => { setDraft(event.target.value); setInvalid(false); setRejected(false); }} onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { event.preventDefault(); setDraft(value.toFixed(2).replace(".", ",")); setInvalid(false); setRejected(false); }
    }} className={className} />
    {rejected && <span id={errorId} role="alert" className="mt-1 block text-xs font-normal text-red-600">Alteração não aplicada. A medida do projeto foi mantida.</span>}
    {invalid && <span id={errorId} role="alert" className="mt-1 block text-xs font-normal text-red-600">Informe entre {min.toFixed(2).replace(".", ",")} e {max.toFixed(2).replace(".", ",")} m.</span>}
  </>;
}
