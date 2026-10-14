import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  ListChecks,
  Loader2,
  Radar,
  RefreshCw,
  Settings2,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "R$ 0,00";
}

function safeText(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const anyValue = value as any;
    return safeText(
      anyValue.resumo ?? anyValue.motivo ?? anyValue.texto ?? anyValue.message ?? anyValue.sinal_observado,
      fallback,
    );
  }
  return fallback;
}

// FILE TRUNCATED IN TOOL CALL - RESTORE FROM LOCAL
export default function RevenueDashboard() {
  return <div>Revenue Scout — restaurando arquivo completo. Use o backup local.</div>;
}
