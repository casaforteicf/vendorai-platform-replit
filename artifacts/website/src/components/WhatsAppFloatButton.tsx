import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "5549988164436";
const DEFAULT_MESSAGE = "Olá! Vim pelo site do Vendor.ai e quero saber mais.";

export function WhatsAppFloatButton() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(DEFAULT_MESSAGE)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      data-testid="btn-whatsapp-float"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-white/70 bg-emerald-500 text-white shadow-[0_10px_28px_rgba(16,185,129,0.35)] transition hover:scale-105 hover:bg-emerald-400 sm:bottom-5 sm:right-5 sm:h-14 sm:w-14"
    >
      <MessageCircle className="h-6 w-6 sm:h-7 sm:w-7" fill="currentColor" strokeWidth={0} />
    </a>
  );
}
