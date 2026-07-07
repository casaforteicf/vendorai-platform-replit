import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variantClass: Record<Variant, string> = {
  primary: "bg-slate-950 text-white hover:bg-violet-700",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
};

export function ArqButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      {...props}
      className={[
        "inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variantClass[variant],
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
