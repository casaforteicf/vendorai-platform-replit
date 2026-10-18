import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Calendar,
  FolderOpen,
  Gauge,
  Handshake,
  Loader2,
  Phone,
  Radar,
  Settings2,
  Share2,
  ShoppingCart,
  Sparkles,
  Target,
  Users,
  Wrench,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const TYPE_LABELS: Record<string, string> = {
  recompra: "Recompra",
  cross_sell: "Cross-sell",
  reativacao: "Reativação",
  reativacao_sazonal: "Reativação sazonal",
  upgrade: "Upgrade",
  aniversario: "Relacionamento",
  follow_up: "Follow-up",
  renovacao: "Renovação",
  renovacao_seguro: "Renovação",
  manutencao: "Manutenção",
  sequencia_produto: "Próxima compra",
  grade_incompleta: "Complemento de grade",
  orcamento_parado: "Orçamento parado",
};

const STRATEGY_META: Record<string, { label: string; description: string; agent: string }> = {
  recompra: { label: "Recompra", description: "Detecta o momento provável de uma nova compra a partir do histórico real.", agent: "Relacionamento" },
  reativacao: { label: "Reativação", description: "Recupera clientes com histórico real que interromperam o relacionamento.", agent: "Reativação" },
  follow_up: { label: "Follow-up", description: "Encontra negociações que precisam de retorno antes de esfriar.", agent: "Follow-up" },
  orcamento_parado: { label: "Orçamento parado", description: "Retoma propostas e orçamentos sem conclusão sem tratar o lead como cliente.", agent: "Follow-up" },
  cross_sell: { label: "Cross-sell", description: "Sugere complementos coerentes com produtos, contexto e histórico.", agent: "Closer" },
  upgrade: { label: "Upgrade", description: "Identifica evolução de solução quando há aderência e benefício claro.", agent: "Closer" },
  renovacao: { label: "Renovação", description: "Antecipa contratos, serviços e ciclos que estão próximos do vencimento.", agent: "Closer" },
  manutencao: { label: "Manutenção", description: "Prevê manutenção recorrente e reduz risco de interrupção ou perda.", agent: "Relacionamento" },
  aniversario: { label: "Relacionamento", description: "Usa eventos de relacionamento apenas quando fizer sentido comercial.", agent: "Relacionamento" },
  sequencia_produto: { label: "Próxima compra", description: "Detecta a próxima etapa provável de compra com base no que já ocorreu.", agent: "Relacionamento" },
};

const STRATEGY_ORDER = [
  "orcamento_parado",
  "follow_up",
  "reativacao",
  "recompra",
  "cross_sell",
  "upgrade",
  "renovacao",
  "manutencao",
  "sequencia_produto",
  "aniversario",
];

const STRATEGY_ICONS: Record<string, typeof FolderOpen> = {
  orcamento_parado: FolderOpen,
  follow_up: Phone,
  reativacao: Users,
  recompra: ShoppingCart,
  cross_sell: Share2,
  upgrade: Gauge,
  renovacao: Calendar,
  manutencao: Wrench,
  sequencia_produto: ArrowRight,
  aniversario: Handshake,
};

const EXECUTION_MODES = [
  { value: "recommend", label: "Somente recomendar" },
  { value: "approval", label: "Exigir aprovação" },
  { value: "automatic", label: "Automático" },
] as const;

function executionModeFromAcao(acao: unknown): (typeof EXECUTION_MODES)[number]["value"] {
  const a = (acao && typeof acao === "object" ? acao : {}) as Record<string, unknown>;
  if (a.automaticContact === true || a.modo === "automatic" || a.mode === "automatic") return "automatic";
  return "recommend";
}

export function ScoutConfigPanel() { return null; }
