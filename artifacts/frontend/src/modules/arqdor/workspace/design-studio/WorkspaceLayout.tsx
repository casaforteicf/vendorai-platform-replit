import React from "react";
import { useStudio } from "./StudioContext";

type WorkspaceLayoutProps = {
  header: React.ReactNode;
  leftPanel: React.ReactNode;
  canvas: React.ReactNode;
  rightPanel: React.ReactNode;
  bottomPanel: React.ReactNode;
};

export function WorkspaceLayout({
  header,
  leftPanel,
  canvas,
  rightPanel,
  bottomPanel,
}: WorkspaceLayoutProps) {
  const { isRightPanelOpen } = useStudio();

  return (
    <div className="flex h-full min-h-[720px] flex-col overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
      {header}

      <div className="grid min-h-0 flex-1 grid-cols-[76px_1fr] bg-[#f7f7f8]">
        <aside className="border-r border-slate-100 bg-white">{leftPanel}</aside>

        <main
          className={[
            "grid min-w-0 grid-rows-[1fr_136px]",
            isRightPanelOpen ? "grid-cols-[1fr_340px]" : "grid-cols-[1fr_0px]",
          ].join(" ")}
        >
          <section className="min-w-0 overflow-hidden p-4">{canvas}</section>

          <aside className="overflow-hidden border-l border-slate-100 bg-white transition-all">
            {isRightPanelOpen ? rightPanel : null}
          </aside>

          <section className="col-span-full border-t border-slate-100 bg-white">
            {bottomPanel}
          </section>
        </main>
      </div>
    </div>
  );
}
