import { Input } from "@/components/ui/input";
import type { ComponentProps } from "react";

export function ensureBR(raw: string): string {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith("0")) return `+55${digits.slice(1)}`;
  return `+55${digits}`;
}

type Props = ComponentProps<typeof Input> & {
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

export function PhoneInput({ onBlur, onChange, ...props }: Props) {
  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const fixed = ensureBR(e.target.value);
    if (fixed !== e.target.value && onChange) {
      const syntheticEvent = {
        ...e,
        target: { ...e.target, value: fixed },
        currentTarget: { ...e.currentTarget, value: fixed },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
    onBlur?.(e);
  }

  return <Input type="tel" placeholder="+55 11 99999-9999" onBlur={handleBlur} onChange={onChange} {...props} />;
}
