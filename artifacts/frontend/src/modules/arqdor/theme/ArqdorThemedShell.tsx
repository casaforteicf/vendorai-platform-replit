import React from "react";
import { ArqdorThemeToggle } from "./ArqdorThemeToggle";

export function ArqdorThemedShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="arq-page">
      <div className="arq-container">
        <header className="arq-card arq-card-lg">
          <div className="arq-section-header">
            <div>
              <p className="arq-eyebrow">ARQDOR · arquitetura, inteligência e negócios</p>
              <h1 className="arq-hero-title">{title}</h1>
              {subtitle ? <p className="arq-subtitle">{subtitle}</p> : null}
            </div>

            <div className="arq-header-actions">
              {actions}
              <ArqdorThemeToggle />
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

export function ArqdorRenderShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="arq-render-workspace">{children}</div>;
}
