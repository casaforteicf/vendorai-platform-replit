import React, { type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes } from "react";
import "./arqdor-studio-primitives.css";

/** Opt-in primitives for architectural workspaces. Functionality stays with callers. */
export function StudioPanel({ title, actions, children, className = "", ...rest }: HTMLAttributes<HTMLElement> & { title?: string; actions?: React.ReactNode }) {
  return <section {...rest} className={`arq2-panel ${className}`}>
    {(title || actions) && <div className="arq2-toolbar"><span className="arq2-panel-title">{title}</span><div style={{marginLeft:"auto"}}>{actions}</div></div>}
    {children}
  </section>;
}

export function StudioToolButton({ active = false, children, type = "button", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button {...rest} type={type} aria-pressed={active} className={`arq2-tool-button ${className}`}>{children}</button>;
}

export function StudioField({ label, id, className = "", ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;
  return <label htmlFor={fieldId} style={{display:"grid",gap:4}}>
    <span className="arq2-label">{label}</span>
    <input {...rest} id={fieldId} className={`arq2-field ${className}`} />
  </label>;
}
