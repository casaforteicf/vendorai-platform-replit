import { ArqButton } from "./ArqButton";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-[32px] border border-dashed border-slate-200 bg-white p-10 text-center">
      <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{description}</p> : null}
      {actionLabel ? (
        <ArqButton className="mt-6" onClick={onAction}>
          {actionLabel}
        </ArqButton>
      ) : null}
    </div>
  );
}
