import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export interface VendorBackButtonProps {
  /** Explicit parent route keeps navigation predictable on direct page entry. */
  to: string;
  label?: string;
  className?: string;
}

/** Shared 44px back control for secondary Vendor.ai screens. */
export function VendorBackButton({
  to,
  label = "Voltar",
  className,
}: VendorBackButtonProps) {
  const [, navigate] = useLocation();

  return (
    <Button
      type="button"
      variant="ghost"
      className={`min-h-11 justify-start px-3 ${className ?? ""}`}
      aria-label={label}
      onClick={() => navigate(to)}
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      <span>{label}</span>
    </Button>
  );
}
