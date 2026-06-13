import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Returns a formatted relative-time string (e.g. "há 3 minutos") for the
 * given date and re-computes it every 60 seconds so the display stays current.
 *
 * @param date - The date to format. Accepts a Date, ISO string, or null/undefined.
 * @param options.addSuffix - Prepend "há" / "em" to the result (default: false).
 */
export function useRelativeTime(
  date: Date | string | null | undefined,
  options: { addSuffix?: boolean } = {}
): string | null {
  const { addSuffix = false } = options;

  const compute = () => {
    if (!date) return null;
    return formatDistanceToNow(new Date(date), { addSuffix, locale: ptBR });
  };

  const [label, setLabel] = useState<string | null>(compute);

  useEffect(() => {
    setLabel(compute());
    const id = setInterval(() => setLabel(compute()), 60_000);
    return () => clearInterval(id);
  }, [date, addSuffix]); // eslint-disable-line react-hooks/exhaustive-deps

  return label;
}
