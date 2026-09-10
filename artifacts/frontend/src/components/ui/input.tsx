import * as React from "react"

import { cn } from "@/lib/utils"
import "./professional-date-input.css"

const PROFESSIONAL_FIELD_BY_LABEL: Record<string, "name" | "month" | "day" | "profession"> = {
  "Nome da data profissional": "name",
  "Mês": "month",
  "Dia": "day",
  "Profissões relacionadas": "profession",
}

const MONTH_ABBREVIATIONS = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
] as const

function professionalFieldValue(
  field: "name" | "month" | "day" | "profession",
  value: React.ComponentProps<"input">["value"],
) {
  const raw = value == null ? "" : String(value)

  if (field === "month") {
    const month = Number(raw)
    return MONTH_ABBREVIATIONS[month - 1] ?? raw
  }

  if (field === "day") {
    const day = Number(raw)
    return Number.isFinite(day) && day > 0 ? String(day).padStart(2, "0") : raw
  }

  if (field === "profession") {
    const primaryProfession = raw.split(",")[0]?.trim()
    return primaryProfession ? `Detectado automaticamente: ${primaryProfession}` : "Profissão detectada automaticamente no cadastro"
  }

  return raw
}

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, forwardedRef) => {
    const internalRef = React.useRef<HTMLInputElement>(null)
    const ariaLabel = typeof props["aria-label"] === "string" ? props["aria-label"] : ""
    const professionalField = PROFESSIONAL_FIELD_BY_LABEL[ariaLabel]

    React.useImperativeHandle(forwardedRef, () => internalRef.current as HTMLInputElement)

    React.useEffect(() => {
      if (!professionalField || !internalRef.current) return

      // A tela de calendário ainda vive em ConfiguracoesLegacy. Marcamos o card
      // a partir dos aria-labels existentes para aplicar a apresentação nova sem
      // duplicar o formulário nem alterar o comportamento dos demais Inputs.
      const card = internalRef.current.closest("div.space-y-3.rounded-lg.border.p-3") as HTMLElement | null
      if (!card) return

      card.dataset.professionalDateCard = "true"
      const section = card.parentElement
      if (section) section.dataset.professionalDatesSection = "true"
    }, [professionalField])

    const displayedValue = professionalField
      ? professionalFieldValue(professionalField, props.value)
      : props.value

    return (
      <input
        {...props}
        type={professionalField ? "text" : type}
        value={displayedValue}
        readOnly={professionalField ? true : props.readOnly}
        data-professional-field={professionalField || undefined}
        className={cn(
          "flex h-10 w-full rounded-xl border border-input/90 bg-background/80 px-3.5 py-2 text-base shadow-[0_1px_2px_hsl(var(--primary)/0.05)] transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 hover:border-foreground/20 focus-visible:border-primary/45 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-60 md:text-sm",
          professionalField && "professional-date-field",
          className
        )}
        ref={internalRef}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
