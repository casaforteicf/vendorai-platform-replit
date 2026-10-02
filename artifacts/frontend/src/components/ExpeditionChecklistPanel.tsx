import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, ClipboardCheck, ScanLine, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ChecklistStatus = "pendente" | "ok" | "divergencia" | "na";

export type ExpeditionChecklist = {
  schemaVersion: number;
  tipo: string;
  etapa: string;
  status: "pendente" | "em_andamento" | "concluido" | "com_divergencia";
  contexto?: { segmento?: string | null; vertical?: string | null };
  totalCampos: number;
  concluidos: number;
  divergencias: number;
  itens: Array<{
    propostaItemIndex?: number | null;
    produtoId?: string | null;
    sku?: string | null;
    nome: string;
    quantidade: number;
    contexto?: { categoria?: string | null; nicho?: string | null };
    campos: Array<{
      id: string;
      key: string;
      label: string;
      status: ChecklistStatus;
      obrigatorio?: boolean;
      observacao?: string;
      evidencias?: Array<{ id: string; url: string; nome: string }>;
    }>;
  }>;
  verificacaoFinal?: {
    totalVolumes?: number | null;
    pesoTotalKg?: number | null;
    nomeVerificador?: string;
    data?: string | null;
    observacoes?: string;
  };
};

export function ExpeditionChecklistPanel({
  checklist,
  disabled,
  isAdmin,
  onChange,
  onUploadEvidence,
  onOverride,
}: {
  checklist: ExpeditionChecklist;
  disabled?: boolean;
  isAdmin?: boolean;
  onChange: (checklist: ExpeditionChecklist) => void;
  onUploadEvidence?: (input: {
    itemIndex: number;
    fieldIndex: number;
    item: ExpeditionChecklist["itens"][number];
    field: ExpeditionChecklist["itens"][number]["campos"][number];
    files: File[];
  }) => Promise<Array<{ id: string; url: string; nome: string }>>;
  onOverride?: (justificativa: string) => void;
}) {
  const [scanCode, setScanCode] = useState("");
  const [scannedItemIndex, setScannedItemIndex] = useState<number | null>(null);
  const [scanMessage, setScanMessage] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [uploadingEvidence, setUploadingEvidence] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;

    async function startCameraScanner() {
      const BarcodeDetectorCtor = (window as any).BarcodeDetector;
      if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
        setCameraMessage("Leitura por câmera não disponível neste navegador. Use o leitor USB/Bluetooth ou digite o código.");
        setCameraOpen(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new BarcodeDetectorCtor({
          formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf"],
        });
        const detect = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes?.[0]?.rawValue;
            if (value) {
              setScanCode(String(value));
              const normalized = String(value).trim().toLocaleLowerCase("pt-BR");
              const index = checklist.itens.findIndex((item) => [
                item.sku,
                item.produtoId,
                item.propostaItemIndex != null ? String(item.propostaItemIndex) : null,
                item.nome,
              ].filter(Boolean).some((candidate) => String(candidate).toLocaleLowerCase("pt-BR") === normalized));
              setScannedItemIndex(index >= 0 ? index : null);
              setScanMessage(index >= 0 ? `Item localizado: ${checklist.itens[index].nome}` : `Código ${value} não pertence a este lote.`);
              setCameraOpen(false);
              return;
            }
          } catch {
            // Mantém a leitura ativa; frames intermediários podem falhar.
          }
          timer = window.setTimeout(detect, 250);
        };
        void detect();
      } catch {
        setCameraMessage("Não foi possível acessar a câmera. Verifique a permissão do navegador.");
        setCameraOpen(false);
      }
    }

    void startCameraScanner();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [cameraOpen, checklist.itens]);

  function recalculate(itens: ExpeditionChecklist["itens"], verificacaoFinal = checklist.verificacaoFinal) {
    const fields = itens.flatMap((item) => item.campos);
    const concluidos = fields.filter((field) => field.status !== "pendente").length;
    const divergencias = fields.filter((field) => field.status === "divergencia").length;
    const fullyChecked = fields.length > 0 && concluidos === fields.length;
    const verifierOk = Boolean(verificacaoFinal?.nomeVerificador?.trim());
    return {
      concluidos,
      divergencias,
      status: divergencias > 0
        ? "com_divergencia" as const
        : fullyChecked && verifierOk
          ? "concluido" as const
          : concluidos > 0 ? "em_andamento" as const : "pendente" as const,
    };
  }

  function setField(itemIndex: number, fieldIndex: number, status: ChecklistStatus) {
    const itens = checklist.itens.map((item, i) => i !== itemIndex ? item : {
      ...item,
      campos: item.campos.map((field, j) => j !== fieldIndex ? field : { ...field, status }),
    });
    const summary = recalculate(itens);
    onChange({
      ...checklist,
      itens,
      ...summary,
      verificacaoFinal: {
        ...(checklist.verificacaoFinal ?? {}),
        ...(summary.status === "concluido" && !checklist.verificacaoFinal?.data ? { data: new Date().toISOString() } : {}),
      },
    });
  }

  function setFieldObservation(itemIndex: number, fieldIndex: number, observacao: string) {
    const itens = checklist.itens.map((item, i) => i !== itemIndex ? item : {
      ...item,
      campos: item.campos.map((field, j) => j !== fieldIndex ? field : { ...field, observacao }),
    });
    onChange({ ...checklist, itens });
  }

  function markAllOk() {
    const itens = checklist.itens.map((item) => ({
      ...item,
      campos: item.campos.map((field) => field.status === "na" ? field : { ...field, status: "ok" as const }),
    }));
    const summary = recalculate(itens);
    onChange({ ...checklist, itens, ...summary });
  }

  function setFinal(field: "totalVolumes" | "pesoTotalKg" | "nomeVerificador" | "observacoes", value: string) {
    const numeric = field === "totalVolumes" || field === "pesoTotalKg";
    const parsed = numeric ? (value.trim() ? Number(value.replace(",", ".")) : null) : value;
    const verificacaoFinal = {
      ...(checklist.verificacaoFinal ?? {}),
      [field]: numeric && typeof parsed === "number" && !Number.isFinite(parsed) ? null : parsed,
    };
    const summary = recalculate(checklist.itens, verificacaoFinal);
    onChange({
      ...checklist,
      verificacaoFinal: {
        ...verificacaoFinal,
        ...(summary.status === "concluido" && !verificacaoFinal.data ? { data: new Date().toISOString() } : {}),
      },
      ...summary,
    });
  }

  function scanItem() {
    const code = scanCode.trim().toLocaleLowerCase("pt-BR");
    if (!code) return;
    const index = checklist.itens.findIndex((item) => {
      const values = [
        item.sku,
        item.produtoId,
        item.propostaItemIndex != null ? String(item.propostaItemIndex) : null,
        item.nome,
      ].filter(Boolean).map((value) => String(value).toLocaleLowerCase("pt-BR"));
      return values.some((value) => value === code || value.includes(code));
    });
    setScannedItemIndex(index >= 0 ? index : null);
    setScanMessage(index >= 0 ? `Item localizado: ${checklist.itens[index].nome}` : "Código não encontrado neste lote.");
  }

  async function uploadEvidence(itemIndex: number, fieldIndex: number, files: File[]) {
    if (!onUploadEvidence || !files.length) return;
    const item = checklist.itens[itemIndex];
    const field = item.campos[fieldIndex];
    const key = `${itemIndex}-${fieldIndex}`;
    setUploadingEvidence(key);
    try {
      const uploaded = await onUploadEvidence({ itemIndex, fieldIndex, item, field, files });
      const itens = checklist.itens.map((currentItem, i) => i !== itemIndex ? currentItem : {
        ...currentItem,
        campos: currentItem.campos.map((currentField, j) => j !== fieldIndex ? currentField : {
          ...currentField,
          evidencias: [...(currentField.evidencias ?? []), ...uploaded],
        }),
      });
      onChange({ ...checklist, itens });
    } finally {
      setUploadingEvidence(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardCheck className="h-4 w-4" /> Checklist de expedição
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Gerado conforme produto e contexto do tenant
            {checklist.contexto?.segmento ? ` • ${checklist.contexto.segmento}` : ""}
            {checklist.contexto?.vertical ? ` • ${checklist.contexto.vertical}` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={checklist.divergencias > 0 ? "destructive" : checklist.status === "concluido" ? "default" : "secondary"}>
            {checklist.concluidos}/{checklist.totalCampos}
          </Badge>
          <Button disabled={disabled} size="sm" variant="outline" className="h-7 text-xs" onClick={markAllOk}>
            Marcar pendentes como OK
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <ScanLine className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={scanCode}
              placeholder="Ler QR/código de barras ou digitar SKU/código"
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") scanItem(); }}
            />
          </div>
          <Button type="button" variant="outline" onClick={scanItem}>Localizar item</Button>
          <Button type="button" variant="outline" onClick={() => { setCameraMessage(""); setCameraOpen((open) => !open); }}>
            <Camera className="mr-1.5 h-4 w-4" /> {cameraOpen ? "Fechar câmera" : "Ler com câmera"}
          </Button>
        </div>
        {cameraOpen && (
          <div className="mt-3 overflow-hidden rounded-lg border bg-black">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
          </div>
        )}
        {cameraMessage && <p className="mt-2 text-xs text-muted-foreground">{cameraMessage}</p>}
        {scanMessage && <p className="mt-2 text-xs text-muted-foreground">{scanMessage}</p>}
      </div>

      <div className="space-y-3">
        {checklist.itens.map((item, itemIndex) => (
          <div key={`${item.propostaItemIndex ?? itemIndex}-${item.sku ?? item.nome}`} className={`rounded-lg border ${scannedItemIndex === itemIndex ? "ring-2 ring-primary" : ""}`}>
            <div className="bg-muted/30 px-3 py-2">
              <p className="text-sm font-medium">{item.nome}</p>
              <p className="text-[11px] text-muted-foreground">
                {item.quantidade} un.
                {item.sku ? ` • SKU ${item.sku}` : ""}
                {item.contexto?.nicho ? ` • ${item.contexto.nicho}` : ""}
                {item.contexto?.categoria ? ` • ${item.contexto.categoria}` : ""}
              </p>
            </div>
            <div className="divide-y">
              {item.campos.map((field, fieldIndex) => (
                <div key={field.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm">{field.label}</span>
                  <div className="flex gap-1">
                    <Button disabled={disabled} size="sm" variant={field.status === "ok" ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setField(itemIndex, fieldIndex, "ok")}>OK</Button>
                    <Button disabled={disabled} size="sm" variant={field.status === "divergencia" ? "destructive" : "outline"} className="h-7 px-2 text-xs" onClick={() => setField(itemIndex, fieldIndex, "divergencia")}>Divergência</Button>
                    <Button disabled={disabled} size="sm" variant={field.status === "na" ? "secondary" : "outline"} className="h-7 px-2 text-xs" onClick={() => setField(itemIndex, fieldIndex, "na")}>N/A</Button>
                  </div>
                  {field.status === "divergencia" && (
                    <div className="w-full basis-full space-y-2">
                      <Textarea
                        disabled={disabled}
                        rows={2}
                        placeholder="Descreva a divergência, quantidade afetada e ação necessária."
                        defaultValue={field.observacao ?? ""}
                        onBlur={(e) => setFieldObservation(itemIndex, fieldIndex, e.currentTarget.value)}
                      />
                      {onUploadEvidence && (
                        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs hover:bg-muted/40">
                          <Camera className="h-4 w-4" />
                          <span>{uploadingEvidence === `${itemIndex}-${fieldIndex}` ? "Enviando evidência..." : "Adicionar foto/evidência da divergência"}</span>
                          <input
                            className="hidden"
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={disabled || uploadingEvidence === `${itemIndex}-${fieldIndex}`}
                            onChange={(e) => {
                              const files = Array.from(e.target.files ?? []);
                              e.target.value = "";
                              if (files.length) void uploadEvidence(itemIndex, fieldIndex, files);
                            }}
                          />
                        </label>
                      )}
                      {(field.evidencias?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {field.evidencias!.map((evidence) => (
                            <a key={evidence.id} href={evidence.url} target="_blank" rel="noreferrer" className="rounded-md border px-2 py-1 text-[11px] hover:bg-muted/50">
                              {evidence.nome}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Total de volumes</label>
          <Input disabled={disabled} type="number" min={0} defaultValue={checklist.verificacaoFinal?.totalVolumes ?? ""} onBlur={(e) => setFinal("totalVolumes", e.currentTarget.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Peso total (kg)</label>
          <Input disabled={disabled} type="number" min={0} step="any" defaultValue={checklist.verificacaoFinal?.pesoTotalKg ?? ""} onBlur={(e) => setFinal("pesoTotalKg", e.currentTarget.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium">Verificador final</label>
          <Input disabled={disabled} defaultValue={checklist.verificacaoFinal?.nomeVerificador ?? ""} onBlur={(e) => setFinal("nomeVerificador", e.currentTarget.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium">Observações da expedição</label>
          <Textarea disabled={disabled} rows={3} defaultValue={checklist.verificacaoFinal?.observacoes ?? ""} onBlur={(e) => setFinal("observacoes", e.currentTarget.value)} />
        </div>
      </div>

      {checklist.status !== "concluido" && checklist.divergencias === 0 && (
        <p className="text-xs text-muted-foreground">
          Para liberar o transporte, conclua os campos aplicáveis e informe o verificador final.
        </p>
      )}

      {isAdmin && onOverride && checklist.status !== "concluido" && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/50 p-3">
          <div className="flex items-start gap-2 text-xs">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Liberação com ressalva é excepcional e ficará registrada com usuário, data/hora e justificativa.</span>
          </div>
          <Textarea
            rows={2}
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Justificativa obrigatória para liberar o transporte com pendência/divergência."
          />
          <Button type="button" size="sm" variant="outline" disabled={disabled || overrideReason.trim().length < 5} onClick={() => onOverride(overrideReason.trim())}>
            Liberar com ressalva
          </Button>
        </div>
      )}

      {checklist.divergencias > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>Existem {checklist.divergencias} divergência(s). Revise o lote antes da saída para transporte.</span>
        </div>
      )}
    </div>
  );
}