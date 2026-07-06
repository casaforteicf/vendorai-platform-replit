import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  Eye,
  Trash2,
  RotateCcw,
  FileText,
  Info,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const VARIABLES: { key: string; label: string; description: string }[] = [
  { key: "{{cliente_nome}}", label: "Nome do Cliente", description: "Nome completo do cliente/empresa contratante" },
  { key: "{{cliente_cnpj}}", label: "CNPJ do Cliente", description: "CNPJ ou CPF do cliente" },
  { key: "{{cliente_endereco}}", label: "Endereço do Cliente", description: "Endereço completo do cliente" },
  { key: "{{valor_total}}", label: "Valor Total", description: "Valor total do contrato formatado em R$" },
  { key: "{{condicao_pagamento}}", label: "Cond. Pagamento", description: "Condição de pagamento acordada" },
  { key: "{{prazo_entrega}}", label: "Prazo de Entrega", description: "Prazo de entrega ou vigência" },
  { key: "{{servicos}}", label: "Serviços", description: "Lista de serviços/produtos contratados" },
  { key: "{{data_contrato}}", label: "Data do Contrato", description: "Data de assinatura do contrato" },
  { key: "{{vendedor_nome}}", label: "Vendedor", description: "Nome do vendedor responsável" },
  { key: "{{empresa_nome}}", label: "Nome da Empresa", description: "Razão social da empresa contratada" },
  { key: "{{empresa_cnpj}}", label: "CNPJ da Empresa", description: "CNPJ da empresa contratada" },
];

const PREVIEW_DATA: Record<string, string> = {
  "{{cliente_nome}}": "Maria da Silva Comércio Ltda",
  "{{cliente_cnpj}}": "00.000.000/0001-00",
  "{{cliente_endereco}}": "Av. Paulista, 1000, Sala 201 — São Paulo/SP, CEP 01310-100",
  "{{valor_total}}": "R$ 5.000,00",
  "{{condicao_pagamento}}": "50% na assinatura + 50% na entrega",
  "{{prazo_entrega}}": "30 dias úteis após a assinatura do contrato",
  "{{servicos}}": "Desenvolvimento de Sistema de Gestão Personalizado",
  "{{data_contrato}}": "São Paulo, 06 de julho de 2026",
  "{{vendedor_nome}}": "João Vendedor Silva",
  "{{empresa_nome}}": "Empresa Contratada Ltda",
  "{{empresa_cnpj}}": "11.222.333/0001-44",
};

const DEFAULT_TEMPLATE_HTML = `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.7; color: #1a1a1a;">

<h1 style="text-align: center; font-size: 20px; font-weight: bold; letter-spacing: 1px; margin-bottom: 4px;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
<p style="text-align: center; font-size: 13px; color: #666; margin-top: 0;">Ref: {{data_contrato}}</p>

<hr style="border: none; border-top: 2px solid #333; margin: 28px 0;">

<div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
  <p style="margin: 0 0 10px 0;"><strong>CONTRATANTE:</strong> {{cliente_nome}}, inscrito(a) no CNPJ/CPF sob o nº {{cliente_cnpj}}, com sede em {{cliente_endereco}}.</p>
  <p style="margin: 0;"><strong>CONTRATADA:</strong> {{empresa_nome}}, inscrita no CNPJ sob o nº {{empresa_cnpj}}.</p>
</div>

<h2 style="font-size: 15px; font-weight: bold; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px;">CLÁUSULA 1ª — DO OBJETO</h2>
<p>A CONTRATADA prestará os seguintes serviços à CONTRATANTE:</p>
<p><strong>{{servicos}}</strong></p>

<h2 style="font-size: 15px; font-weight: bold; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px;">CLÁUSULA 2ª — DO VALOR E PAGAMENTO</h2>
<p>O valor total dos serviços é de <strong>{{valor_total}}</strong>.</p>
<p>Forma de pagamento: {{condicao_pagamento}}.</p>

<h2 style="font-size: 15px; font-weight: bold; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px;">CLÁUSULA 3ª — DO PRAZO</h2>
<p>{{prazo_entrega}}</p>

<h2 style="font-size: 15px; font-weight: bold; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 6px;">CLÁUSULA 4ª — DAS DISPOSIÇÕES GERAIS</h2>
<p>As partes declaram ter lido e compreendido todas as cláusulas deste instrumento, concordando com todos os seus termos.</p>
<p>Fica eleito o foro da comarca de domicílio do CONTRATANTE para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro.</p>

<div style="margin-top: 70px; display: flex; justify-content: space-between; gap: 60px;">
  <div style="flex: 1; text-align: center; border-top: 1px solid #333; padding-top: 10px;">
    <p style="margin: 0; font-weight: bold;">{{cliente_nome}}</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #555;">CONTRATANTE</p>
    <p style="margin: 2px 0 0; font-size: 11px; color: #888;">CNPJ/CPF: {{cliente_cnpj}}</p>
  </div>
  <div style="flex: 1; text-align: center; border-top: 1px solid #333; padding-top: 10px;">
    <p style="margin: 0; font-weight: bold;">{{vendedor_nome}}</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #555;">{{empresa_nome}} — CONTRATADA</p>
    <p style="margin: 2px 0 0; font-size: 11px; color: #888;">CNPJ: {{empresa_cnpj}}</p>
  </div>
</div>

</div>`;

function renderPreview(html: string): string {
  let result = html;
  for (const [key, value] of Object.entries(PREVIEW_DATA)) {
    result = result.replaceAll(key, `<span style="background:#dcfce7;border-radius:2px;padding:0 2px;">${value}</span>`);
  }
  return result;
}

interface Props {
  tenantId: string;
}

export function ContractTemplateTab({ tenantId }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [templateName, setTemplateName] = useState("Modelo personalizado");
  const [content, setContent] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const templateQuery = useQuery({
    queryKey: ["contract-template", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/contract-template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { hasTemplate: false, templateName: null, templateHtml: null };
      return res.json() as Promise<{ hasTemplate: boolean; templateName: string | null; templateHtml: string | null }>;
    },
    enabled: !!tenantId && !!token,
  });

  if (templateQuery.isSuccess && !initialized) {
    const data = templateQuery.data;
    if (data.hasTemplate && data.templateHtml) {
      setContent(data.templateHtml);
      setTemplateName(data.templateName ?? "Modelo personalizado");
    } else {
      setContent(DEFAULT_TEMPLATE_HTML);
    }
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/contract-template/editor`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ html: content, name: templateName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Erro ao salvar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-template", tenantId] });
      toast({ title: "Template salvo!", description: "Modelo de contrato atualizado com sucesso." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/contract-template`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao remover modelo");
    },
    onSuccess: () => {
      setContent(DEFAULT_TEMPLATE_HTML);
      setTemplateName("Modelo personalizado");
      setInitialized(false);
      queryClient.invalidateQueries({ queryKey: ["contract-template", tenantId] });
      toast({ title: "Modelo removido.", description: "Template resetado para o padrão." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    },
  });

  const insertVariable = useCallback((variable: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newContent = content.substring(0, start) + variable + content.substring(end);
    setContent(newContent);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + variable.length;
      ta.setSelectionRange(pos, pos);
    });
  }, [content]);

  const handleResetDefault = () => {
    setContent(DEFAULT_TEMPLATE_HTML);
    setTemplateName("Modelo personalizado");
    toast({ title: "Template resetado", description: "Conteúdo padrão carregado. Salve para confirmar." });
  };

  const hasUnsavedChanges =
    initialized &&
    templateQuery.isSuccess &&
    (content !== (templateQuery.data?.templateHtml ?? DEFAULT_TEMPLATE_HTML) ||
      templateName !== (templateQuery.data?.templateName ?? "Modelo personalizado"));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Template de Contrato</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Crie e personalize o modelo de contrato que será gerado para seus clientes.
                Use as variáveis abaixo para inserir dados dinâmicos automaticamente.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              disabled={!content}
            >
              <Eye className="h-4 w-4 mr-1.5" />
              Preview
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !content}
              className="gap-1.5"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar
            </Button>
          </div>
        </div>

        {hasUnsavedChanges && (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-xs">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Alterações não salvas. Clique em "Salvar" para confirmar.
          </div>
        )}

        {/* Template Name */}
        <div className="space-y-1.5">
          <Label htmlFor="template-name" className="text-xs font-medium">Nome do modelo</Label>
          <Input
            id="template-name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Ex: Contrato Padrão de Serviços"
            className="max-w-sm h-8 text-sm"
          />
        </div>
      </div>

      {/* Variables */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold">Variáveis dinâmicas</h4>
          <Badge variant="secondary" className="text-xs">{VARIABLES.length} disponíveis</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Clique em uma variável para inserir no cursor. Os valores são preenchidos automaticamente ao gerar o contrato.
        </p>
        <div className="flex flex-wrap gap-2">
          {VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insertVariable(v.key)}
              title={v.description}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono",
                "bg-muted/50 hover:bg-primary hover:text-primary-foreground hover:border-primary",
                "transition-colors cursor-pointer select-none"
              )}
            >
              {v.key}
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">Editor de conteúdo</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Edite diretamente o HTML do contrato. Use tags como <code className="text-xs bg-muted px-1 rounded">&lt;h2&gt;</code>, <code className="text-xs bg-muted px-1 rounded">&lt;p&gt;</code>, <code className="text-xs bg-muted px-1 rounded">&lt;strong&gt;</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={handleResetDefault}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Template padrão
            </Button>
            {templateQuery.data?.hasTemplate && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
          </div>
        </div>

        {templateQuery.isLoading ? (
          <div className="h-96 rounded-md border bg-muted/30 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Cole ou escreva o HTML do seu contrato aqui..."
            className="min-h-[480px] font-mono text-xs leading-relaxed resize-y"
            spellCheck={false}
          />
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{content.length.toLocaleString("pt-BR")} caracteres</span>
          <span className="flex items-center gap-1">
            <Info className="h-3 w-3" />
            Use o botão Preview para visualizar o resultado final
          </span>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview do Contrato
              <Badge variant="outline" className="text-xs font-normal">Dados de exemplo</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-lg bg-white">
            <div
              className="min-h-full"
              dangerouslySetInnerHTML={{ __html: renderPreview(content) }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
