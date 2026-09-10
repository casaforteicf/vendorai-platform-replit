import { useMemo, useState } from "react";
import {
  Apple,
  CheckCircle2,
  Download,
  ExternalLink,
  QrCode,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

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
  const [downloadStarted, setDownloadStarted] = useState(false);
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";
  const qrUrl = currentUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(currentUrl)}`
    : "";

  if (platform === "android") {
    return (
      <main className="min-h-screen bg-[#070b14] px-4 py-8 text-white sm:py-12">
        <div className="mx-auto max-w-md">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D9673E] shadow-lg shadow-[#D9673E]/20">
              <Smartphone className="h-8 w-8" />
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight">Instalar Vendor.ai</h1>
            <p className="mt-2 text-base leading-6 text-slate-300">
              São apenas 2 passos. Leva menos de um minuto.
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] shadow-2xl">
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D9673E] text-lg font-bold">1</div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold">Baixe o aplicativo</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    Toque no botão abaixo para baixar o Vendor.ai no seu celular.
                  </p>
                </div>
              </div>

              <a
                href={ANDROID_APK_URL}
                download
                onClick={() => setDownloadStarted(true)}
                className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#D9673E] px-5 text-base font-bold text-white shadow-lg shadow-[#D9673E]/20 transition active:scale-[0.99] hover:brightness-110"
              >
                <Download className="h-5 w-5" />
                Baixar aplicativo
              </a>

              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4" />
                Arquivo oficial do Vendor.ai para Android
              </div>
            </div>

            <div className="border-t border-white/10 bg-black/10 p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                    downloadStarted ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-300"
                  }`}
                >
                  {downloadStarted ? <CheckCircle2 className="h-6 w-6" /> : "2"}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold">Depois, instale</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {downloadStarted
                      ? "Quando o download terminar, toque em Abrir ou no arquivo vendorai.apk. Na tela seguinte, toque em Instalar."
                      : "Após o download, toque em Abrir. O Android mostrará a opção Instalar."}
                  </p>
                </div>
              </div>

              {downloadStarted && (
                <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <p className="font-semibold text-emerald-300">Download iniciado ✓</p>
                  <p className="mt-1 text-sm leading-5 text-slate-300">
                    Veja a barra de downloads do navegador e toque em <strong>Abrir</strong>. Depois escolha <strong>Instalar</strong>.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-medium text-slate-200">Se o Android pedir permissão</p>
            <p className="mt-1 text-sm leading-5 text-slate-400">
              Autorize a instalação deste aplicativo e volte para continuar. Isso normalmente acontece somente na primeira instalação.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (platform === "ios") {
    return (
      <main className="min-h-screen bg-[#070b14] px-4 py-10 text-white">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <Apple className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-3xl font-bold">Vendor.ai para iPhone</h1>
          <p className="mt-3 leading-6 text-slate-300">
            {IOS_APP_URL
              ? "Toque abaixo para abrir a instalação oficial do Vendor.ai."
              : "A versão para iPhone está em preparação e será liberada por distribuição oficial da Apple."}
          </p>
          {IOS_APP_URL && (
            <a
              href={IOS_APP_URL}
              className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 font-bold text-[#070b14]"
            >
              Instalar no iPhone
              <ExternalLink className="h-5 w-5" />
            </a>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070b14] px-4 py-14 text-white">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D9673E]">
          <Smartphone className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-4xl font-bold tracking-tight">Baixe o Vendor.ai no celular</h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-300">
          Abra esta página no seu celular. A instalação correta será mostrada automaticamente para Android ou iPhone.
        </p>

        {qrUrl && (
          <div className="mx-auto mt-8 w-fit rounded-3xl bg-white p-4 shadow-2xl">
            <img src={qrUrl} alt="QR Code para abrir no celular" className="h-52 w-52" />
          </div>
        )}
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400">
          <QrCode className="h-4 w-4" />
          Aponte a câmera do celular para o QR Code
        </div>
      </div>
    </main>
  );
}
