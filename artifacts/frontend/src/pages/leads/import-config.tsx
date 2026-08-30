import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";

const STORAGE_KEY = "vendorai_leads_import_mapping_v2";
const NONE = "__none__";

type FieldKey = "nome" | "telefone" | "documento" | "endereco" | "email" | "instagram" | "empresa" | "status" | "responsavel";
type Mapping = Record<FieldKey, string>;

type ImportResult = {
  imported: number;
  errors: Array<{ row: number; message: string }>;
};

const fields: Array<{ key: FieldKey; label: string; required?: boolean }> = [
  { key: "nome", label: "Nome", required: true },
  { key: "telefone", label: "Telefone" },
  { key: "documento", label: "CPF/CNPJ" },
  { key: "endereco", label: "Endereço" },
  { key: "email", label: "E-mail" },
  { key: "instagram", label: "Instagram" },
  { key: "empresa", label: "Empresa" },
  { key: "status", label: "Status" },
  { key: "responsavel", label: "Responsável" },
];

const aliases: Record<FieldKey, string[]> = {
  nome: ["nome", "name", "cliente", "contato"],
  telefone: ["telefone", "phone", "celular", "whatsapp", "fone"],
  documento: ["documento", "cpf", "cnpj", "cpf/cnpj", "cpf_cnpj"],
  endereco: ["endereco", "endereço", "address", "logradouro"],
  email: ["email", "e-mail", "mail"],
  instagram: ["instagram", "instagram_handle", "@instagram"],
  empresa: ["empresa", "company", "razao social", "razão social"],
  status: ["status", "situacao", "situação"],
  responsavel: ["responsavel", "responsável", "vendedor", "owner"],
};

function normalize(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function detectDelimiter(line: string) {
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && ch === ",") commas++;
    else if (!inQuotes && ch === ";") semicolons++;
  }
  return semicolons > commas ? ";" : ",";
}

function parseLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { headers: [] as string[], rows: [] as string[][] };
  const delimiter = detectDelimiter(lines[0]!);
  const headers = parseLine(lines[0]!, delimiter).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => parseLine(line, delimiter));
  return { headers, rows };
}

function autoMapping(headers: string[]): Mapping {
  const result = Object.fromEntries(fields.map(({ key }) => [key, NONE])) as Mapping;
  const normalizedHeaders = headers.map(normalize);
  for (const field of fields) {
    const wanted = aliases[field.key].map(normalize);
    const index = normalizedHeaders.findIndex((header) => wanted.includes(header));
    if (index >= 0) result[field.key] = headers[index]!;
  }
  return result;
}

export default function ImportConfig() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : (Object.fromEntries(fields.map(({ key }) => [key, NONE])) as Mapping);
    } catch {
      return Object.fromEntries(fields.map(({ key }) => [key, NONE])) as Mapping;
    }
  });
  const [result, setResult] = useState<ImportResult | null>(null);

  const headerIndex = useMemo(() => new Map(headers.map((header, index) => [header, index])), [headers]);

  const mappedRows = useMemo(() => {
    const mappedHeaders = new Set(Object.values(mapping).filter((value) => value !== NONE));
    return rows.map((row) => {
      const read = (key: FieldKey) => {
        const header = mapping[key];
        if (!header || header === NONE) return "";
        const index = headerIndex.get(header);
        return index === undefined ? "" : (row[index] ?? "").trim();
      };
      const camposExtras: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (mappedHeaders.has(header)) return;
        const value = (row[index] ?? "").trim();
        if (value) camposExtras[header] = value;
      });
      return {
        nome: read("nome"),
        telefone: read("telefone") || null,
        documento: read("documento") || null,
        endereco: read("endereco") || null,
        email: read("email") || null,
        instagram: read("instagram") || null,
        empresa: read("empresa") || null,
        status: read("status") || null,
        responsavel: read("responsavel") || null,
        camposExtras,
      };
    }).filter((row) => row.nome);
  }, [rows, headers, mapping, headerIndex]);

  async function loadFile(file: File) {
    setResult(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.headers.length || !parsed.rows.length) {
      toast({ title: "CSV vazio ou inválido", description: "O arquivo precisa ter cabeçalho e pelo menos uma linha de dados.", variant: "destructive" });
      return;
    }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    const auto = autoMapping(parsed.headers);
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Mapping | null;
      if (saved) {
        for (const key of Object.keys(saved) as FieldKey[]) {
          if (!parsed.headers.includes(saved[key])) saved[key] = auto[key];
        }
        setMapping({ ...auto, ...saved });
      } else {
        setMapping(auto);
      }
    } catch {
      setMapping(auto);
    }
  }

  function updateMapping(key: FieldKey, value: string) {
    setMapping((current) => ({ ...current, [key]: value }));
  }

  function saveMapping() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
    toast({ title: "Mapeamento salvo", description: "As próximas planilhas com os mesmos cabeçalhos usarão este mapeamento." });
  }

  const importLeads = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant não identificado.");
      if (mapping.nome === NONE) throw new Error("Mapeie a coluna Nome antes de importar.");
      if (!mappedRows.length) throw new Error("Nenhum lead válido foi encontrado.");
      if (mappedRows.length > 500) throw new Error("O limite por importação é de 500 leads. Divida o arquivo em partes.");
      const response = await fetch(`/api/tenants/${tenantId}/leads/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ leads: mappedRows }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Falha na importação.");
      return data as ImportResult;
    },
    onSuccess: (data) => {
      setResult(data);
      saveMapping();
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: `${data.imported} lead(s) importado(s)`, description: data.errors.length ? `${data.errors.length} linha(s) foram ignoradas ou sinalizadas.` : "Importação concluída sem erros." });
    },
    onError: (error: Error) => toast({ title: "Não foi possível importar", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileSpreadsheet className="h-6 w-6 text-primary" />Importação inteligente de leads</h1>
        <p className="text-sm text-muted-foreground mt-1">Não precisa preparar a planilha sozinho. Envie o arquivo exportado e o TAD ajudará a organizar cada coluna antes da confirmação.</p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader><CardTitle className="text-base">Antes de enviar o arquivo</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>No sistema que você usa hoje, procure por <strong>Exportar</strong>, <strong>Relatório de clientes</strong> ou <strong>Lista de contatos</strong>.</p>
          <p>Salve em CSV. Se receber uma planilha do Excel, abra o arquivo e escolha <strong>Salvar como → CSV</strong>.</p>
          <div className="rounded-lg bg-background p-3 text-muted-foreground">
            Informações mais importantes: <strong>nome, telefone, e-mail, empresa, cidade, origem, responsável, etapa atual e observações</strong>. Não tem problema se os nomes das colunas forem diferentes — o TAD ajudará no próximo passo.
          </div>
          <p className="text-xs text-muted-foreground">Nada será importado sem você conferir a prévia e confirmar.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Selecione o arquivo exportado</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFile(file); }} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Selecionar CSV</Button>
            {fileName && <Badge variant="secondary">{fileName}</Badge>}
            {rows.length > 0 && <span className="text-sm text-muted-foreground">{rows.length} linha(s) encontradas</span>}
          </div>
          <p className="text-xs text-muted-foreground">Aceita arquivos separados por vírgula ou ponto e vírgula e preserva campos com vírgulas entre aspas.</p>
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">2. Mapeamento de colunas</CardTitle></CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {fields.map((field) => (
                <div key={field.key} className="grid gap-2">
                  <Label>{field.label}{field.required ? " *" : ""}</Label>
                  <Select value={mapping[field.key]} onValueChange={(value) => updateMapping(field.key, value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {!field.required && <SelectItem value={NONE}>Não importar</SelectItem>}
                      {headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end"><Button variant="outline" onClick={saveMapping}>Salvar mapeamento</Button></div>
          </CardContent>
        </Card>
      )}

      {mappedRows.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3"><CardTitle className="text-base">3. Prévia</CardTitle><Badge>{mappedRows.length} lead(s) válidos</Badge></CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr className="text-left"><th className="p-3">Nome</th><th className="p-3">Telefone</th><th className="p-3">E-mail</th><th className="p-3">Empresa</th><th className="p-3">Status</th><th className="p-3">Extras</th></tr></thead>
                <tbody>{mappedRows.slice(0, 8).map((row, index) => <tr key={`${row.nome}-${index}`} className="border-t"><td className="p-3 font-medium">{row.nome}</td><td className="p-3">{row.telefone || "—"}</td><td className="p-3">{row.email || "—"}</td><td className="p-3">{row.empresa || "—"}</td><td className="p-3">{row.status || "novo"}</td><td className="p-3">{Object.keys(row.camposExtras).length}</td></tr>)}</tbody>
              </table>
            </div>
            {mappedRows.length > 8 && <p className="text-xs text-muted-foreground text-center">Prévia das primeiras 8 linhas de {mappedRows.length}.</p>}
            <Button onClick={() => importLeads.mutate()} disabled={importLeads.isPending || mapping.nome === NONE} className="w-full md:w-auto">
              {importLeads.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Importar {mappedRows.length} lead(s)
            </Button>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Resultado da importação</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3"><Badge className="bg-emerald-100 text-emerald-700">{result.imported} importado(s)</Badge>{result.errors.length > 0 && <Badge variant="outline" className="text-amber-700">{result.errors.length} aviso(s)</Badge>}</div>
            {result.errors.length > 0 && <div className="max-h-56 overflow-auto rounded-lg border divide-y">{result.errors.slice(0, 100).map((error, index) => <div key={`${error.row}-${index}`} className="p-3 text-sm flex gap-2"><AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" /><span>Linha {error.row}: {error.message}</span></div>)}</div>}
            {result.imported === 0 && result.errors.length > 0 && <div className="flex items-center gap-2 text-sm text-destructive"><XCircle className="h-4 w-4" />Nenhuma nova linha foi gravada.</div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
