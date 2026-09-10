import { useMemo } from "react";
import { Download, Smartphone, Apple, MonitorSmartphone, QrCode } from "lucide-react";

const ANDROID_APK_URL = import.meta.env.VITE_ANDROID_APK_URL || "/downloads/vendorai.apk";
const IOS_APP_URL = import.meta.env.VITE_IOS_APP_URL || "";

function detectPlatform() {
  if (typeof navigator === "undefined") return "desktop" as const;
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android" as const;
  if (/iphone|ipad|ipod/.test(ua)) return "ios" as const;
  return "desktop" as const;
}

export default function DownloadApp() {
  const platform = useMemo(detectPlatform, []);
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";
  const qrUrl = currentUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(currentUrl)}`
    : "";

  return (
    <section className="bg-[#070b14] px-4 py-20 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D9673E]/15 text-[#D9673E]">
            <Smartphone className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Instale o Vendor.ai no seu celular</h1>
          <p className="mt-5 text-lg text-slate-300">
            Baixe o aplicativo para Android ou instale no iPhone usando a opção disponível para seu dispositivo.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#D9673E]/10 text-[#D9673E]">
              <Download className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold">Android</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Baixe o instalador oficial do Vendor.ai e conclua a instalação no aparelho.</p>
            <a
              href={ANDROID_APK_URL}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#D9673E] px-4 font-semibold text-white transition hover:brightness-110"
            >
              Baixar e instalar
            </a>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white">
              <Apple className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold">iPhone</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Use App Store/TestFlight quando o link estiver publicado.</p>
            {IOS_APP_URL ? (
              <a
                href={IOS_APP_URL}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/15 px-4 font-semibold text-white transition hover:bg-white/10"
              >
                Instalar no iPhone
              </a>
            ) : (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm text-slate-400">
                Distribuição iOS em preparação
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              <QrCode className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold">No computador</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Abra esta página no celular usando o QR Code.</p>
            {qrUrl && (
              <img src={qrUrl} alt="QR Code para baixar o app" className="mx-auto mt-5 h-40 w-40 rounded-xl bg-white p-2" />
            )}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
          <div className="flex items-start gap-3">
            <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-[#D9673E]" />
            <p>
              Dispositivo detectado: <strong className="text-slate-200">{platform === "android" ? "Android" : platform === "ios" ? "iPhone/iPad" : "Desktop"}</strong>. O site mantém as opções visíveis para que o usuário escolha manualmente quando necessário.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
