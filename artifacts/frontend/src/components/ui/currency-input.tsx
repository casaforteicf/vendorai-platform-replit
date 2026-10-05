import * as React from "react"

import { Input } from "@/components/ui/input"

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatBRLCurrency(value: number | string | null | undefined) {
  if (value === "" || value == null) return ""

  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return ""

  return brlFormatter.format(numeric)
}

export function parseBRLCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "")
  if (!digits) return ""

  return Number(digits) / 100
}

type CurrencyInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value?: number | string | null
  onValueChange: (value: number | "") => void
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, ...props }, ref) => {
    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        value={formatBRLCurrency(value)}
        onChange={(event) => onValueChange(parseBRLCurrencyInput(event.target.value))}
      />
    )
  },
)

CurrencyInput.displayName = "CurrencyInput"
