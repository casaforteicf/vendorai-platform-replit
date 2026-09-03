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
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_12px_35px_rgba(16,185,129,0.45)] transition hover:scale-105 hover:bg-emerald-400"
    >
      <MessageCircle className="h-7 w-7" fill="currentColor" strokeWidth={0} />
    </a>
  );
}
