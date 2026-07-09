import React from "react";
import type { MockDebtItem } from "./consolidationTypes";
import { severityClass } from "./consolidationUtils";

export function MockDebtPanel({ items }: { items: MockDebtItem[] }) {
  return (
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Dívida técnica</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Mocks e telas legadas a remover</h2>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-[28px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-[var(--arq-foreground)]">{item.filePath}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--arq-muted)]">{item.description}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(item.severity)}`}>
                {item.severity}
              </span>
            </div>

            <div className="mt-4 rounded-2xl bg-[var(--arq-card-soft)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Recomendação</p>
              <p className="mt-1 text-sm leading-6 text-[var(--arq-muted)]">{item.recommendation}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
