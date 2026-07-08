export function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function productStatusClass(status: "publicado" | "rascunho" | "revisao" | "indisponivel") {
  const classes = {
    publicado: "bg-emerald-50 text-emerald-700",
    rascunho: "bg-slate-100 text-slate-700",
    revisao: "bg-amber-50 text-amber-700",
    indisponivel: "bg-rose-50 text-rose-700",
  } as const;
  return classes[status];
}

export function manufacturerStatusClass(status: "ativo" | "pendente" | "premium") {
  const classes = {
    ativo: "bg-blue-50 text-blue-700",
    pendente: "bg-amber-50 text-amber-700",
    premium: "bg-violet-50 text-violet-700",
  } as const;
  return classes[status];
}

export function assetStatusClass(status: "validado" | "pendente" | "desatualizado") {
  const classes = {
    validado: "bg-emerald-50 text-emerald-700",
    pendente: "bg-amber-50 text-amber-700",
    desatualizado: "bg-rose-50 text-rose-700",
  } as const;
  return classes[status];
}

export function orderStatusClass(status: "novo" | "processando" | "enviado" | "entregue" | "cancelado") {
  const classes = {
    novo: "bg-slate-100 text-slate-700",
    processando: "bg-violet-50 text-violet-700",
    enviado: "bg-blue-50 text-blue-700",
    entregue: "bg-emerald-50 text-emerald-700",
    cancelado: "bg-rose-50 text-rose-700",
  } as const;
  return classes[status];
}
