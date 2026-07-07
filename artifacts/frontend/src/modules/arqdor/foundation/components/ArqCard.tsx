import type { HTMLAttributes, ReactNode } from "react";

export function ArqCard({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      {...props}
      className={["rounded-[28px] border border-slate-100 bg-white shadow-sm", className].join(" ")}
    >
      {children}
    </div>
  );
}
