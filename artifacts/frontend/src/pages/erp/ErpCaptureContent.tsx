import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, CheckCircle2, FileText, Loader2, ScanLine, Upload } from "lucide-react";

type TituloTipo = "pagar" | "receber";
type Categoria = "receita" | "custo" | "despesa" | "imposto" | "investimento";

type DocumentAnalysis = {
  titulo?: string | null;
  valorTotal?: number | null;
  cliente?: string | null;
  fornecedor?: string | null;
  validade?: string | null;
  observacoes?: string | null;
  confianca?: number | null;
  quoteFileUrl?: string | null;
  originalName?: string | null;
};

type FormState = {
  tipo: TituloTipo;
  categoria: Categoria;
  descricao: string;
  pessoa: string;
  documento: string;
  valorOriginal: string;
  vencimento: string;
  observacoes: string;
};

const INITIAL_FORM: FormState = {
  tipo: "pagar",
  categoria: "custo",
  descricao: "",
  pessoa: "",
  documento: "",
  valorOriginal: "",
  vencimento: "",
  observacoes: "",
};

export default function ERPCapture() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saved, setSaved] = useState(false);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(selected.type.startsWith("image/") ? URL.createObjectURL(selected) : null);
    setAnalysis(null);
    setSaved(false);
    setForm(INITIAL_FORM);
  }

  const analyze = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant não identificado.");
      if (!file) throw new Error("Selecione uma foto ou PDF.");
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/tenants/${tenantId}/deals/extract-quote`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível analisar o documento.");
      return data as DocumentAnalysis;
    },
    onSuccess: (data) => {
      setAnalysis(data);
      const validDate = data.validade && /^\d{4}-\d{2}-\d{2}$/.test(data.validade) ? data.validade : "";
      const fileReference = data.quoteFileUrl ? `Arquivo armazenado: ${data.quoteFileUrl}` : `Arquivo: ${file?.name ?? data.originalName ?? "documento"}`;
      setForm((current) => ({
        ...current,
        descricao: data.titulo?.trim() || data.originalName || file?.name || "Documento capturado",
        pessoa: data.fornecedor?.trim() || data.cliente?.trim() || "",
        valorOriginal: data.valorTotal != null ? String(data.valorTotal) : "",
        vencimento: validDate,
        observacoes: [data.observacoes?.trim(), fileReference].filter(Boolean).join("\n"),
      }));
      toast({ title: "Documento analisado", description: "Revise os campos detectados antes de gravar no ERP." });
    },
    onError: (error: Error) => toast({ title: "Falha na leitura", description: error.message, variant: "destructive" }),
  });

  const saveTitle = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant não identificado.");
      if (!form.descricao.trim()) throw new Error("Informe a descrição do lançamento.");
      if (!form.valorOriginal || Number(form.valorOriginal) <= 0) throw new Error("Informe um valor válido.");
      if (!form.vencimento) throw new Error("Confirme a data de vencimento.");
      const originId = analysis?.quoteFileUrl || (file ? `${file.name}:${file.lastModified}:${file.size}` : undefined);
      const response = await fetch(`/api/tenants/${tenantId}/erp/titulos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tipo: form.tipo,
          categoria: form.categoria,
          descricao: form.descricao.trim(),
          pessoa: form.pessoa.trim() || null,
          documento: form.documento.trim() || null,
          valorOriginal: form.valorOriginal,
          vencimento: form.vencimento,
          observacoes: form.observacoes.trim() || null,
          origemTipo: "captura_documento",
          origemId: originId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) throw new Error("Este documento parece já ter sido lançado.");
        throw new Error(data?.error ?? "Não foi possível gravar no ERP.");
      }
      return data;
    },
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["erp", tenantId] });
      toast({ title: "Lançamento criado", description: "O documento foi convertido em um título real do ERP." });
    },
    onError: (error: Error) => toast({ title: "Falha ao gravar", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ScanLine className="h-6 w-6 text-primary" />Captura de documentos ERP</h1>
          <p className="text-sm text-muted-foreground mt-1">Fotografe ou envie PDF/imagem, use a leitura documental por IA e confirme os dados antes de criar o lançamento financeiro.</p>
        </div>
        <Button variant="outline" asChild><Link href="/erp">Abrir Gestão ERP</Link></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Documento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <input ref={uploadInputRef} type="file" accept="image/*,.pdf,application/pdf" className="hidden" onChange={handleFile} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => cameraInputRef.current?.click()}><Camera className="h-4 w-4 mr-2" />Fotografar</Button>
            <Button variant="outline" onClick={() => uploadInputRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Enviar arquivo</Button>
          </div>
          {file && (
            <div className="rounded-xl border bg-muted/20 p-4 flex gap-4 items-center">
              {preview ? <img src={preview} alt="Prévia do documento" className="h-24 w-24 rounded-lg border object-cover" /> : <div className="h-20 w-20 rounded-lg border grid place-items-center bg-background"><FileText className="h-8 w-8 text-primary" /></div>}
              <div className="min-w-0 flex-1"><p className="font-medium truncate">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || "arquivo"}</p></div>
              <Button onClick={() => analyze.mutate()} disabled={analyze.isPending}>{analyze.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ScanLine className="h-4 w-4 mr-2" />}Analisar</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {analysis && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3"><CardTitle className="text-base">2. Revisar dados</CardTitle>{analysis.confianca != null && <Badge variant="outline">Confiança IA: {Math.round(analysis.confianca * 100)}%</Badge>}</CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">A IA apenas sugere os dados. O lançamento só é criado depois da sua confirmação abaixo.</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Tipo</Label><Select value={form.tipo} onValueChange={(value) => setForm((current) => ({ ...current, tipo: value as TituloTipo, categoria: value === "receber" && current.categoria !== "receita" ? "receita" : current.categoria }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pagar">Conta a pagar</SelectItem><SelectItem value="receber">Conta a receber</SelectItem></SelectContent></Select></div>
              <div className="grid gap-2"><Label>Categoria</Label><Select value={form.categoria} onValueChange={(value) => setForm((current) => ({ ...current, categoria: value as Categoria }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="receita">Receita</SelectItem><SelectItem value="custo">Custo</SelectItem><SelectItem value="despesa">Despesa</SelectItem><SelectItem value="imposto">Imposto</SelectItem><SelectItem value="investimento">Investimento</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid gap-2"><Label>Descrição *</Label><Input value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} /></div>
            <div className="grid sm:grid-cols-2 gap-4"><div className="grid gap-2"><Label>Pessoa / empresa</Label><Input value={form.pessoa} onChange={(event) => setForm((current) => ({ ...current, pessoa: event.target.value }))} /></div><div className="grid gap-2"><Label>Documento (CPF/CNPJ/chave)</Label><Input value={form.documento} onChange={(event) => setForm((current) => ({ ...current, documento: event.target.value }))} /></div></div>
            <div className="grid sm:grid-cols-2 gap-4"><div className="grid gap-2"><Label>Valor *</Label><Input inputMode="decimal" value={form.valorOriginal} onChange={(event) => setForm((current) => ({ ...current, valorOriginal: event.target.value.replace(",", ".") }))} /></div><div className="grid gap-2"><Label>Vencimento *</Label><Input type="date" value={form.vencimento} onChange={(event) => setForm((current) => ({ ...current, vencimento: event.target.value }))} /></div></div>
            <div className="grid gap-2"><Label>Observações</Label><textarea value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm" /></div>
            <Button onClick={() => saveTitle.mutate()} disabled={saveTitle.isPending || saved}>{saveTitle.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}{saved ? "Lançamento criado" : "Confirmar e lançar no ERP"}</Button>
          </CardContent>
        </Card>
      )}

      {saved && <Card className="border-emerald-200 bg-emerald-50"><CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><div><p className="font-semibold text-emerald-900">Documento lançado com sucesso</p><p className="text-sm text-emerald-800">O título já faz parte do financeiro real do tenant.</p></div></div><Button asChild><Link href="/erp?tab=financeiro">Ver no ERP</Link></Button></CardContent></Card>}
    </div>
  );
}
