import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";

export function quantityStep(isComposition: boolean): number {
  return isComposition ? 0.01 : 1;
}

export function normalizeBudgetQuantity(value: number, isComposition: boolean): number {
  const step = quantityStep(isComposition);
  const minimum = step;
  if (!Number.isFinite(value)) return minimum;
  const normalized = isComposition
    ? Math.round((value + Number.EPSILON) * 100) / 100
    : Math.trunc(value);
  return Math.max(minimum, normalized);
}

export function formatBudgetQuantity(value: number, isComposition: boolean): string {
  const normalized = normalizeBudgetQuantity(value, isComposition);
  return isComposition
    ? normalized.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")
    : String(normalized);
}

export function parseBudgetQuantity(raw: string, isComposition: boolean): number | null {
  const normalizedRaw = raw.trim().replace(",", ".");
  if (!normalizedRaw || normalizedRaw === ".") return null;
  const parsed = Number(normalizedRaw);
  if (!Number.isFinite(parsed)) return null;
  return normalizeBudgetQuantity(parsed, isComposition);
}

type Props = {
  value: number;
  isComposition: boolean;
  onChange: (value: number) => void;
  className?: string;
};

export function BudgetQuantityInput({ value, isComposition, onChange, className = "" }: Props) {
  const [draft, setDraft] = useState(() => formatBudgetQuantity(value, isComposition));
  const focusedRef = useRef(false);
  const step = quantityStep(isComposition);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(formatBudgetQuantity(value, isComposition));
    }
  }, [value, isComposition]);

  const commit = (raw = draft) => {
    const parsed = parseBudgetQuantity(raw, isComposition);
    const next = parsed ?? normalizeBudgetQuantity(value, isComposition);
    setDraft(formatBudgetQuantity(next, isComposition));
    onChange(next);
  };

  const changeBy = (direction: 1 | -1) => {
    const base = parseBudgetQuantity(draft, isComposition)
      ?? normalizeBudgetQuantity(value, isComposition);
    const next = normalizeBudgetQuantity(base + direction * step, isComposition);
    setDraft(formatBudgetQuantity(next, isComposition));
    onChange(next);
  };

  return (
    <div className={`flex h-9 w-[132px] overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${className}`}>
      <Input
        type="text"
        inputMode={isComposition ? "decimal" : "numeric"}
        aria-label="Quantidade"
        className="h-full min-w-0 flex-1 rounded-none border-0 px-3 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        value={draft}
        onFocus={(event) => {
          focusedRef.current = true;
          // React limpa currentTarget depois do handler. Guardamos o elemento
          // antes do requestAnimationFrame para evitar null.select() em produção.
          const input = event.currentTarget;
          requestAnimationFrame(() => {
            if (document.activeElement === input) input.select();
          });
        }}
        onBlur={() => {
          focusedRef.current = false;
          commit();
        }}
        onChange={(event) => {
          const raw = event.target.value;
          const allowed = isComposition
            ? /^\d*(?:[.,]\d{0,2})?$/
            : /^\d*$/;
          if (!allowed.test(raw)) return;
          setDraft(raw);

          const parsed = parseBudgetQuantity(raw, isComposition);
          if (parsed !== null) onChange(parsed);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            changeBy(1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            changeBy(-1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        }}
      />
      <div className="flex w-8 shrink-0 flex-col border-l">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Aumentar quantidade"
          className="grid h-1/2 place-items-center border-b text-muted-foreground hover:bg-muted active:bg-muted"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => changeBy(1)}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Diminuir quantidade"
          className="grid h-1/2 place-items-center text-muted-foreground hover:bg-muted active:bg-muted"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => changeBy(-1)}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
