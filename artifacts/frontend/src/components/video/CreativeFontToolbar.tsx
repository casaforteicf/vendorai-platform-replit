import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Type } from "lucide-react";
import { getPublishedVendorFonts } from "@workspace/vendor-brain/font-catalog";

const STORAGE_KEY = "vendorai:creative-font-family";
const FALLBACK = "Inter";

declare global {
  interface Window {
    __vendorCreativeFontFamily?: string;
  }
}

function fontAssetName(sourceFile: string) {
  return `${sourceFile.replace(/\.(otf|ttf)$/i, "")}.woff2`;
}

const PUBLISHED_FONTS = getPublishedVendorFonts();

function installFontFaces() {
  const id = "vendorai-creative-font-faces";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = PUBLISHED_FONTS.map((font) => {
    const url = `/fonts/vendorai/${encodeURIComponent(fontAssetName(font.sourceFile))}`;
    return `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(url)}) format('woff2');font-style:normal;font-weight:normal;font-display:swap;}`;
  }).join("\n");
  // The Awaking family ships with three real weights, not a synthetic browser bold.
  if (PUBLISHED_FONTS.some((font) => font.id === "awaking")) {
    style.textContent += [
      "@font-face{font-family:'Awaking';src:url('/fonts/vendorai/awaking-light.woff2') format('woff2');font-weight:300;font-style:normal;font-display:swap;}",
      "@font-face{font-family:'Awaking';src:url('/fonts/vendorai/awaking-bold.woff2') format('woff2');font-weight:700;font-style:normal;font-display:swap;}",
    ].join("\n");
  }
  document.head.appendChild(style);
}

function patchCanvasFont() {
  if (typeof CanvasRenderingContext2D === "undefined") return () => undefined;
  const proto = CanvasRenderingContext2D.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "font");
  if (!descriptor?.get || !descriptor?.set) return () => undefined;

  const originalGet = descriptor.get;
  const originalSet = descriptor.set;
  Object.defineProperty(proto, "font", {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    get: originalGet,
    set(value: string) {
      const family = window.__vendorCreativeFontFamily;
      const next = family && family !== FALLBACK
        ? String(value).replace(/Inter\s*,\s*Arial\s*,\s*sans-serif/gi, `"${family}", Inter, Arial, sans-serif`)
        : value;
      originalSet.call(this, next);
    },
  });

  return () => Object.defineProperty(proto, "font", descriptor);
}

export default function CreativeFontToolbar() {
  const fonts = useMemo(() => [...PUBLISHED_FONTS].sort((a, b) => b.priority - a.priority), []);
  const storedFamily = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  const initialFamily = fonts.some((font) => font.family === storedFamily) ? storedFamily! : "Rigter";
  const [family, setFamily] = useState(initialFamily);

  useEffect(() => {
    installFontFaces();
    const restoreCanvas = patchCanvasFont();
    return restoreCanvas;
  }, []);

  useEffect(() => {
    window.__vendorCreativeFontFamily = family;
    localStorage.setItem(STORAGE_KEY, family);
    document.documentElement.style.setProperty("--vendor-creative-font", `"${family}", Inter, Arial, sans-serif`);
    document.fonts?.load?.(`24px "${family}"`).catch(() => undefined);
  }, [family]);

  return (
    <section className="rounded-2xl border bg-card px-4 py-3 shadow-sm sm:px-5" data-testid="creative-font-toolbar">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Type className="h-4 w-4" /></div>
          <div>
            <p className="font-semibold text-foreground">Tipografia dos criativos</p>
            <p className="mt-0.5 text-sm text-muted-foreground">A fonte escolhida é aplicada à prévia e à renderização dos textos e legendas deste projeto.</p>
          </div>
        </div>
        <label className="min-w-0 sm:w-[290px]">
          <span className="sr-only">Fonte do projeto</span>
          <select
            value={family}
            onChange={(event) => setFamily(event.target.value)}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary"
            style={{ fontFamily: `"${family}", Inter, Arial, sans-serif` } as CSSProperties}
          >
            {fonts.map((font) => (
              <option key={font.id} value={font.family}>{font.family} · {font.category}</option>
            ))}
            <option value="Inter">Inter · interface</option>
          </select>
        </label>
      </div>
      <style>{`[data-video-font-scope] div[style*="font-size"]{font-family:var(--vendor-creative-font,Inter,Arial,sans-serif)!important;}`}</style>
    </section>
  );
}
