import { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useGetObra,
  useUpdateObra,
  useListObraEtapas,
  useCreateObraEtapa,
  useUpdateObraEtapa,
  useDeleteObraEtapa,
  useListObraEtapaMedicoes,
  useCreateObraEtapaMedicao,
  getListObraEtapaMedicoesQueryKey,
  useListObraDiario,
  useCreateObraDiario,
  useUpdateObraDiario,
  useDeleteObraDiario,
  useGetObraEstoque,
  useListObraOrcamentos,
  useCreateObraOrcamento,
  useGetObraOrcamento,
  useUpdateObraOrcamento,
  useDeleteObraOrcamento,
  useDuplicateObraOrcamento,
  useCreateOrcamentoEtapa,
  useUpdateOrcamentoEtapa,
  useDeleteOrcamentoEtapa,
  useCreateOrcamentoItem,
  useUpdateOrcamentoItem,
  useDeleteOrcamentoItem,
  useListInsumos,
  useListComposicoes,
  getGetObraQueryKey,
  getListObraEtapasQueryKey,
  getListObraDiarioQueryKey,
  getGetObraEstoqueQueryKey,
  getListObraOrcamentosQueryKey,
  getGetObraOrcamentoQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  HardHat, ArrowLeft, Plus, Calendar, DollarSign,
  ClipboardList, Package, ShoppingCart, BarChart3,
  CheckCircle2, Clock, PauseCircle, Pencil, Trash2,
  ChevronDown, ChevronUp, BookOpen, User, Building2,
  Upload, X, Image as ImageIcon, FileSpreadsheet, Copy,
  Send, ThumbsUp, ThumbsDown, ChevronRight, AlertCircle,
  Search, Loader2, FileText, Download, Sparkles,
  Zap, Sun, BatteryCharging, CarFront,
} from "lucide-react";
import TabFinanceiro from "./TabFinanceiro";
import EquipeProducao from "./EquipeProducao";
import RealProcurementWorkspace from "@/modules/arqdor/workspace/procurement-studio/RealProcurementWorkspace";
import { format, differenceInCalendarDays, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ObraEtapa, ObraDiario } from "@workspace/api-client-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, ReferenceLine,
} from "recharts";

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.FC<any> }> = {
  planejamento:  { label: "Planejamento",  color: "bg-slate-100 text-slate-700", icon: Clock },
  em_andamento:  { label: "Em andamento",  color: "bg-blue-100 text-blue-700",   icon: HardHat },
  pausada:       { label: "Pausada",       color: "bg-amber-100 text-amber-700", icon: PauseCircle },
  concluida:     { label: "Concluída",     color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  cancelada:     { label: "Cancelada",     color: "bg-red-100 text-red-700",     icon: Clock },
};

const ETAPA_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pendente:     { label: "Pendente",     color: "bg-slate-100 text-slate-600" },
  em_andamento: { label: "Em andamento", color: "bg-blue-100 text-blue-700" },
  concluida:    { label: "Concluída",    color: "bg-emerald-100 text-emerald-700" },
};


type EtapaTemplate = {
  nome: string;
  descricao: string;
  duracaoDias: number;
  responsavelSugerido: string;
};

const ETAPAS_ENGENHARIA: EtapaTemplate[] = [
  { nome: "Projeto e Engenharia", descricao: "Projetos, compatibilização, aprovações e planejamento executivo.", duracaoDias: 15, responsavelSugerido: "Engenharia" },
  { nome: "Serviços preliminares", descricao: "Canteiro, locação, limpeza, terraplenagem e preparação da obra.", duracaoDias: 7, responsavelSugerido: "Engenharia / Obra" },
  { nome: "Fundações", descricao: "Escavações, fundações, baldrame ou radier, impermeabilização e infraestrutura.", duracaoDias: 14, responsavelSugerido: "Engenharia / Obra" },
  { nome: "Estrutura e vedações", descricao: "Estrutura principal e sistema de vedação definido para o projeto.", duracaoDias: 25, responsavelSugerido: "Obra" },
  { nome: "Cobertura e impermeabilização", descricao: "Cobertura, lajes, telhado, rufos, calhas e impermeabilizações.", duracaoDias: 12, responsavelSugerido: "Obra" },
  { nome: "Instalações", descricao: "Instalações elétricas, hidráulicas, sanitárias, dados e climatização.", duracaoDias: 18, responsavelSugerido: "Instalações" },
  { nome: "Esquadrias", descricao: "Portas, janelas, vidros, portões e vedações complementares.", duracaoDias: 10, responsavelSugerido: "Obra" },
  { nome: "Revestimentos", descricao: "Regularizações, drywall, gesso, porcelanatos, pisos e revestimentos.", duracaoDias: 20, responsavelSugerido: "Acabamentos" },
  { nome: "Forros e pintura", descricao: "Forros, preparação de superfícies, massa, selador e pintura.", duracaoDias: 14, responsavelSugerido: "Acabamentos" },
  { nome: "Louças, metais e acabamentos", descricao: "Louças, metais, luminárias, tomadas, acessórios e acabamentos finais.", duracaoDias: 10, responsavelSugerido: "Acabamentos" },
  { nome: "Áreas externas", descricao: "Muros, calçadas, pavimentação, piscina, paisagismo e complementos.", duracaoDias: 15, responsavelSugerido: "Obra" },
  { nome: "Finalização e entrega", descricao: "Testes, checklist, limpeza final, correções, documentação e entrega.", duracaoDias: 7, responsavelSugerido: "Engenharia / Obra" },
];

const ETAPAS_MODELO_EMPRESA: EtapaTemplate[] = [
  { nome: "Projeto", descricao: "Definições, projetos, planejamento e liberações para execução.", duracaoDias: 12, responsavelSugerido: "Projetos" },
  { nome: "Preparação da obra", descricao: "Mobilização, locação, preparação do terreno e canteiro.", duracaoDias: 6, responsavelSugerido: "Obra" },
  { nome: "Infraestrutura e fundações", descricao: "Fundações e infraestrutura necessária antes da estrutura.", duracaoDias: 14, responsavelSugerido: "Obra" },
  { nome: "Estrutura", descricao: "Execução da estrutura e do sistema construtivo principal.", duracaoDias: 24, responsavelSugerido: "Obra" },
  { nome: "Instalações e fechamentos", descricao: "Instalações prediais, fechamentos, cobertura e esquadrias.", duracaoDias: 22, responsavelSugerido: "Obra" },
  { nome: "Acabamentos", descricao: "Revestimentos, forros, pintura, louças, metais e acabamentos.", duracaoDias: 24, responsavelSugerido: "Acabamentos" },
  { nome: "Área externa", descricao: "Calçadas, muros, paisagismo e demais serviços externos.", duracaoDias: 12, responsavelSugerido: "Obra" },
  { nome: "Entrega", descricao: "Vistoria, correções, limpeza, documentação e entrega ao cliente.", duracaoDias: 7, responsavelSugerido: "Engenharia / Obra" },
];

const DIARIO_STATUS: Record<string, { label: string; color: string }> = {
  rascunho:           { label: "Rascunho",         color: "bg-slate-100 text-slate-600" },
  pendente_aprovacao: { label: "Pend. aprovação",   color: "bg-amber-100 text-amber-700" },
  revisao:            { label: "Em revisão",        color: "bg-blue-100 text-blue-700" },
  aprovado:           { label: "Aprovado",          color: "bg-emerald-100 text-emerald-700" },
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

function fmtBRL(v?: string | number | null) {
  if (!v) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TABS = [
  { id: "visao-geral",  label: "Visão Geral",   icon: BarChart3 },
  { id: "cronograma",   label: "Cronograma",     icon: Calendar },
  { id: "medicoes",     label: "Medições",       icon: ClipboardList },
  { id: "diario",       label: "Diário de Obra", icon: BookOpen },
  { id: "equipe-producao", label: "Equipe & Produção", icon: User },
  { id: "financeiro",   label: "Financeiro",     icon: DollarSign },
  { id: "estoque",      label: "Estoque",        icon: Package },
  { id: "compras",      label: "Compras",        icon: ShoppingCart },
  { id: "orcamento",    label: "Orçamento",      icon: FileSpreadsheet },
  { id: "energia",       label: "Energia",        icon: Zap },
];

function MobileTabDropdown({ activeTab, onSelect }: { activeTab: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const active = TABS.find((t) => t.id === activeTab)!;
  return (
    <div className="sm:hidden relative">
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 border rounded-lg bg-background text-sm font-medium"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <active.icon className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 text-left text-foreground">{active.label}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-background border rounded-lg shadow-lg overflow-hidden">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { onSelect(tab.id); setOpen(false); }}
              className={`flex items-center gap-3 w-full px-4 py-3 text-sm text-left transition-colors hover:bg-muted ${
                activeTab === tab.id ? "bg-primary/5 text-primary font-medium" : "text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function VisaoGeral({ obra, etapas }: { obra: any; etapas: ObraEtapa[] }) {
  const pctOrc = obra.orcamentoTotal
    ? Math.min(100, (parseFloat(obra.custoRealizado ?? "0") / parseFloat(obra.orcamentoTotal)) * 100)
    : null;

  const etapasConcluidas = etapas.filter((e) => e.status === "concluida").length;
  const pctEtapas = etapas.length > 0 ? (etapasConcluidas / etapas.length) * 100 : 0;

  const progressoMedio = etapas.length > 0
    ? etapas.reduce((s, e) => s + parseFloat(e.percentualExecutado ?? "0"), 0) / etapas.length
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Progresso médio", value: `${progressoMedio.toFixed(1)}%`, color: "text-blue-600" },
          { label: "Etapas concluídas", value: `${etapasConcluidas}/${etapas.length}`, color: "text-emerald-600" },
          { label: "Orçamento", value: fmtBRL(obra.orcamentoTotal), color: "text-slate-700" },
          { label: "Custo realizado", value: fmtBRL(obra.custoRealizado), color: pctOrc && pctOrc > 90 ? "text-red-600" : "text-slate-700" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground mb-1">{kpi.label}</div>
              <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Progresso das etapas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Progress value={pctEtapas} className="h-2" />
            <p className="text-xs text-muted-foreground">{etapasConcluidas} de {etapas.length} etapas concluídas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Consumo de orçamento</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pctOrc !== null ? (
              <>
                <Progress value={pctOrc} className={`h-2 ${pctOrc > 100 ? "[&>div]:bg-red-500" : pctOrc > 80 ? "[&>div]:bg-amber-400" : ""}`} />
                <p className="text-xs text-muted-foreground">{pctOrc.toFixed(1)}% do orçamento utilizado</p>
              </>
            ) : <p className="text-xs text-muted-foreground">Orçamento não definido</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Dados da obra</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-y-2 text-sm">
          {[
            { label: "Cliente", value: obra.clienteNome },
            { label: "Contato", value: obra.clienteContato },
            { label: "Endereço", value: obra.endereco },
            { label: "Início", value: fmt(obra.dataInicio) },
            { label: "Prev. término", value: fmt(obra.dataFimPrevista) },
            { label: "Término real", value: fmt(obra.dataFimReal) },
          ].map((r) => (
            <div key={r.label} className="flex gap-2">
              <span className="text-muted-foreground w-28 shrink-0">{r.label}:</span>
              <span>{r.value ?? "—"}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Gantt helpers ─────────────────────────────────────────────────────────────

const GANTT_COLORS: Record<string, string> = {
  concluida:    "#10b981",
  em_andamento: "#6366f1",
  pendente:     "#94a3b8",
  pausada:      "#f59e0b",
};

function parseDate(d?: string | null) {
  if (!d) return null;
  return parseISO(d + "T12:00:00");
}

function ganttDays(a: Date | null, b: Date | null) {
  if (!a || !b) return 0;
  return Math.max(1, differenceInCalendarDays(b, a));
}

interface GanttRow {
  id: string;
  nome: string;
  shortNome: string;
  offset: number;
  duration: number;
  pct: number;
  status: string;
  inicio: string | null | undefined;
  fim: string | null | undefined;
  inicioReal: string | null | undefined;
  fimReal: string | null | undefined;
  responsavel: string | null | undefined;
  etapa: ObraEtapa;
}

interface GanttBarShapeProps {
  x?: number; y?: number; width?: number; height?: number;
  payload?: GanttRow;
}

function GanttBarShape({ x = 0, y = 0, width = 0, height = 0, payload }: GanttBarShapeProps) {
  if (!payload || width <= 0) return null;
  const color = GANTT_COLORS[payload.status] ?? "#94a3b8";
  const pctW = Math.max(0, Math.min(width, width * (payload.pct / 100)));
  const r = 4;

  return (
    <g>
      {/* Background bar (full duration) */}
      <rect x={x} y={y + 3} width={width} height={height - 6} fill={color} fillOpacity={0.25} rx={r} />
      {/* Progress fill */}
      {pctW > 0 && (
        <rect x={x} y={y + 3} width={pctW} height={height - 6} fill={color} fillOpacity={0.9} rx={r} />
      )}
      {/* Percentage label (only if bar is wide enough) */}
      {width >= 36 && (
        <text
          x={x + width / 2} y={y + height / 2 + 1}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={10} fontWeight="600" fill={payload.pct > 40 ? "#fff" : color}
        >
          {Math.round(payload.pct)}%
        </text>
      )}
    </g>
  );
}

// Transparent offset shape (spacer)
function OffsetShape() { return null; }

interface GanttTooltipProps { active?: boolean; payload?: any[] }
function GanttTooltip({ active, payload }: GanttTooltipProps) {
  if (!active || !payload?.length) return null;
  const row: GanttRow = payload.find((p: any) => p.dataKey === "duration")?.payload;
  if (!row) return null;
  const color = GANTT_COLORS[row.status] ?? "#94a3b8";
  const statusLabel = ETAPA_STATUS_MAP[row.status]?.label ?? row.status;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-xs min-w-[180px]">
      <p className="font-semibold mb-1 text-sm">{row.nome}</p>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-muted-foreground">{statusLabel}</span>
      </div>
      <div className="space-y-0.5 text-muted-foreground">
        <p>Início: <span className="font-medium text-foreground">{fmt(row.inicio)}</span></p>
        <p>Fim: <span className="font-medium text-foreground">{fmt(row.fim)}</span></p>
        <p>Duração: <span className="font-medium text-foreground">{row.duration} dias</span></p>
        <p>Progresso: <span className="font-medium text-foreground">{Math.round(row.pct)}%</span></p>
        {row.responsavel && <p>Responsável: <span className="font-medium text-foreground">{row.responsavel}</span></p>}
      </div>
    </div>
  );
}

// ─── DraggableGantt ────────────────────────────────────────────────────────────

interface DraggableGanttProps {
  ganttRows: GanttRow[];
  totalDays: number;
  projectStart: Date;
  todayOffset: number;
  onUpdateDates: (etapaId: string, newStart: string, newEnd: string) => void;
}

function DraggableGantt({ ganttRows, totalDays, projectStart, todayOffset, onUpdateDates }: DraggableGanttProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState(0);
  const dragRef = useRef<{
    rowId: string;
    mode: "move" | "left" | "right";
    startX: number;
    origOffset: number;
    origDuration: number;
    prevOffset: number;
    prevDuration: number;
  } | null>(null);

  const LABEL_W = 140;
  const ROW_H = 44;

  function startDrag(e: React.MouseEvent, row: GanttRow, mode: "move" | "left" | "right") {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      rowId: row.id,
      mode,
      startX: e.clientX,
      origOffset: row.offset,
      origDuration: row.duration,
      prevOffset: row.offset,
      prevDuration: row.duration,
    };
    forceUpdate((n) => n + 1);

    function onMove(me: MouseEvent) {
      if (!dragRef.current || !containerRef.current) return;
      const pw = containerRef.current.getBoundingClientRect().width - LABEL_W;
      if (pw <= 0) return;
      const pxPerDay = pw / totalDays;
      const dx = me.clientX - dragRef.current.startX;
      const dd = Math.round(dx / pxPerDay);
      const { mode: m, origOffset, origDuration } = dragRef.current;
      let newOffset = origOffset;
      let newDuration = origDuration;
      if (m === "move") {
        newOffset = Math.max(0, origOffset + dd);
      } else if (m === "left") {
        newOffset = Math.max(0, Math.min(origOffset + dd, origOffset + origDuration - 1));
        newDuration = origDuration - (newOffset - origOffset);
      } else {
        newDuration = Math.max(1, origDuration + dd);
      }
      dragRef.current.prevOffset = newOffset;
      dragRef.current.prevDuration = newDuration;
      forceUpdate((n) => n + 1);
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!dragRef.current) return;
      const { rowId, prevOffset, prevDuration } = dragRef.current;
      dragRef.current = null;
      const newStart = addDays(projectStart, prevOffset);
      const newEnd = addDays(newStart, prevDuration);
      onUpdateDates(rowId, format(newStart, "yyyy-MM-dd"), format(newEnd, "yyyy-MM-dd"));
      forceUpdate((n) => n + 1);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const tickCount = Math.min(8, totalDays);
  const tickStep = Math.max(1, Math.ceil(totalDays / tickCount));
  const ticks: number[] = [];
  for (let t = 0; t <= totalDays; t += tickStep) ticks.push(t);
  if (ticks[ticks.length - 1] !== totalDays) ticks.push(totalDays);

  return (
    <div className="w-full select-none">
      {/* X-axis header */}
      <div className="flex text-[10px] text-muted-foreground mb-1" style={{ paddingLeft: `${LABEL_W}px` }}>
        <div className="relative flex-1 h-5 overflow-hidden">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(t / totalDays) * 100}%` }}>
              {format(addDays(projectStart, Math.min(t, totalDays - 1)), "dd/MM", { locale: ptBR })}
            </span>
          ))}
        </div>
      </div>

      {/* Grid + bars */}
      <div ref={containerRef} className="border rounded-lg overflow-hidden bg-white dark:bg-card">
        {ganttRows.map((row, idx) => {
          const drag = dragRef.current?.rowId === row.id ? dragRef.current : null;
          const dispOffset = drag ? drag.prevOffset : row.offset;
          const dispDuration = drag ? drag.prevDuration : row.duration;
          const color = GANTT_COLORS[row.status] ?? "#94a3b8";
          const lPct = (dispOffset / totalDays) * 100;
          const wPct = Math.max(0.5, (dispDuration / totalDays) * 100);
          const isDragging = !!drag;

          return (
            <div
              key={row.id}
              className={`flex items-center ${idx < ganttRows.length - 1 ? "border-b border-muted/50" : ""}`}
              style={{ height: `${ROW_H}px` }}
            >
              {/* Label */}
              <div
                className="shrink-0 flex items-center px-2 text-xs font-medium text-slate-700 dark:text-slate-300 border-r border-muted/50 bg-muted/20 h-full"
                style={{ width: `${LABEL_W}px` }}
              >
                <span className="truncate">{row.shortNome}</span>
              </div>

              {/* Timeline */}
              <div className="relative flex-1 h-full">
                {ticks.map((t) => (
                  <div key={t} className="absolute top-0 bottom-0 border-l border-muted/30" style={{ left: `${(t / totalDays) * 100}%` }} />
                ))}
                {todayOffset >= 0 && todayOffset <= totalDays && (
                  <div className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none" style={{ left: `${(todayOffset / totalDays) * 100}%` }} />
                )}
                {/* Bar */}
                <div
                  title={`${row.nome} — Arraste para mover • Bordas para redimensionar`}
                  className={`absolute top-1/2 -translate-y-1/2 h-7 rounded flex items-center overflow-visible cursor-grab active:cursor-grabbing ${isDragging ? "ring-2 ring-white ring-offset-1 z-20 shadow-lg" : "hover:brightness-110"}`}
                  style={{
                    left: `${lPct}%`,
                    width: `${wPct}%`,
                    backgroundColor: color,
                    opacity: 0.88,
                    minWidth: "6px",
                    transition: isDragging ? "none" : "opacity 0.15s",
                  }}
                  onMouseDown={(e) => startDrag(e, row, "move")}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l flex items-center justify-center hover:bg-black/15" onMouseDown={(e) => startDrag(e, row, "left")}>
                    <div className="w-px h-3.5 bg-white/70 rounded" />
                  </div>
                  <div className="absolute top-0 left-0 bottom-0 rounded pointer-events-none" style={{ width: `${row.pct}%`, backgroundColor: "rgba(0,0,0,0.15)" }} />
                  {wPct > 6 && (
                    <span className="text-white text-[10px] font-bold mx-auto pointer-events-none z-10 relative">{Math.round(row.pct)}%</span>
                  )}
                  <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r flex items-center justify-center hover:bg-black/15" onMouseDown={(e) => startDrag(e, row, "right")}>
                    <div className="w-px h-3.5 bg-white/70 rounded" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drag preview */}
      {dragRef.current && (() => {
        const d = dragRef.current!;
        const s = addDays(projectStart, d.prevOffset);
        const eDate = addDays(s, d.prevDuration);
        const row = ganttRows.find((r) => r.id === d.rowId);
        return (
          <p className="text-xs text-center text-primary font-medium mt-2">
            <Sparkles className="inline h-3 w-3 mr-1" />
            {row?.nome}: {format(s, "dd/MM/yyyy", { locale: ptBR })} → {format(eDate, "dd/MM/yyyy", { locale: ptBR })} ({d.prevDuration} dias)
          </p>
        );
      })()}

      {/* Hint */}
      {!dragRef.current && (
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          Arraste as barras para mover etapas · Bordas para ajustar início/fim
        </p>
      )}
    </div>
  );
}

// ─── Cronograma (Gantt) ────────────────────────────────────────────────────────

function Cronograma({ tenantId, obraId, etapas, portalToken }: { tenantId: string; obraId: string; etapas: ObraEtapa[]; portalToken?: string | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editEtapa, setEditEtapa] = useState<ObraEtapa | null>(null);
  const [form, setForm] = useState({ nome: "", dataInicioPrevista: "", dataFimPrevista: "", responsavel: "", status: "pendente" });
  const [view, setView] = useState<"gantt" | "lista">("gantt");
  const [etapaMode, setEtapaMode] = useState<"engenharia" | "empresa" | "manual">("engenharia");
  const [sequenceStart, setSequenceStart] = useState("");
  const [isCreatingSequence, setIsCreatingSequence] = useState(false);

  const { mutateAsync: createEtapa, isPending: isCreating } = useCreateObraEtapa();
  const { mutateAsync: updateEtapa, isPending: isSaving } = useUpdateObraEtapa();
  const { mutateAsync: deleteEtapa } = useDeleteObraEtapa();

  const etapaTemplates = etapaMode === "engenharia"
    ? ETAPAS_ENGENHARIA
    : etapaMode === "empresa"
      ? ETAPAS_MODELO_EMPRESA
      : [];

  function resetCreateDialog() {
    setForm({ nome: "", dataInicioPrevista: "", dataFimPrevista: "", responsavel: "", status: "pendente" });
    setSequenceStart("");
    setEtapaMode("engenharia");
  }

  function selectTemplate(template: EtapaTemplate) {
    setForm((current) => ({
      ...current,
      nome: template.nome,
      responsavel: template.responsavelSugerido,
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) return;
    await createEtapa({ tenantId, obraId, data: { ...form, nome: form.nome.trim(), ordem: etapas.length } as any });
    await qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) });
    setAddOpen(false);
    resetCreateDialog();
    toast({ title: "Etapa adicionada", description: "A etapa foi incluída no cronograma da obra." });
  }

  async function handleCreateSequence() {
    if (etapaMode === "manual" || etapaTemplates.length === 0) return;

    const normalizeName = (value: string) =>
      value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

    const existing = new Set(etapas.map((etapa) => normalizeName(etapa.nome)));
    const missing = etapaTemplates.filter((template) => !existing.has(normalizeName(template.nome)));

    if (missing.length === 0) {
      toast({ title: "Sequência já cadastrada", description: "Todas as etapas deste modelo já estão na obra." });
      return;
    }

    setIsCreatingSequence(true);
    try {
      let currentDate = sequenceStart ? parseISO(sequenceStart + "T12:00:00") : null;
      let created = 0;

      for (const template of missing) {
        const start = currentDate ? format(currentDate, "yyyy-MM-dd") : "";
        const endDate = currentDate ? addDays(currentDate, Math.max(1, template.duracaoDias - 1)) : null;
        const end = endDate ? format(endDate, "yyyy-MM-dd") : "";

        await createEtapa({
          tenantId,
          obraId,
          data: {
            nome: template.nome,
            responsavel: template.responsavelSugerido,
            status: "pendente",
            ordem: etapas.length + created,
            dataInicioPrevista: start,
            dataFimPrevista: end,
          } as any,
        });

        created += 1;
        if (endDate) currentDate = addDays(endDate, 1);
      }

      await qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) });
      setAddOpen(false);
      resetCreateDialog();
      toast({
        title: "Cronograma-base criado",
        description: `${created} etapa${created === 1 ? "" : "s"} adicionada${created === 1 ? "" : "s"} com a sequência selecionada.`,
      });
    } catch {
      await qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) });
      toast({ title: "Erro ao criar sequência", description: "As etapas já criadas foram mantidas. Confira o cronograma e tente novamente.", variant: "destructive" });
    } finally {
      setIsCreatingSequence(false);
    }
  }

  async function handleUpdate() {
    if (!editEtapa) return;
    await updateEtapa({ tenantId, obraId, etapaId: editEtapa.id, data: editEtapa as any });
    await qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) });
    setEditEtapa(null);
  }

  async function handleUpdateDates(etapaId: string, newStart: string, newEnd: string) {
    try {
      await updateEtapa({ tenantId, obraId, etapaId, data: { dataInicioPrevista: newStart, dataFimPrevista: newEnd } as any });
      await qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) });
      toast({ title: "Cronograma atualizado", description: `${fmt(newStart)} → ${fmt(newEnd)}` });
    } catch {
      toast({ title: "Erro ao salvar datas", variant: "destructive" });
    }
  }

  // ── Gantt data preparation ─────────────────────────────────────────────────
  const etapasComDatas = etapas.filter((e) => e.dataInicioPrevista && e.dataFimPrevista);
  const etapasSemDatas = etapas.filter((e) => !e.dataInicioPrevista || !e.dataFimPrevista);

  const allStarts = etapasComDatas.map((e) => parseDate(e.dataInicioPrevista)!);
  const allEnds   = etapasComDatas.map((e) => parseDate(e.dataFimPrevista)!);
  const projectStart = allStarts.length ? allStarts.reduce((m, d) => d < m ? d : m) : new Date();
  const projectEnd   = allEnds.length   ? allEnds.reduce((m, d) => d > m ? d : m)   : new Date();
  const totalDays    = Math.max(1, ganttDays(projectStart, projectEnd));

  const ganttRows: GanttRow[] = etapasComDatas.map((e) => {
    const start = parseDate(e.dataInicioPrevista)!;
    const end   = parseDate(e.dataFimPrevista)!;
    return {
      id:          e.id,
      nome:        e.nome,
      shortNome:   e.nome.length > 22 ? e.nome.slice(0, 21) + "…" : e.nome,
      offset:      ganttDays(projectStart, start),
      duration:    ganttDays(start, end),
      pct:         parseFloat(e.percentualExecutado ?? "0"),
      status:      e.status,
      inicio:      e.dataInicioPrevista,
      fim:         e.dataFimPrevista,
      inicioReal:  e.dataInicioReal,
      fimReal:     e.dataFimReal,
      responsavel: e.responsavel,
      etapa:       e,
    };
  });

  // Tick formatter: day offset → date label
  const xTickFormatter = (dayOffset: number) => {
    if (!allStarts.length) return "";
    const d = addDays(projectStart, dayOffset);
    return format(d, "dd/MM", { locale: ptBR });
  };

  // Today reference line offset
  const todayOffset = ganttDays(projectStart, new Date());

  // Bar height per row
  const ROW_H = 44;
  const chartHeight = Math.max(200, ganttRows.length * ROW_H + 60);

  function copyCronogramaLink() {
    if (!portalToken) return;
    const url = `${window.location.origin}/portal/obra/${portalToken}?tab=cronograma`;
    navigator.clipboard.writeText(url)
      .then(() => toast({ title: "Link do Cronograma copiado!", description: "Cole e compartilhe com o cliente." }))
      .catch(() => toast({ title: "Não foi possível copiar", description: url, variant: "destructive" }));
  }

  return (
    <div className="space-y-4 pt-1">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {allEnds.length > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Conclusão prevista:</span>
              <span className="font-semibold text-foreground">{fmt(format(projectEnd, "yyyy-MM-dd"))}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {portalToken && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={copyCronogramaLink}>
              <Copy className="h-3.5 w-3.5" />
              Copiar link do Cronograma
            </Button>
          )}
          {/* View toggle */}
          <div className="flex border rounded-md overflow-hidden text-xs">
            <button
              className={`px-3 py-1.5 font-medium transition-colors ${view === "gantt" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setView("gantt")}
            >
              Gantt
            </button>
            <button
              className={`px-3 py-1.5 font-medium transition-colors ${view === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setView("lista")}
            >
              Lista
            </button>
          </div>
          <Dialog
            open={addOpen}
            onOpenChange={(open) => {
              setAddOpen(open);
              if (!open) resetCreateDialog();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />Adicionar etapa</Button>
            </DialogTrigger>
            <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Adicionar etapa</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Comece por uma sequência técnica ou crie uma etapa livre</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        A prévia ajuda a manter a ordem de execução da obra. Você pode ajustar nomes, datas e responsáveis antes ou depois.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button type="button" variant={etapaMode === "engenharia" ? "default" : "outline"} onClick={() => setEtapaMode("engenharia")} className="justify-start">
                    <HardHat className="h-4 w-4 mr-2" /> Engenharia
                  </Button>
                  <Button type="button" variant={etapaMode === "empresa" ? "default" : "outline"} onClick={() => setEtapaMode("empresa")} className="justify-start">
                    <ClipboardList className="h-4 w-4 mr-2" /> Modelo da empresa
                  </Button>
                  <Button type="button" variant={etapaMode === "manual" ? "default" : "outline"} onClick={() => setEtapaMode("manual")} className="justify-start">
                    <Plus className="h-4 w-4 mr-2" /> Em branco
                  </Button>
                </div>

                {etapaMode !== "manual" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold">
                          {etapaMode === "engenharia" ? "Sequência recomendada pela engenharia" : "Sequência padrão da empresa"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Clique em uma etapa para usar individualmente ou crie a sequência completa.
                        </p>
                      </div>
                      <Badge variant="outline">{etapaTemplates.length} etapas</Badge>
                    </div>

                    <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
                      {etapaTemplates.map((template, index) => {
                        const alreadyExists = etapas.some((etapa) =>
                          etapa.nome.localeCompare(template.nome, "pt-BR", { sensitivity: "base" }) === 0
                        );
                        const selected = form.nome === template.nome;
                        return (
                          <button
                            key={template.nome}
                            type="button"
                            disabled={alreadyExists}
                            onClick={() => selectTemplate(template)}
                            className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                              alreadyExists
                                ? "opacity-50 bg-muted/30 cursor-not-allowed"
                                : selected
                                  ? "border-primary bg-primary/5"
                                  : "hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`h-6 w-6 rounded-full border flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                                selected ? "border-primary text-primary" : "text-muted-foreground"
                              }`}>
                                {index + 1}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{template.nome}</span>
                                  {alreadyExists && <Badge variant="secondary" className="text-[10px]">Já cadastrada</Badge>}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{template.descricao}</p>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  Referência: {template.duracaoDias} dias · {template.responsavelSugerido}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end rounded-lg border p-3 bg-muted/20">
                      <div className="space-y-1.5">
                        <Label>Início da sequência completa <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                        <Input type="date" value={sequenceStart} onChange={(e) => setSequenceStart(e.target.value)} />
                        <p className="text-[11px] text-muted-foreground">
                          Se informar a data, o sistema distribui as etapas em sequência usando as durações de referência.
                        </p>
                      </div>
                      <Button type="button" onClick={handleCreateSequence} disabled={isCreatingSequence || isCreating}>
                        {isCreatingSequence ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando…</> : "Criar sequência completa"}
                      </Button>
                    </div>
                  </div>
                )}

                <form onSubmit={handleCreate} className="space-y-4 border-t pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{etapaMode === "manual" ? "Nova etapa personalizada" : "Etapa selecionada"}</p>
                    {etapaMode !== "manual" && form.nome && <Badge variant="outline">Pode editar antes de salvar</Badge>}
                  </div>
                  <div className="space-y-2">
                    <Label>Nome *</Label>
                    <Input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex.: Fundações, Estrutura, Instalações..." />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Início previsto</Label>
                      <Input type="date" value={form.dataInicioPrevista} onChange={(e) => setForm((f) => ({ ...f, dataInicioPrevista: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim previsto</Label>
                      <Input type="date" value={form.dataFimPrevista} onChange={(e) => setForm((f) => ({ ...f, dataFimPrevista: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Responsável</Label>
                    <Input value={form.responsavel} onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} placeholder="Responsável pela etapa" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={isCreating || isCreatingSequence || !form.nome.trim()}>
                      {isCreating ? "Salvando…" : "Adicionar somente esta etapa"}
                    </Button>
                  </div>
                </form>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {etapas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p className="text-sm">Nenhuma etapa cadastrada.</p>
          <p className="text-xs mt-1">Clique em "Adicionar etapa" para começar o cronograma.</p>
        </div>
      ) : view === "gantt" ? (
        <div className="space-y-4">
          {/* ── Gantt chart ── */}
          {ganttRows.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p>Nenhuma etapa com datas definidas.</p>
              <p className="text-xs mt-1">Edite as etapas para definir início e fim previstos.</p>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                {/* Legend */}
                <div className="flex items-center gap-4 mb-3 flex-wrap text-xs text-muted-foreground">
                  {Object.entries(GANTT_COLORS).map(([status, color]) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color, opacity: 0.9 }} />
                      <span>{ETAPA_STATUS_MAP[status]?.label ?? status}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 inline-block bg-red-400" />
                    <span>Hoje</span>
                  </div>
                </div>
                <DraggableGantt
                  ganttRows={ganttRows}
                  totalDays={totalDays}
                  projectStart={projectStart}
                  todayOffset={todayOffset}
                  onUpdateDates={handleUpdateDates}
                />
              </CardContent>
            </Card>
          )}

          {/* ── Summary table ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Resumo das etapas</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-3 font-medium">Etapa</th>
                      <th className="text-center py-2 px-2 font-medium whitespace-nowrap">Status</th>
                      <th className="text-center py-2 px-2 font-medium whitespace-nowrap">Início prev.</th>
                      <th className="text-center py-2 px-2 font-medium whitespace-nowrap">Fim prev.</th>
                      <th className="text-right py-2 px-2 font-medium whitespace-nowrap">Dias</th>
                      <th className="text-right py-2 px-2 font-medium whitespace-nowrap">% Conc.</th>
                      <th className="text-center py-2 pl-2 font-medium">Responsável</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {etapas.map((etapa) => {
                      const pct = parseFloat(etapa.percentualExecutado ?? "0");
                      const dias = etapa.dataInicioPrevista && etapa.dataFimPrevista
                        ? ganttDays(parseDate(etapa.dataInicioPrevista), parseDate(etapa.dataFimPrevista))
                        : null;
                      const st = ETAPA_STATUS_MAP[etapa.status];
                      const color = GANTT_COLORS[etapa.status] ?? "#94a3b8";

                      return (
                        <tr key={etapa.id} className="border-b hover:bg-muted/10 group">
                          <td className="py-2 pr-3 font-medium">{etapa.nome}</td>
                          <td className="py-2 px-2 text-center">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${st?.color ?? "bg-muted"}`}>{st?.label ?? etapa.status}</span>
                          </td>
                          <td className="py-2 px-2 text-center text-muted-foreground">{fmt(etapa.dataInicioPrevista)}</td>
                          <td className="py-2 px-2 text-center text-muted-foreground">{fmt(etapa.dataFimPrevista)}</td>
                          <td className="py-2 px-2 text-right">{dias ?? "—"}</td>
                          <td className="py-2 px-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                              </div>
                              <span className="w-8 text-right font-mono">{pct.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center text-muted-foreground">{etapa.responsavel ?? "—"}</td>
                          <td className="py-2 pl-2">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                              <button onClick={() => setEditEtapa(etapa)} className="text-muted-foreground hover:text-foreground p-0.5">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button className="text-muted-foreground hover:text-red-600 p-0.5">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Excluir etapa?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={async () => { await deleteEtapa({ tenantId, obraId, etapaId: etapa.id }); qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) }); }}>Excluir</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {etapasSemDatas.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {etapasSemDatas.length} etapa{etapasSemDatas.length > 1 ? "s" : ""} sem datas definidas — clique no lápis para editar.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ── Lista view (original) ── */
        <div className="space-y-2">
          {etapas.map((etapa, idx) => {
            const statusInfo = ETAPA_STATUS_MAP[etapa.status] ?? { label: etapa.status, color: "bg-muted" };
            const pct = parseFloat(etapa.percentualExecutado ?? "0");

            return (
              <Card key={etapa.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground w-5">{idx + 1}.</span>
                        <span className="font-medium">{etapa.nome}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditEtapa(etapa)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Excluir etapa?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={async () => { await deleteEtapa({ tenantId, obraId, etapaId: etapa.id }); qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) }); }}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Previsto: {fmt(etapa.dataInicioPrevista)} → {fmt(etapa.dataFimPrevista)}</span>
                      {etapa.dataInicioReal && <span>Real: {fmt(etapa.dataInicioReal)} → {fmt(etapa.dataFimReal)}</span>}
                      {etapa.responsavel && <span className="flex items-center gap-1"><User className="h-3 w-3" />{etapa.responsavel}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className={`h-2 flex-1 ${pct >= 100 ? "[&>div]:bg-emerald-500" : ""}`} />
                      <span className="text-xs font-mono w-10 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Edit Etapa Dialog ── */}
      <Dialog open={!!editEtapa} onOpenChange={(o) => !o && setEditEtapa(null)}>
        <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar etapa</DialogTitle>
          </DialogHeader>
          {editEtapa && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-1 sm:col-span-2 space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={editEtapa.nome} onChange={(e) => setEditEtapa((p) => p ? { ...p, nome: e.target.value } : p)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    value={editEtapa.status}
                    onChange={(e) => setEditEtapa((p) => p ? { ...p, status: e.target.value } : p)}
                  >
                    {Object.entries(ETAPA_STATUS_MAP).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Responsável</Label>
                  <Input value={editEtapa.responsavel ?? ""} onChange={(e) => setEditEtapa((p) => p ? { ...p, responsavel: e.target.value } : p)} />
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Datas previstas</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Início previsto</Label>
                    <Input type="date" value={editEtapa.dataInicioPrevista ?? ""} onChange={(e) => setEditEtapa((p) => p ? { ...p, dataInicioPrevista: e.target.value } : p)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fim previsto</Label>
                    <Input type="date" value={editEtapa.dataFimPrevista ?? ""} onChange={(e) => setEditEtapa((p) => p ? { ...p, dataFimPrevista: e.target.value } : p)} />
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Datas reais</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Início real</Label>
                    <Input type="date" value={editEtapa.dataInicioReal ?? ""} onChange={(e) => setEditEtapa((p) => p ? { ...p, dataInicioReal: e.target.value } : p)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fim real</Label>
                    <Input type="date" value={editEtapa.dataFimReal ?? ""} onChange={(e) => setEditEtapa((p) => p ? { ...p, dataFimReal: e.target.value } : p)} />
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">% Executado: <span className="font-semibold">{parseFloat(editEtapa.percentualExecutado ?? "0").toFixed(0)}%</span></Label>
                  <input
                    type="range" min={0} max={100} step={1}
                    value={parseFloat(editEtapa.percentualExecutado ?? "0")}
                    onChange={(e) => setEditEtapa((p) => p ? { ...p, percentualExecutado: e.target.value } : p)}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditEtapa(null)}>Cancelar</Button>
                <Button onClick={handleUpdate} disabled={isSaving}>{isSaving ? "Salvando…" : "Salvar alterações"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Medicoes({ tenantId, obraId, etapas }: { tenantId: string; obraId: string; etapas: ObraEtapa[] }) {
  const qc = useQueryClient();
  const [selectedEtapa, setSelectedEtapa] = useState(etapas[0]?.id ?? "");
  const [selectedFase, setSelectedFase] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ data: format(new Date(), "yyyy-MM-dd"), percentualNovo: "", observacao: "" });
  const [phaseSubmitting, setPhaseSubmitting] = useState(false);
  const [lastFinancialResult, setLastFinancialResult] = useState<null | {
    valorBruto: number;
    amortizacaoEntrada: number;
    valorLiquido: number;
    saldoEntradaApos: number;
  }>(null);

  const authHeaders = () => {
    const token = localStorage.getItem("vendorai_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const { data: fases = [], isLoading: loadingFases } = useQuery({
    queryKey: ["obra-etapa-fases", tenantId, obraId, selectedEtapa],
    enabled: !!selectedEtapa,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/etapas/${selectedEtapa}/fases`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Erro ao carregar fases da etapa.");
      return await res.json() as Array<{
        id: string;
        nome: string;
        ordem: number;
        status: string;
        percentualEtapa: string | number;
        percentualExecutado: string | number;
        custoPrevisto: string | number;
        dataInicioPrevista?: string | null;
        dataFimPrevista?: string | null;
      }>;
    },
  });

  useEffect(() => {
    if (fases.length === 0) {
      setSelectedFase("");
      return;
    }
    if (!fases.some((fase) => fase.id === selectedFase)) {
      setSelectedFase(fases[0].id);
    }
  }, [fases, selectedFase]);

  const { data: medicoesEtapa = [] } = useListObraEtapaMedicoes(tenantId, obraId, selectedEtapa, {
    query: {
      enabled: !!selectedEtapa && fases.length === 0,
      queryKey: getListObraEtapaMedicoesQueryKey(tenantId, obraId, selectedEtapa),
    },
  });
  const { mutateAsync: createMedicao, isPending } = useCreateObraEtapaMedicao();

  const { data: medicoesFase = [] } = useQuery({
    queryKey: ["obra-fase-medicoes", tenantId, obraId, selectedFase],
    enabled: !!selectedFase,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/fases/${selectedFase}/medicoes`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Erro ao carregar medições da fase.");
      return await res.json() as Array<{
        id: string;
        data: string;
        percentualAnterior: string | number;
        percentualNovo: string | number;
        valorBruto: string | number;
        amortizacaoEntrada: string | number;
        valorLiquido: string | number;
        saldoEntradaApos: string | number;
        observacao?: string | null;
      }>;
    },
  });

  const currentEtapa = etapas.find((e) => e.id === selectedEtapa);
  const currentFase = fases.find((fase) => fase.id === selectedFase);
  const usaFases = fases.length > 0;
  const progressoAtual = usaFases
    ? Number(currentFase?.percentualExecutado ?? 0)
    : parseFloat(currentEtapa?.percentualExecutado ?? "0");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLastFinancialResult(null);

    if (usaFases && selectedFase) {
      setPhaseSubmitting(true);
      try {
        const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/fases/${selectedFase}/medicoes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            data: form.data,
            percentualNovo: Number(form.percentualNovo),
            observacao: form.observacao || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Erro ao registrar medição da fase.");
        setLastFinancialResult(body.resumo ?? null);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["obra-fase-medicoes", tenantId, obraId, selectedFase] }),
          qc.invalidateQueries({ queryKey: ["obra-etapa-fases", tenantId, obraId, selectedEtapa] }),
          qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) }),
        ]);
        setForm({ data: format(new Date(), "yyyy-MM-dd"), percentualNovo: "", observacao: "" });
      } finally {
        setPhaseSubmitting(false);
      }
      return;
    }

    await createMedicao({ tenantId, obraId, etapaId: selectedEtapa, data: form as any });
    await qc.invalidateQueries({ queryKey: getListObraEtapasQueryKey(tenantId, obraId) });
    await qc.invalidateQueries({ queryKey: getListObraEtapaMedicoesQueryKey(tenantId, obraId, selectedEtapa) });
    setAddOpen(false);
    setForm({ data: format(new Date(), "yyyy-MM-dd"), percentualNovo: "", observacao: "" });
  }

  const medicoes = usaFases ? medicoesFase : medicoesEtapa;

  return (
    <div className="space-y-4">
      {etapas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p>Cadastre etapas para registrar medições</p>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Etapa</Label>
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm min-w-56"
                value={selectedEtapa}
                onChange={(e) => {
                  setSelectedEtapa(e.target.value);
                  setSelectedFase("");
                  setLastFinancialResult(null);
                }}
              >
                {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome} — {parseFloat(e.percentualExecutado).toFixed(1)}%</option>)}
              </select>
            </div>

            {loadingFases ? (
              <div className="flex h-9 items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando fases…</div>
            ) : usaFases ? (
              <div className="space-y-1">
                <Label className="text-xs">Fase a medir</Label>
                <select
                  className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm min-w-64"
                  value={selectedFase}
                  onChange={(e) => {
                    setSelectedFase(e.target.value);
                    setLastFinancialResult(null);
                  }}
                >
                  {fases.map((fase) => (
                    <option key={fase.id} value={fase.id}>
                      {fase.nome} — {Number(fase.percentualExecutado ?? 0).toFixed(1)}%
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <Dialog open={addOpen} onOpenChange={(open) => {
              setAddOpen(open);
              if (!open) setLastFinancialResult(null);
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2" disabled={!selectedEtapa || (usaFases && !selectedFase)}>
                  <Plus className="h-4 w-4" />Registrar medição
                </Button>
              </DialogTrigger>
              <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    Nova medição — {currentEtapa?.nome}{currentFase ? ` · ${currentFase.nome}` : ""}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="p-3 rounded-lg bg-muted/50 text-sm">
                    <div>Progresso já medido: <strong>{progressoAtual.toFixed(1)}%</strong></div>
                    {currentFase ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Valor contratado da fase: <strong>{Number(currentFase.custoPrevisto ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                        {" · "}{Number(currentFase.percentualEtapa ?? 0).toFixed(2)}% da etapa
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Data *</Label>
                      <Input type="date" required value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Novo % acumulado *</Label>
                      <Input
                        type="number"
                        required
                        min={progressoAtual}
                        max="100"
                        step="0.1"
                        value={form.percentualNovo}
                        onChange={(e) => setForm((f) => ({ ...f, percentualNovo: e.target.value }))}
                      />
                      <p className="text-[11px] text-muted-foreground">O sistema cobra somente o avanço adicional desde a última medição.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea rows={3} value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} />
                  </div>

                  {lastFinancialResult ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <p className="mb-2 text-sm font-semibold text-emerald-800">Medição registrada</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Valor bruto</span><p className="font-semibold">{lastFinancialResult.valorBruto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>
                        <div><span className="text-muted-foreground">Amortização entrada</span><p className="font-semibold text-amber-700">-{lastFinancialResult.amortizacaoEntrada.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>
                        <div><span className="text-muted-foreground">Valor líquido</span><p className="font-semibold text-indigo-700">{lastFinancialResult.valorLiquido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>
                        <div><span className="text-muted-foreground">Saldo da entrada</span><p className="font-semibold">{lastFinancialResult.saldoEntradaApos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Fechar</Button>
                    <Button type="submit" disabled={isPending || phaseSubmitting || !form.percentualNovo}>
                      {(isPending || phaseSubmitting) ? "Salvando..." : "Registrar"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {usaFases ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {fases.map((fase) => (
                <button
                  key={fase.id}
                  type="button"
                  onClick={() => setSelectedFase(fase.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${selectedFase === fase.id ? "border-indigo-300 bg-indigo-50" : "bg-background hover:bg-muted/30"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{fase.nome}</p>
                    <Badge variant="outline">{Number(fase.percentualExecutado ?? 0).toFixed(0)}%</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Number(fase.percentualEtapa ?? 0).toFixed(2)}% da etapa · {Number(fase.custoPrevisto ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                  <Progress value={Number(fase.percentualExecutado ?? 0)} className="mt-2 h-1.5" />
                </button>
              ))}
            </div>
          ) : null}

          {medicoes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma medição registrada para {usaFases ? "esta fase" : "esta etapa"}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Anterior</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Novo</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Variação</th>
                      {usaFases ? <th className="text-right px-4 py-3 font-medium text-muted-foreground">Bruto</th> : null}
                      {usaFases ? <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amortização</th> : null}
                      {usaFases ? <th className="text-right px-4 py-3 font-medium text-muted-foreground">Líquido</th> : null}
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicoes.map((m: any) => {
                      const anterior = parseFloat(String(m.percentualNovo != null && m.percentualAnterior != null ? m.percentualAnterior : 0));
                      const novo = parseFloat(String(m.percentualNovo ?? 0));
                      const delta = novo - anterior;
                      return (
                        <tr key={m.id} className="border-b hover:bg-muted/20">
                          <td className="px-4 py-3">{fmt(m.data)}</td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">{anterior.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">{novo.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600">+{delta.toFixed(1)}%</td>
                          {usaFases ? <td className="px-4 py-3 text-right">{Number(m.valorBruto ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td> : null}
                          {usaFases ? <td className="px-4 py-3 text-right text-amber-700">-{Number(m.amortizacaoEntrada ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td> : null}
                          {usaFases ? <td className="px-4 py-3 text-right font-semibold">{Number(m.valorLiquido ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td> : null}
                          <td className="px-4 py-3 text-muted-foreground">{m.observacao ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function DiarioDeObra({ tenantId, obraId, portalToken }: { tenantId: string; obraId: string; portalToken?: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ data: format(new Date(), "yyyy-MM-dd"), conteudo: "", responsavelNome: "", climaTempo: "", maoDeObra: "", observacoes: "", fotos: [] as Array<{ url: string; caption?: string; uploadedAt: string }> });
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [generatingAI, setGeneratingAI] = useState<string | null>(null);

  // ── PDF report state ──
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfForm, setPdfForm] = useState({ dataInicio: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"), dataFim: format(new Date(), "yyyy-MM-dd") });
  const [pdfGenerating, setPdfGenerating] = useState(false);

  async function handleGerarPdf(e: React.FormEvent) {
    e.preventDefault();
    setPdfGenerating(true);
    try {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/diario/relatorio-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(pdfForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.error ?? "Erro ao gerar relatório.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `diario-obra-${pdfForm.dataInicio}-${pdfForm.dataFim}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setPdfOpen(false);
    } catch (err: any) {
      alert(err.message ?? "Erro ao gerar relatório PDF.");
    } finally {
      setPdfGenerating(false);
    }
  }

  const { data: entradas = [], isLoading } = useListObraDiario(tenantId, obraId, {
    query: { enabled: !!obraId, queryKey: getListObraDiarioQueryKey(tenantId, obraId) },
  });
  const { mutateAsync: createEntry, isPending } = useCreateObraDiario();
  const { mutateAsync: updateEntry } = useUpdateObraDiario();
  const { mutateAsync: deleteEntry } = useDeleteObraDiario();

  async function handleUploadFoto(file: File) {
    setUploadingFoto(true);
    try {
      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) throw new Error("Falha ao gerar URL de upload");
      const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("Falha no upload");
      const url = `/api/storage${objectPath}`;
      setForm((f) => ({ ...f, fotos: [...f.fotos, { url, caption: file.name, uploadedAt: new Date().toISOString() }] }));
    } catch (err) {
      alert("Erro ao enviar foto: " + (err as Error).message);
    } finally {
      setUploadingFoto(false);
    }
  }

  function removeFoto(index: number) {
    setForm((f) => ({ ...f, fotos: f.fotos.filter((_, i) => i !== index) }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    if (form.maoDeObra) payload.maoDeObra = parseInt(form.maoDeObra);
    if (form.fotos.length === 0) delete payload.fotos;
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
    await createEntry({ tenantId, obraId, data: payload as any });
    await qc.invalidateQueries({ queryKey: getListObraDiarioQueryKey(tenantId, obraId) });
    setAddOpen(false);
    setForm({ data: format(new Date(), "yyyy-MM-dd"), conteudo: "", responsavelNome: "", climaTempo: "", maoDeObra: "", observacoes: "", fotos: [] });
  }

  async function handleApprove(entry: ObraDiario) {
    await updateEntry({ tenantId, obraId, diarioId: entry.id, data: { status: "aprovado" } as any });
    await qc.invalidateQueries({ queryKey: getListObraDiarioQueryKey(tenantId, obraId) });
  }

  async function handleGerarResumoIA(entry: ObraDiario) {
    setGeneratingAI(entry.id);
    try {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/diario/${entry.id}/resumo-ia`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.error ?? "Erro ao gerar resumo");
      }
      await qc.invalidateQueries({ queryKey: getListObraDiarioQueryKey(tenantId, obraId) });
      toast({ title: "Resumo gerado com IA", description: "O resumo foi adicionado ao registro do diário." });
    } catch (err: any) {
      toast({ title: "Erro ao gerar resumo", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingAI(null);
    }
  }

  function copyDiarioLink() {
    if (!portalToken) return;
    const url = `${window.location.origin}/portal/obra/${portalToken}?tab=diario`;
    navigator.clipboard.writeText(url)
      .then(() => toast({ title: "Link do Diário copiado!", description: "Cole e compartilhe com o cliente." }))
      .catch(() => toast({ title: "Não foi possível copiar", description: url, variant: "destructive" }));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {portalToken && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={copyDiarioLink}>
            <Copy className="h-3.5 w-3.5" />
            Copiar link do Diário
          </Button>
        )}
        {/* ── Modal: Gerar Relatório PDF ── */}
        <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50">
              <FileText className="h-4 w-4" />Gerar Relatório
            </Button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-600" />Relatório PDF — Diário de Obra</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleGerarPdf} className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">Selecione o período para gerar o relatório em PDF com todas as entradas, fotos e ocorrências.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data início *</Label>
                  <Input type="date" required value={pdfForm.dataInicio} onChange={(e) => setPdfForm((f) => ({ ...f, dataInicio: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Data fim *</Label>
                  <Input type="date" required value={pdfForm.dataFim} min={pdfForm.dataInicio} onChange={(e) => setPdfForm((f) => ({ ...f, dataFim: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setPdfOpen(false)} disabled={pdfGenerating}>Cancelar</Button>
                <Button type="submit" className="flex-1 gap-2" disabled={pdfGenerating}>
                  {pdfGenerating ? <><Loader2 className="h-4 w-4 animate-spin" />Gerando...</> : <><Download className="h-4 w-4" />Baixar PDF</>}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova entrada</Button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Diário de obra — nova entrada</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" required value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Input value={form.responsavelNome} onChange={(e) => setForm((f) => ({ ...f, responsavelNome: e.target.value }))} placeholder="Nome do encarregado" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Relatório do dia *</Label>
                <Textarea required rows={5} value={form.conteudo} onChange={(e) => setForm((f) => ({ ...f, conteudo: e.target.value }))} placeholder="Descreva as atividades realizadas hoje..." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Clima/Tempo</Label>
                  <Input value={form.climaTempo} onChange={(e) => setForm((f) => ({ ...f, climaTempo: e.target.value }))} placeholder="Ex: Ensolarado" />
                </div>
                <div className="space-y-2">
                  <Label>Mão de obra (pessoas)</Label>
                  <Input type="number" min="0" value={form.maoDeObra} onChange={(e) => setForm((f) => ({ ...f, maoDeObra: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
              {/* Upload de fotos */}
              <div className="space-y-2">
                <Label>Fotos</Label>
                <div className="flex flex-wrap gap-2">
                  {form.fotos.map((foto, idx) => (
                    <div key={idx} className="relative group w-20 h-20 rounded-lg border overflow-hidden bg-muted">
                      <img src={foto.url} alt={foto.caption} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeFoto(idx)} className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="flex flex-col items-center justify-center w-20 h-20 rounded-lg border border-dashed border-muted-foreground/30 cursor-pointer hover:bg-muted transition-colors">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFoto(f); e.target.value = ""; }} />
                    {uploadingFoto ? <span className="text-xs text-muted-foreground">Enviando...</span> : <><ImageIcon className="h-4 w-4 text-muted-foreground mb-1" /><span className="text-[10px] text-muted-foreground">Adicionar</span></>}
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <div className="h-40 bg-muted animate-pulse rounded-xl" /> :
       entradas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p>Nenhuma entrada no diário</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entradas.map((entry) => {
            const statusInfo = DIARIO_STATUS[entry.status] ?? { label: entry.status, color: "bg-muted" };
            const isExpanded = expandedId === entry.id;
            return (
              <Card key={entry.id}>
                <CardContent className="pt-4 pb-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{fmt(entry.data)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                      {entry.responsavelNome && <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />{entry.responsavelNome}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {entry.status === "rascunho" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-amber-600 border-amber-200" onClick={() => updateEntry({ tenantId, obraId, diarioId: entry.id, data: { status: "pendente_aprovacao" } as any }).then(() => qc.invalidateQueries({ queryKey: getListObraDiarioQueryKey(tenantId, obraId) }))}>
                          Enviar p/ aprovação
                        </Button>
                      )}
                      {(entry.status === "pendente_aprovacao" || entry.status === "revisao") && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-600 border-emerald-200" onClick={() => handleApprove(entry)}>
                          Aprovar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 text-sky-600 border-sky-200 hover:bg-sky-50"
                        disabled={generatingAI === entry.id}
                        onClick={() => handleGerarResumoIA(entry)}
                      >
                        {generatingAI === entry.id
                          ? <><Loader2 className="h-3 w-3 animate-spin" />Gerando...</>
                          : <><Sparkles className="h-3 w-3" />{(entry as any).resumoIA ? "Regerar IA" : "Resumo IA"}</>
                        }
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Excluir entrada?</AlertDialogTitle></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={async () => { await deleteEntry({ tenantId, obraId, diarioId: entry.id }); qc.invalidateQueries({ queryKey: getListObraDiarioQueryKey(tenantId, obraId) }); }}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {(isExpanded || !isExpanded) && (
                    <p className={`text-sm text-muted-foreground whitespace-pre-wrap ${!isExpanded ? "line-clamp-2" : ""}`}>{entry.conteudo}</p>
                  )}
                  {isExpanded && (
                    <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                      {entry.climaTempo && <span>🌤 {entry.climaTempo}</span>}
                      {entry.maoDeObra != null && <span>👷 {entry.maoDeObra} pessoas</span>}
                      {entry.observacoes && <span>📝 {entry.observacoes}</span>}
                    </div>
                  )}
                  {isExpanded && (entry as any).resumoIA && (
                    <div className="mt-2 p-3 rounded-lg border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-800">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Sparkles className="h-3.5 w-3.5 text-sky-500" />
                        <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">Resumo IA</span>
                      </div>
                      <p className="text-sm text-sky-900 dark:text-sky-200 whitespace-pre-wrap">{(entry as any).resumoIA}</p>
                    </div>
                  )}
                  {isExpanded && (entry.fotos as any)?.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {(entry.fotos as any).map((foto: any, idx: number) => (
                        <div key={idx} className="w-24 h-24 rounded-lg border overflow-hidden bg-muted cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => window.open(foto.url, "_blank")}>
                          <img src={foto.url} alt={foto.caption || "Foto"} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EstoqueObra({ tenantId, obraId }: { tenantId: string; obraId: string }) {
  const { data: itens = [], isLoading } = useGetObraEstoque(tenantId, obraId, {
    query: { enabled: !!obraId, queryKey: getGetObraEstoqueQueryKey(tenantId, obraId) },
  });

  return isLoading ? <div className="h-40 bg-muted animate-pulse rounded-xl" /> :
    itens.length === 0 ? (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="h-10 w-10 mx-auto mb-2 opacity-20" />
        <p>Nenhum material em estoque nesta obra</p>
        <p className="text-xs mt-1">Use movimentações de estoque para alocar materiais</p>
      </div>
    ) : (
      <>
        {/* Mobile cards */}
        <div className="sm:hidden space-y-2">
          {itens.map((item) => {
            const baixo = parseFloat(item.quantidadeAtual) <= parseFloat(item.quantidadeMinima);
            return (
              <Card key={item.id} className={baixo ? "border-red-300 bg-red-50 dark:bg-red-950/20" : ""}>
                <CardContent className="p-4 space-y-2">
                  <div className="font-medium">{(item as any).insumo?.nome ?? "—"}</div>
                  {(item as any).insumo?.categoria && (
                    <div className="text-xs text-muted-foreground">{(item as any).insumo.categoria}</div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Unidade</span>
                      <span className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{(item as any).insumo?.unidade ?? "—"}</span>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-semibold ${baixo ? "text-red-600" : ""}`}>
                        {parseFloat(item.quantidadeAtual).toLocaleString("pt-BR")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        mín. {parseFloat(item.quantidadeMinima).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  </div>
                  {baixo && (
                    <div className="text-xs text-red-600 font-medium">Estoque abaixo do mínimo</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Desktop table */}
        <Card className="hidden sm:block">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Material</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unidade</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Quantidade atual</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qtd. mínima</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => {
                  const baixo = parseFloat(item.quantidadeAtual) <= parseFloat(item.quantidadeMinima);
                  return (
                    <tr key={item.id} className={`border-b hover:bg-muted/20 ${baixo ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{(item as any).insumo?.nome ?? "—"}</div>
                        {(item as any).insumo?.categoria && <div className="text-xs text-muted-foreground">{(item as any).insumo.categoria}</div>}
                      </td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{(item as any).insumo?.unidade ?? "—"}</span></td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${baixo ? "text-red-600" : ""}`}>
                        {parseFloat(item.quantidadeAtual).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">{parseFloat(item.quantidadeMinima).toLocaleString("pt-BR")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </>
    );
}

function Compras({ obraId }: { tenantId: string; obraId: string }) {
  return <RealProcurementWorkspace obraId={obraId} compact />;
}

// ─── TabOrcamento ─────────────────────────────────────────────────────────────

const ORC_STATUS: Record<string, { label: string; color: string }> = {
  rascunho:  { label: "Rascunho",  color: "bg-slate-100 text-slate-600" },
  enviado:   { label: "Enviado",   color: "bg-blue-100 text-blue-700" },
  aprovado:  { label: "Aprovado",  color: "bg-emerald-100 text-emerald-700" },
  contratado: { label: "Contratado", color: "bg-emerald-100 text-emerald-800" },
  rejeitado: { label: "Rejeitado", color: "bg-red-100 text-red-700" },
};

function fmtNum(v?: string | number | null) {
  if (v === null || v === undefined || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcItemTotal(item: { quantidade: string; custoUnitario: string; bdi?: string | null }, bdiGlobal: string) {
  const bdi = item.bdi != null ? parseFloat(item.bdi) : parseFloat(bdiGlobal ?? "0");
  return parseFloat(item.quantidade) * parseFloat(item.custoUnitario) * (1 + bdi / 100);
}

function TabOrcamento({ tenantId, obraId, portalToken }: { tenantId: string; obraId: string; portalToken?: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewOrcForm, setShowNewOrcForm] = useState(false);
  const [newOrcTitulo, setNewOrcTitulo] = useState("");
  const [newOrcBdi, setNewOrcBdi] = useState("0");

  const [editingOrcamento, setEditingOrcamento] = useState(false);
  const [editOrcTitulo, setEditOrcTitulo] = useState("");
  const [editOrcBdi, setEditOrcBdi] = useState("0");

  const [newEtapaNome, setNewEtapaNome] = useState("");
  const [showNewEtapaForm, setShowNewEtapaForm] = useState(false);
  const [editingEtapaId, setEditingEtapaId] = useState<string | null>(null);
  const [editEtapaNome, setEditEtapaNome] = useState("");

  const [addingItemEtapaId, setAddingItemEtapaId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    nome: "",
    unidade: "un",
    quantidade: "1",
    custoUnitario: "0",
    bdi: "",
    insumoId: "",
    composicaoId: "",
  });
  const [editingItem, setEditingItem] = useState<{ id: string; nome: string; unidade: string; quantidade: string; custoUnitario: string; bdi: string } | null>(null);
  const [recalculatingPrices, setRecalculatingPrices] = useState(false);

  const [sinapiQuery, setSinapiQuery] = useState("");
  const [sinapiResults, setSinapiResults] = useState<Array<{ codigo: string; descricao: string; unidade: string; preco: number }>>([]);
  const [sinapiLoading, setSinapiLoading] = useState(false);

  useEffect(() => {
    if (sinapiQuery.trim().length < 2) { setSinapiResults([]); return; }
    const timer = setTimeout(async () => {
      setSinapiLoading(true);
      try {
        const token = localStorage.getItem("vendorai_token");
        const res = await fetch(`/api/obras/sinapi/search?q=${encodeURIComponent(sinapiQuery)}&limit=15`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) setSinapiResults(await res.json());
        else setSinapiResults([]);
      } catch { setSinapiResults([]); }
      setSinapiLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [sinapiQuery]);

  useEffect(() => {
    if (!addingItemEtapaId) { setSinapiQuery(""); setSinapiResults([]); }
  }, [addingItemEtapaId]);

  function applySinapi(item: { codigo: string; descricao: string; unidade: string; preco: number }) {
    setNewItem((prev) => ({
      ...prev,
      nome: item.descricao,
      unidade: item.unidade.toLowerCase(),
      custoUnitario: String(item.preco),
      insumoId: "",
      composicaoId: "",
    }));
    setSinapiQuery("");
    setSinapiResults([]);
  }

  const { data: insumosBase = [] } = useListInsumos(tenantId, {}, {
    query: { enabled: !!tenantId },
  });
  const { data: composicoesBase = [] } = useListComposicoes(tenantId, {}, {
    query: { enabled: !!tenantId },
  });

  const { data: orcamentos = [] } = useListObraOrcamentos(tenantId, obraId, {
    query: { enabled: !!tenantId && !!obraId, queryKey: getListObraOrcamentosQueryKey(tenantId, obraId) },
  });

  const { data: orcamento } = useGetObraOrcamento(tenantId, obraId, selectedId ?? "", {
    query: { enabled: !!selectedId, queryKey: getGetObraOrcamentoQueryKey(tenantId, obraId, selectedId ?? "") },
  });

  const invalidateOrcamentos = () => {
    qc.invalidateQueries({ queryKey: getListObraOrcamentosQueryKey(tenantId, obraId) });
    if (selectedId) qc.invalidateQueries({ queryKey: getGetObraOrcamentoQueryKey(tenantId, obraId, selectedId) });
  };

  const createOrcamento = useCreateObraOrcamento();
  const updateOrcamento = useUpdateObraOrcamento();
  const deleteOrcamento = useDeleteObraOrcamento();
  const duplicateOrcamento = useDuplicateObraOrcamento();
  const createEtapa = useCreateOrcamentoEtapa();
  const updateEtapa = useUpdateOrcamentoEtapa();
  const deleteEtapa = useDeleteOrcamentoEtapa();
  const createItem = useCreateOrcamentoItem();
  const updateItem = useUpdateOrcamentoItem();
  const deleteItem = useDeleteOrcamentoItem();

  const locked = orcamento?.status === "aprovado" || orcamento?.status === "contratado";

  function handleCreateOrcamento() {
    createOrcamento.mutate(
      { tenantId, obraId, data: { titulo: newOrcTitulo || undefined, bdiGlobal: newOrcBdi || "0" } },
      {
        onSuccess: (created) => {
          invalidateOrcamentos();
          setSelectedId(created.id);
          setShowNewOrcForm(false);
          setNewOrcTitulo("");
          setNewOrcBdi("0");
        },
      }
    );
  }

  function handleSaveEditOrcamento() {
    if (!selectedId) return;
    updateOrcamento.mutate(
      { tenantId, obraId, orcamentoId: selectedId, data: { titulo: editOrcTitulo || undefined, bdiGlobal: editOrcBdi || "0" } },
      { onSuccess: () => { invalidateOrcamentos(); setEditingOrcamento(false); } }
    );
  }

  function handleChangeStatus(status: string) {
    if (!selectedId) return;
    updateOrcamento.mutate(
      { tenantId, obraId, orcamentoId: selectedId, data: { status } },
      { onSuccess: () => invalidateOrcamentos() }
    );
  }

  function handleDuplicate() {
    if (!selectedId) return;
    duplicateOrcamento.mutate(
      { tenantId, obraId, orcamentoId: selectedId },
      { onSuccess: (novo) => { invalidateOrcamentos(); setSelectedId(novo.id); } }
    );
  }

  function handleDeleteOrcamento() {
    if (!selectedId) return;
    deleteOrcamento.mutate(
      { tenantId, obraId, orcamentoId: selectedId },
      { onSuccess: () => { invalidateOrcamentos(); setSelectedId(null); } }
    );
  }

  function handleCreateEtapa() {
    if (!selectedId || !newEtapaNome.trim()) return;
    createEtapa.mutate(
      { tenantId, obraId, orcamentoId: selectedId, data: { nome: newEtapaNome } },
      { onSuccess: () => { invalidateOrcamentos(); setShowNewEtapaForm(false); setNewEtapaNome(""); } }
    );
  }

  function handleSaveEditEtapa() {
    if (!selectedId || !editingEtapaId || !editEtapaNome.trim()) return;
    updateEtapa.mutate(
      { tenantId, obraId, orcamentoId: selectedId, etapaId: editingEtapaId, data: { nome: editEtapaNome } },
      { onSuccess: () => { invalidateOrcamentos(); setEditingEtapaId(null); setEditEtapaNome(""); } }
    );
  }

  function handleDeleteEtapa(etapaId: string) {
    if (!selectedId) return;
    deleteEtapa.mutate(
      { tenantId, obraId, orcamentoId: selectedId, etapaId },
      { onSuccess: () => invalidateOrcamentos() }
    );
  }

  function handleCreateItem(etapaId: string) {
    if (!selectedId) return;
    const data = {
      nome: newItem.nome,
      unidade: newItem.unidade,
      quantidade: newItem.quantidade,
      custoUnitario: newItem.custoUnitario,
      bdi: newItem.bdi || undefined,
      ...(newItem.insumoId ? { insumoId: newItem.insumoId } : {}),
      ...(newItem.composicaoId ? { composicaoId: newItem.composicaoId } : {}),
    };
    createItem.mutate(
      { tenantId, obraId, orcamentoId: selectedId, etapaId, data: data as any },
      {
        onSuccess: () => {
          invalidateOrcamentos();
          setAddingItemEtapaId(null);
          setNewItem({ nome: "", unidade: "un", quantidade: "1", custoUnitario: "0", bdi: "", insumoId: "", composicaoId: "" });
        },
      }
    );
  }

  function applyMasterSource(value: string) {
    if (!value || value === "manual") {
      setNewItem((prev) => ({ ...prev, insumoId: "", composicaoId: "" }));
      return;
    }

    const [kind, id] = value.split(":");
    if (kind === "insumo") {
      const item = insumosBase.find((entry) => entry.id === id);
      if (!item) return;
      setNewItem((prev) => ({
        ...prev,
        nome: item.nome,
        unidade: item.unidade,
        custoUnitario: item.precoUnitario ?? "0",
        insumoId: item.id,
        composicaoId: "",
      }));
    } else if (kind === "composicao") {
      const item = composicoesBase.find((entry) => entry.id === id);
      if (!item) return;
      setNewItem((prev) => ({
        ...prev,
        nome: item.nome,
        unidade: item.unidade,
        custoUnitario: item.custoTotal ?? "0",
        insumoId: "",
        composicaoId: item.id,
      }));
    }
  }

  async function handleRecalculatePrices() {
    if (!selectedId) return;
    setRecalculatingPrices(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/orcamentos/${selectedId}/recalcular-precos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Não foi possível recalcular os preços.");
      invalidateOrcamentos();
      toast({
        title: "Preços do orçamento atualizados",
        description: `${body.itensAtualizados ?? 0} item(ns) sincronizado(s) com a tabela mestre.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível atualizar os preços",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setRecalculatingPrices(false);
    }
  }

  function handleSaveEditItem() {
    if (!selectedId || !editingItem) return;
    const etapa = orcamento?.etapas?.find((e) => e.itens?.some((i) => i.id === editingItem.id));
    if (!etapa) return;
    updateItem.mutate(
      { tenantId, obraId, orcamentoId: selectedId, etapaId: etapa.id, itemId: editingItem.id, data: { nome: editingItem.nome, unidade: editingItem.unidade, quantidade: editingItem.quantidade, custoUnitario: editingItem.custoUnitario, bdi: editingItem.bdi || undefined } },
      { onSuccess: () => { invalidateOrcamentos(); setEditingItem(null); } }
    );
  }

  function handleDeleteItem(etapaId: string, itemId: string) {
    if (!selectedId) return;
    deleteItem.mutate(
      { tenantId, obraId, orcamentoId: selectedId, etapaId, itemId },
      { onSuccess: () => invalidateOrcamentos() }
    );
  }

  const totalGeral = (orcamento?.etapas ?? []).reduce((acc, etapa) => {
    const etapaTotal = (etapa.itens ?? []).reduce((s, item) => s + calcItemTotal(item as any, orcamento?.bdiGlobal ?? "0"), 0);
    return acc + etapaTotal;
  }, 0);

  function copyOrcamentoLink() {
    if (!portalToken) return;
    const url = `${window.location.origin}/portal/obra/${portalToken}?tab=orcamento`;
    navigator.clipboard.writeText(url)
      .then(() => toast({ title: "Link do Orçamento copiado!", description: "Cole e compartilhe com o cliente." }))
      .catch(() => toast({ title: "Não foi possível copiar", description: url, variant: "destructive" }));
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Versões (seletor de orçamentos) + copy link */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        {orcamentos.map((o) => {
          const st = ORC_STATUS[o.status] ?? ORC_STATUS.rascunho;
          return (
            <button
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                selectedId === o.id
                  ? "border-primary bg-primary/5 text-primary shadow-sm"
                  : "border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              <span>v{o.versao}</span>
              {o.titulo && <span className="text-xs opacity-70">· {o.titulo}</span>}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
            </button>
          );
        })}

        {showNewOrcForm ? (
          <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/30">
            <input
              className="text-sm border-0 bg-transparent outline-none w-32 placeholder:text-muted-foreground"
              placeholder="Título (opcional)"
              value={newOrcTitulo}
              onChange={(e) => setNewOrcTitulo(e.target.value)}
            />
            <input
              type="number"
              className="text-sm border-0 bg-transparent outline-none w-20 placeholder:text-muted-foreground"
              placeholder="BDI %"
              value={newOrcBdi}
              onChange={(e) => setNewOrcBdi(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">% BDI global</span>
            <Button size="sm" variant="default" onClick={handleCreateOrcamento} disabled={createOrcamento.isPending}>
              Criar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewOrcForm(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowNewOrcForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo Orçamento
          </Button>
        )}
      </div>
      {portalToken && (
        <Button size="sm" variant="outline" className="gap-1.5 text-xs shrink-0" onClick={copyOrcamentoLink}>
          <Copy className="h-3.5 w-3.5" />
          Copiar link do Orçamento
        </Button>
      )}
      </div>

      {/* Detalhe do orçamento selecionado */}
      {!selectedId && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
          <FileSpreadsheet className="h-10 w-10 opacity-30" />
          <p className="text-sm">Selecione ou crie um orçamento para começar</p>
        </div>
      )}

      {selectedId && orcamento && (
        <div className="space-y-3">
          {(orcamento as any).precosDesatualizados && (
            <Card className="border-amber-300 bg-amber-50/70">
              <CardContent className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">A tabela mestre de preços mudou</p>
                    <p className="text-xs text-amber-800">Este orçamento foi enviado e não foi alterado silenciosamente. Revise e aplique os novos custos quando quiser.</p>
                  </div>
                </div>
                {!locked && (
                  <Button size="sm" variant="outline" onClick={handleRecalculatePrices} disabled={recalculatingPrices}>
                    {recalculatingPrices ? "Atualizando..." : "Atualizar com tabela mestre"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          {/* Header do orçamento */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {editingOrcamento ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        className="text-sm border rounded px-2 py-1 w-40"
                        placeholder="Título"
                        value={editOrcTitulo}
                        onChange={(e) => setEditOrcTitulo(e.target.value)}
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          className="text-sm border rounded px-2 py-1 w-20"
                          placeholder="BDI %"
                          value={editOrcBdi}
                          onChange={(e) => setEditOrcBdi(e.target.value)}
                        />
                        <span className="text-xs text-muted-foreground">% BDI global</span>
                      </div>
                      <Button size="sm" onClick={handleSaveEditOrcamento} disabled={updateOrcamento.isPending}>Salvar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingOrcamento(false)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : (
                    <>
                      <CardTitle className="text-base">
                        v{orcamento.versao}{orcamento.titulo ? ` — ${orcamento.titulo}` : ""}
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">BDI global: {orcamento.bdiGlobal}%</span>
                    </>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ORC_STATUS[orcamento.status]?.color ?? "bg-muted text-muted-foreground"}`}>
                    {ORC_STATUS[orcamento.status]?.label ?? orcamento.status}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {!locked && !editingOrcamento && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditOrcTitulo(orcamento.titulo ?? ""); setEditOrcBdi(orcamento.bdiGlobal ?? "0"); setEditingOrcamento(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {locked && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <AlertCircle className="h-3.5 w-3.5" /> Aprovado — somente leitura
                    </span>
                  )}
                  {orcamento.status === "rascunho" && !locked && (
                    <Button size="sm" variant="outline" onClick={() => handleChangeStatus("enviado")} disabled={updateOrcamento.isPending}>
                      <Send className="h-3.5 w-3.5 mr-1" /> Enviar
                    </Button>
                  )}
                  {orcamento.status === "enviado" && (
                    <>
                      <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300" onClick={() => handleChangeStatus("aprovado")} disabled={updateOrcamento.isPending}>
                        <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-700 border-red-300" onClick={() => handleChangeStatus("rejeitado")} disabled={updateOrcamento.isPending}>
                        <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Rejeitar
                      </Button>
                    </>
                  )}
                  {(orcamento.status === "rejeitado" || orcamento.status === "aprovado") && (
                    <Button size="sm" variant="outline" onClick={() => handleChangeStatus("rascunho")} disabled={updateOrcamento.isPending}>
                      <ChevronDown className="h-3.5 w-3.5 mr-1" /> Reabrir
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={handleDuplicate} disabled={duplicateOrcamento.isPending}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Duplicar
                  </Button>
                  {!locked && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita. Todas as etapas e itens serão removidos.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDeleteOrcamento} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Etapas */}
          {(orcamento.etapas ?? []).map((etapa) => {
            const etapaTotal = (etapa.itens ?? []).reduce((s, item) => s + calcItemTotal(item as any, orcamento.bdiGlobal ?? "0"), 0);

            return (
              <Card key={etapa.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    {editingEtapaId === etapa.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="text-sm border rounded px-2 py-1 w-48"
                          value={editEtapaNome}
                          onChange={(e) => setEditEtapaNome(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveEditEtapa()}
                          autoFocus
                        />
                        <Button size="sm" onClick={handleSaveEditEtapa} disabled={updateEtapa.isPending}>Salvar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingEtapaId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold">{etapa.nome}</CardTitle>
                        {!locked && (
                          <>
                            <button onClick={() => { setEditingEtapaId(etapa.id); setEditEtapaNome(etapa.nome); }} className="text-muted-foreground hover:text-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button className="text-muted-foreground hover:text-red-600">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir etapa "{etapa.nome}"?</AlertDialogTitle>
                                  <AlertDialogDescription>Todos os itens desta etapa serão removidos.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteEtapa(etapa.id)} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    )}
                    <span className="text-sm font-semibold text-muted-foreground">
                      Subtotal: {fmtBRL(etapaTotal)}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {/* Tabela de itens */}
                  {(etapa.itens ?? []).length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-1.5 pr-2 font-medium w-full">Item</th>
                            <th className="text-center py-1.5 px-2 font-medium whitespace-nowrap">Un</th>
                            <th className="text-right py-1.5 px-2 font-medium whitespace-nowrap">Qtd</th>
                            <th className="text-right py-1.5 px-2 font-medium whitespace-nowrap">R$/un</th>
                            <th className="text-right py-1.5 px-2 font-medium whitespace-nowrap">BDI%</th>
                            <th className="text-right py-1.5 px-2 font-medium whitespace-nowrap">Total</th>
                            {!locked && <th className="w-12" />}
                          </tr>
                        </thead>
                        <tbody>
                          {(etapa.itens ?? []).map((item) => {
                            const total = calcItemTotal(item as any, orcamento.bdiGlobal ?? "0");
                            return (
                              <tr key={item.id} className="border-b hover:bg-muted/10 group">
                                <td className="py-1.5 pr-2">{item.nome}</td>
                                <td className="py-1.5 px-2 text-center text-muted-foreground">{item.unidade}</td>
                                <td className="py-1.5 px-2 text-right">{fmtNum(item.quantidade)}</td>
                                <td className="py-1.5 px-2 text-right">{fmtNum(item.custoUnitario)}</td>
                                <td className="py-1.5 px-2 text-right text-muted-foreground">
                                  {item.bdi != null ? `${item.bdi}%` : <span className="opacity-50">global</span>}
                                </td>
                                <td className="py-1.5 px-2 text-right font-medium">{fmtBRL(total)}</td>
                                {!locked && (
                                  <td className="py-1.5 px-2">
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                                      <button onClick={() => setEditingItem({ id: item.id, nome: item.nome, unidade: item.unidade, quantidade: item.quantidade, custoUnitario: item.custoUnitario, bdi: item.bdi ?? "" })} className="text-muted-foreground hover:text-foreground">
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => handleDeleteItem(etapa.id, item.id)} className="text-muted-foreground hover:text-red-600">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Dialog: Adicionar item */}
                  {!locked && (
                    <Dialog open={addingItemEtapaId === etapa.id} onOpenChange={(open) => { if (!open) { setAddingItemEtapaId(null); setSinapiQuery(""); setSinapiResults([]); setNewItem({ nome: "", unidade: "un", quantidade: "1", custoUnitario: "0", bdi: "", insumoId: "", composicaoId: "" }); } }}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => { setAddingItemEtapaId(etapa.id); setEditingItem(null); }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader><DialogTitle>Adicionar item — {etapa.nome}</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <Label>Origem do custo</Label>
                            <select
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                              value={newItem.insumoId ? `insumo:${newItem.insumoId}` : newItem.composicaoId ? `composicao:${newItem.composicaoId}` : "manual"}
                              onChange={(e) => applyMasterSource(e.target.value)}
                            >
                              <option value="manual">Manual / SINAPI avulso</option>
                              <optgroup label="Base mestre de insumos">
                                {insumosBase.map((item) => (
                                  <option key={item.id} value={`insumo:${item.id}`}>
                                    {item.codigo ? `${item.codigo} — ` : ""}{item.nome} · {item.precoUnitario ? fmtBRL(item.precoUnitario) : "sem preço"}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Composições">
                                {composicoesBase.map((item) => (
                                  <option key={item.id} value={`composicao:${item.id}`}>
                                    {item.codigo ? `${item.codigo} — ` : ""}{item.nome} · {item.custoTotal ? fmtBRL(item.custoTotal) : "sem custo"}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                            <p className="text-xs text-muted-foreground">
                              Itens ligados à base mestre acompanham as alterações de preço enquanto o orçamento estiver em rascunho.
                            </p>
                          </div>

                          {/* SINAPI search */}
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Buscar no SINAPI (opcional)</Label>
                            <div className="relative">
                              <div className="flex items-center gap-1.5 border rounded px-3 py-2 bg-white focus-within:ring-1 focus-within:ring-blue-300">
                                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <input
                                  className="text-sm flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                                  placeholder="Ex: concreto fck 25, armação ca-50…"
                                  value={sinapiQuery}
                                  onChange={(e) => setSinapiQuery(e.target.value)}
                                  onKeyDown={(e) => e.key === "Escape" && setSinapiQuery("")}
                                />
                                {sinapiLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                                {sinapiQuery && !sinapiLoading && (
                                  <button onClick={() => { setSinapiQuery(""); setSinapiResults([]); }} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <span className="text-[10px] text-muted-foreground border rounded px-1 shrink-0">SINAPI</span>
                              </div>
                              {sinapiResults.length > 0 && (
                                <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border rounded-md shadow-lg max-h-52 overflow-y-auto">
                                  {sinapiResults.map((sr) => (
                                    <button
                                      key={sr.codigo}
                                      type="button"
                                      onClick={() => applySinapi(sr)}
                                      className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2 border-b last:border-0"
                                    >
                                      <span className="font-mono text-[10px] text-muted-foreground shrink-0 w-12">{sr.codigo}</span>
                                      <span className="flex-1 min-w-0 truncate">{sr.descricao}</span>
                                      <span className="text-muted-foreground whitespace-nowrap shrink-0">{sr.unidade}</span>
                                      <span className="font-medium whitespace-nowrap shrink-0">{fmtBRL(sr.preco)}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {sinapiQuery.trim().length >= 2 && !sinapiLoading && sinapiResults.length === 0 && (
                                <p className="text-xs text-muted-foreground mt-1">Nenhum item SINAPI encontrado. Preencha manualmente abaixo.</p>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Nome do item *</Label>
                            <Input placeholder="Ex: Concreto fck 25 MPa" value={newItem.nome} onChange={(e) => setNewItem({ ...newItem, nome: e.target.value })} />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>Unidade</Label>
                              <Input placeholder="un, m², m³, kg…" value={newItem.unidade} onChange={(e) => setNewItem({ ...newItem, unidade: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Quantidade</Label>
                              <Input type="number" step="0.001" value={newItem.quantidade} onChange={(e) => setNewItem({ ...newItem, quantidade: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Custo unitário (R$){(newItem.insumoId || newItem.composicaoId) && <span className="text-muted-foreground font-normal"> · automático</span>}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0,00"
                                value={newItem.custoUnitario}
                                disabled={!!newItem.insumoId || !!newItem.composicaoId}
                                onChange={(e) => setNewItem({ ...newItem, custoUnitario: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>BDI% <span className="text-muted-foreground font-normal">(padrão: {orcamento.bdiGlobal ?? "0"}%)</span></Label>
                              <Input type="number" step="0.1" placeholder={`global (${orcamento.bdiGlobal ?? "0"}%)`} value={newItem.bdi} onChange={(e) => setNewItem({ ...newItem, bdi: e.target.value })} />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => { setAddingItemEtapaId(null); setSinapiQuery(""); setSinapiResults([]); setNewItem({ nome: "", unidade: "un", quantidade: "1", custoUnitario: "0", bdi: "", insumoId: "", composicaoId: "" }); }}>Cancelar</Button>
                            <Button onClick={() => handleCreateItem(etapa.id)} disabled={!newItem.nome.trim() || createItem.isPending}>
                              {createItem.isPending ? "Salvando…" : "Adicionar"}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}

                  {(etapa.itens ?? []).length === 0 && addingItemEtapaId !== etapa.id && (
                    <p className="text-xs text-muted-foreground py-2">Nenhum item. {!locked && "Clique em \"Adicionar item\" para começar."}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Dialog: Editar item de orçamento */}
          <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
            <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Editar item</DialogTitle></DialogHeader>
              {editingItem && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do item *</Label>
                    <Input value={editingItem.nome} onChange={(e) => setEditingItem({ ...editingItem, nome: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Unidade</Label>
                      <Input placeholder="un, m², m³, kg…" value={editingItem.unidade} onChange={(e) => setEditingItem({ ...editingItem, unidade: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantidade</Label>
                      <Input type="number" step="0.001" value={editingItem.quantidade} onChange={(e) => setEditingItem({ ...editingItem, quantidade: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Custo unitário (R$)</Label>
                      <Input type="number" step="0.01" value={editingItem.custoUnitario} onChange={(e) => setEditingItem({ ...editingItem, custoUnitario: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>BDI% <span className="text-muted-foreground font-normal">(padrão: {orcamento.bdiGlobal ?? "0"}%)</span></Label>
                      <Input type="number" step="0.1" placeholder={`global (${orcamento.bdiGlobal ?? "0"}%)`} value={editingItem.bdi} onChange={(e) => setEditingItem({ ...editingItem, bdi: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={() => setEditingItem(null)}>Cancelar</Button>
                    <Button onClick={handleSaveEditItem} disabled={!editingItem.nome.trim() || updateItem.isPending}>
                      {updateItem.isPending ? "Salvando…" : "Salvar alterações"}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {!locked && (
            <div>
              {showNewEtapaForm ? (
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/30">
                  <input
                    className="text-sm border-0 bg-transparent outline-none flex-1 placeholder:text-muted-foreground"
                    placeholder="Nome da etapa (ex: Fundações, Estrutura…)"
                    value={newEtapaNome}
                    onChange={(e) => setNewEtapaNome(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateEtapa()}
                    autoFocus
                  />
                  <Button size="sm" onClick={handleCreateEtapa} disabled={!newEtapaNome.trim() || createEtapa.isPending}>
                    Adicionar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowNewEtapaForm(false); setNewEtapaNome(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setShowNewEtapaForm(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Nova Etapa
                </Button>
              )}
            </div>
          )}

          {/* Rodapé — total geral */}
          {(orcamento.etapas ?? []).length > 0 && (
            <Card className="bg-muted/30">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Total geral com BDI ({orcamento.bdiGlobal}%)</p>
                    <p className="text-xl font-bold">{fmtBRL(totalGeral)}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground space-y-0.5">
                    {(orcamento.etapas ?? []).map((etapa) => {
                      const t = (etapa.itens ?? []).reduce((s, item) => s + calcItemTotal(item as any, orcamento.bdiGlobal ?? "0"), 0);
                      return (
                        <div key={etapa.id} className="flex items-center gap-4 justify-end">
                          <span>{etapa.nome}</span>
                          <span className="font-medium">{fmtBRL(t)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── Curva ABC ──────────────────────────────────────────────────────── */}
      {selectedId && (orcamento?.etapas ?? []).length > 0 && (
        <CurvaABC tenantId={tenantId} obraId={obraId} orcamentoId={selectedId} />
      )}
    </div>
  );
}

// ─── CurvaABC ────────────────────────────────────────────────────────────────

type CurvaABCItem = {
  itemId: string;
  nome: string;
  etapaNome: string;
  unidade: string;
  quantidade: number;
  custoUnitario: number;
  bdi: number;
  valorTotal: number;
  pctIndividual: number;
  pctAcumulado: number;
  classe: "A" | "B" | "C";
};

const CLASSE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: "bg-emerald-100", text: "text-emerald-800", label: "A" },
  B: { bg: "bg-amber-100",   text: "text-amber-800",   label: "B" },
  C: { bg: "bg-slate-100",   text: "text-slate-600",   label: "C" },
};

function CurvaABC({ tenantId, obraId, orcamentoId }: { tenantId: string; obraId: string; orcamentoId: string }) {
  const [open, setOpen] = useState(false);

  const { data = [], isLoading } = useQuery<CurvaABCItem[]>({
    queryKey: ["curva-abc", tenantId, obraId, orcamentoId],
    queryFn: async () => {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(
        `/api/tenants/${tenantId}/obras/${obraId}/orcamentos/${orcamentoId}/curva-abc`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error("Erro ao carregar Curva ABC");
      return res.json();
    },
    enabled: open && !!tenantId && !!obraId && !!orcamentoId,
  });

  const counts = { A: data.filter((i) => i.classe === "A").length, B: data.filter((i) => i.classe === "B").length, C: data.filter((i) => i.classe === "C").length };

  return (
    <Card>
      <CardHeader className="py-3 px-4 cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Curva ABC do Orçamento</CardTitle>
            <span className="text-xs text-muted-foreground">Itens por impacto no custo</span>
          </div>
          <div className="flex items-center gap-2">
            {!open && data.length === 0 && !isLoading && (
              <span className="text-xs text-muted-foreground">clique para carregar</span>
            )}
            {open && data.length > 0 && (
              <div className="flex gap-1">
                {(["A","B","C"] as const).map((c) => (
                  <span key={c} className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLASSE_STYLE[c].bg} ${CLASSE_STYLE[c].text}`}>
                    {c}: {counts[c]}
                  </span>
                ))}
              </div>
            )}
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 px-0 pb-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
            </div>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum item com valor encontrado.</p>
          ) : (
            <>
              <div className="px-4 pb-3 text-xs text-muted-foreground space-y-0.5">
                <p><span className={`inline-block px-1.5 py-0.5 rounded font-semibold mr-1 ${CLASSE_STYLE.A.bg} ${CLASSE_STYLE.A.text}`}>A</span> Poucos itens, alto impacto — representam até 80% do custo total</p>
                <p><span className={`inline-block px-1.5 py-0.5 rounded font-semibold mr-1 ${CLASSE_STYLE.B.bg} ${CLASSE_STYLE.B.text}`}>B</span> Impacto médio — de 80% a 95% do custo acumulado</p>
                <p><span className={`inline-block px-1.5 py-0.5 rounded font-semibold mr-1 ${CLASSE_STYLE.C.bg} ${CLASSE_STYLE.C.text}`}>C</span> Muitos itens, baixo impacto individual — últimos 5%</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground w-6">#</th>
                      <th className="text-left px-2 py-2 font-medium text-muted-foreground">Item</th>
                      <th className="text-left px-2 py-2 font-medium text-muted-foreground hidden sm:table-cell">Etapa</th>
                      <th className="text-right px-2 py-2 font-medium text-muted-foreground">Valor total</th>
                      <th className="text-right px-2 py-2 font-medium text-muted-foreground">% item</th>
                      <th className="text-right px-2 py-2 font-medium text-muted-foreground">% acum.</th>
                      <th className="text-center px-4 py-2 font-medium text-muted-foreground">Classe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((item, idx) => {
                      const st = CLASSE_STYLE[item.classe];
                      return (
                        <tr key={item.itemId} className={`border-b last:border-0 ${item.classe === "A" ? "bg-emerald-50/40" : item.classe === "B" ? "bg-amber-50/30" : ""}`}>
                          <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                          <td className="px-2 py-2 font-medium max-w-[200px] truncate">{item.nome}</td>
                          <td className="px-2 py-2 text-muted-foreground hidden sm:table-cell">{item.etapaNome}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-medium">{fmtBRL(item.valorTotal)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{item.pctIndividual.toFixed(1)}%</td>
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{item.pctAcumulado.toFixed(1)}%</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-xs ${st.bg} ${st.text}`}>{item.classe}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function EnergiaSistemas({ tenantId, obraId }: { tenantId: string; obraId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState("fotovoltaico_on_grid");
  const [somenteInfraestrutura, setSomenteInfraestrutura] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["obra-energia-resumo", tenantId, obraId],
    queryFn: async () => {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/energia/resumo`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao carregar sistemas de energia");
      return res.json();
    },
    enabled: !!tenantId && !!obraId,
  });

  async function preconfigurar() {
    const token = localStorage.getItem("vendorai_token");
    const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/energia/preconfigurar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ tipo, somenteInfraestrutura }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast({ title: "Não foi possível adicionar", description: body?.error ?? "Erro ao criar sistema de energia", variant: "destructive" });
      return;
    }
    toast({ title: "Sistema de energia adicionado" });
    qc.invalidateQueries({ queryKey: ["obra-energia-resumo", tenantId, obraId] });
  }

  const labelTipo: Record<string, string> = {
    fotovoltaico_on_grid: "Solar fotovoltaico on-grid",
    fotovoltaico_hibrido: "Solar fotovoltaico híbrido",
    off_grid: "Sistema off-grid",
    banco_baterias: "Banco de baterias",
    carregador_ve: "Carregador de veículo elétrico",
    gerador: "Gerador",
    nobreak_ups: "Nobreak / UPS",
    quadro_cargas_essenciais: "Quadro de cargas essenciais",
    chave_transferencia: "Chave de transferência",
    gestao_energia: "Gestão de energia",
  };

  const iconTipo = (t: string) => t.includes("fotovoltaico") ? Sun : t === "carregador_ve" ? CarFront : t.includes("bateria") || t === "off_grid" ? BatteryCharging : Zap;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Potência instalada</div>
            <div className="text-2xl font-bold mt-1">{data?.totais?.potenciaKw ?? "0.0000"} kW</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Armazenamento</div>
            <div className="text-2xl font-bold mt-1">{data?.totais?.energiaKwh ?? "0.0000"} kWh</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Alertas técnicos</div>
            <div className="text-2xl font-bold mt-1">{data?.alertas?.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Adicionar sistema especial</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <select
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {Object.entries(labelTipo).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/20 text-sm">
            <input
              type="checkbox"
              checked={somenteInfraestrutura}
              onChange={(e) => setSomenteInfraestrutura(e.target.checked)}
            />
            Somente infraestrutura
          </label>
          <Button onClick={preconfigurar}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (data?.sistemas ?? []).length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum sistema especial configurado nesta obra.</CardContent></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(data?.sistemas ?? []).map((s: any) => {
            const Icon = iconTipo(s.tipo);
            const comps = (data?.componentes ?? []).filter((c: any) => c.sistemaId === s.id);
            return (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      {s.nome || labelTipo[s.tipo] || s.tipo}
                    </CardTitle>
                    {s.somenteInfraestrutura && <Badge variant="secondary">Só infraestrutura</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Potência:</span> <strong>{s.potenciaKw ?? "—"} kW</strong></div>
                    <div><span className="text-muted-foreground">Energia:</span> <strong>{s.energiaKwh ?? "—"} kWh</strong></div>
                    <div><span className="text-muted-foreground">Tensão:</span> <strong>{s.tensaoV ?? "—"} V</strong></div>
                    <div><span className="text-muted-foreground">Autonomia:</span> <strong>{s.autonomiaHoras ?? "—"} h</strong></div>
                  </div>
                  <div className="space-y-1.5">
                    {comps.map((comp: any) => (
                      <div key={comp.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs">
                        <div>
                          <div className="font-medium">{comp.nome}</div>
                          <div className="text-muted-foreground">{comp.tipo} · {comp.slotKey}</div>
                        </div>
                        <Badge variant="outline">{comp.quantidade} {comp.unidade}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(data?.alertas ?? []).length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500" />Alertas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data.alertas ?? []).map((a: any, idx: number) => (
              <div key={idx} className="text-xs rounded-md bg-amber-50 border border-amber-200 px-3 py-2">{a.mensagem ?? a.tipo}</div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ObraDetalhe() {
  const { user } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId ?? "";
  const [, params] = useRoute("/obras/:obraId");
  const obraId = params?.obraId ?? "";
  const [activeTab, setActiveTab] = useState("visao-geral");
  const tabBarRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (tabBarRef.current) {
      const activeBtn = tabBarRef.current.querySelector('[data-active="true"]') as HTMLElement | null;
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [activeTab]);

  const { data: obra, isLoading } = useGetObra(tenantId, obraId, {
    query: { enabled: !!obraId && !!tenantId, queryKey: getGetObraQueryKey(tenantId, obraId) },
  });

  const { data: etapas = [] } = useListObraEtapas(tenantId, obraId, {
    query: { enabled: !!obraId && !!tenantId, queryKey: getListObraEtapasQueryKey(tenantId, obraId) },
  });

  if (isLoading) {
    return <div className="h-40 bg-muted animate-pulse rounded-xl" />;
  }

  if (!obra) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Obra não encontrada</p>
        <Link href="/obras"><Button variant="link">← Voltar</Button></Link>
      </div>
    );
  }

  const statusInfo = (obra as any) ? (
    { label: obra.status, color: "bg-muted" }
  ) : { label: obra.status, color: "bg-muted" };

  const obraStatus = {
    planejamento:  { label: "Planejamento",  color: "bg-slate-100 text-slate-700" },
    em_andamento:  { label: "Em andamento",  color: "bg-blue-100 text-blue-700" },
    pausada:       { label: "Pausada",       color: "bg-amber-100 text-amber-700" },
    concluida:     { label: "Concluída",     color: "bg-emerald-100 text-emerald-700" },
    cancelada:     { label: "Cancelada",     color: "bg-red-100 text-red-700" },
  }[obra.status] ?? { label: obra.status, color: "bg-muted text-muted-foreground" };

  const progressoMedio = etapas.length > 0
    ? etapas.reduce((s, e) => s + parseFloat(e.percentualExecutado ?? "0"), 0) / etapas.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link href="/obras">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Obras
          </Button>
        </Link>

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <HardHat className="h-6 w-6 text-amber-500" />
              {obra.nome}
            </h1>
            {obra.clienteNome && <p className="text-sm text-muted-foreground mt-0.5">{obra.clienteNome}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${obraStatus.color}`}>{obraStatus.label}</span>
            {(obra as any).portalToken && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-7"
                onClick={() => {
                  const url = `${window.location.origin}/portal/obra/${(obra as any).portalToken}`;
                  navigator.clipboard.writeText(url)
                    .then(() => toast({ title: "Link do portal copiado!", description: "Cole e compartilhe com o cliente." }))
                    .catch(() => toast({ title: "Não foi possível copiar", description: url, variant: "destructive" }));
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                Link do Portal
              </Button>
            )}
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Progress value={progressoMedio} className="w-24 h-1.5" />
            <span className="font-medium">{progressoMedio.toFixed(1)}%</span>
          </div>
          {obra.dataFimPrevista && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>Prev: {fmt(obra.dataFimPrevista)}</span>
            </div>
          )}
          {obra.orcamentoTotal && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              <span>Orç: {fmtBRL(obra.orcamentoTotal)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs — mobile dropdown */}
      <MobileTabDropdown activeTab={activeTab} onSelect={setActiveTab} />

      {/* Tabs — desktop scrollable bar */}
      <div className="hidden sm:block border-b overflow-x-auto scrollbar-none" ref={tabBarRef}>
        <div className="flex gap-0 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              data-active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5 shrink-0" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "visao-geral"  && <VisaoGeral obra={obra} etapas={etapas} />}
        {activeTab === "cronograma"   && <Cronograma tenantId={tenantId} obraId={obraId} etapas={etapas} portalToken={(obra as any).portalToken} />}
        {activeTab === "medicoes"     && <Medicoes tenantId={tenantId} obraId={obraId} etapas={etapas} />}
        {activeTab === "diario"       && <DiarioDeObra tenantId={tenantId} obraId={obraId} portalToken={(obra as any).portalToken} />}
        {activeTab === "equipe-producao" && <EquipeProducao tenantId={tenantId} obraId={obraId} etapas={etapas as any} />}
        {activeTab === "financeiro"   && (
          <TabFinanceiro
            tenantId={tenantId}
            obraId={obraId}
            etapas={etapas}
            onOpenOrcamento={() => setActiveTab("orcamento")}
          />
        )}
        {activeTab === "estoque"      && <EstoqueObra tenantId={tenantId} obraId={obraId} />}
        {activeTab === "compras"      && <Compras tenantId={tenantId} obraId={obraId} />}
        {activeTab === "orcamento"    && <TabOrcamento tenantId={tenantId} obraId={obraId} portalToken={(obra as any).portalToken} />}
        {activeTab === "energia"       && <EnergiaSistemas tenantId={tenantId} obraId={obraId} />}
      </div>
    </div>
  );
}
