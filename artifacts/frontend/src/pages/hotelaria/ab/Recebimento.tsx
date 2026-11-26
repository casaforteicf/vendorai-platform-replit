import { useEffect, useMemo, useState } from "react";
import HotelModulesNav from "../HotelModulesNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { hojeISO } from "@/lib/ab/datas";
import {
  avaliarSanidade,
  classificarFefo,
  diasAteValidade,
  exigeTemperatura,
  ROTULO_FEFO,
  TEMPERATURA_MAXIMA_CARNE_C,
  type EtiquetaFefo,
} from "@/lib/ab/fefo";
import {
  criarRecebimento,
  listarEntregasPendentes,
  listarInsumosRecebimento,
  mensagemDoErro,
  type AbAuth,
  type EntregaPendente,
  type InsumoRecebimento,
} from "@/lib/ab/client";

/**
 * Recebimento de mercadorias com lote, temperatura e etiqueta FEFO (AB-06).
 *
 * O cliente mostra a etiqueta e o alerta sanitário ao vivo, mas NÃO decide
 * nada: a API recalcula FEFO e status no POST. Se divergirem, vale o servidor —
 * é ele que grava o registro auditável.
 *
 * O catálogo real vem dos insumos do restaurante; o mock fica apenas como
 * fallback visual enquanto a lista carrega (e nos testes de tela).
 */

const INSUMOS_MOCK = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    nome: "Carne de Gado — Patinho",
    unidade: "g",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    nome: "Queijo Mussarela",
    unidade: "g",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    nome: "Alface Crespa",
    unidade: "un",
  },
] as const;

const ESTILO_ETIQUETA: Record<EtiquetaFefo, { card: string; chip: string }> = {
  verde: {
    card: "border-emerald-400 bg-emerald-50 text-emerald-900",
    chip: "bg-emerald-600 text-white",
  },
  amarelo: {
    card: "border-amber-400 bg-amber-50 text-amber-900",
    chip: "bg-amber-500 text-white",
  },
  vermelho: {
    card: "border-red-400 bg-red-50 text-red-900",
    chip: "bg-red-600 text-white",
  },
};

type Formulario = {
  insumoId: string;
  notaFiscal: string;
  fornecedor: string;
  lote: string;
  dataValidade: string;
  temperatura: string;
  quantidade: string;
  unidade: "g" | "ml" | "un";
  ordemId: string;
  ordemItemId: string;
};

const FORM_VAZIO: Formulario = {
  insumoId: INSUMOS_MOCK[0].id,
  notaFiscal: "",
  fornecedor: "",
  lote: "",
  dataValidade: "",
  temperatura: "",
  quantidade: "",
  unidade: "g",
  ordemId: "",
  ordemItemId: "",
};

function paraNumero(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!limpo) return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : null;
}

export default function Recebimento() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);

  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [insumos, setInsumos] = useState<InsumoRecebimento[]>(INSUMOS_MOCK.map((item) => ({ ...item, categoria: null })));
  const [pedidos, setPedidos] = useState<EntregaPendente[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<{
    etiqueta: EtiquetaFefo;
    status: string;
    motivo: string | null;
    estoque?: { aplicado: boolean; motivo?: string; quantidadeEstoque?: number; unidadeEstoque?: string } | null;
  } | null>(null);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelado = false;
    void Promise.all([listarInsumosRecebimento(auth), listarEntregasPendentes(auth)])
      .then(([listaInsumos, listaPedidos]) => {
        if (cancelado) return;
        if (listaInsumos.length > 0) {
          setInsumos(listaInsumos);
          setForm((atual) => listaInsumos.some((item) => item.id === atual.insumoId)
            ? atual
            : { ...atual, insumoId: listaInsumos[0]!.id });
        }
        setPedidos(listaPedidos);
      })
      .catch(() => {
        // O mock inicial mantém a tela útil em ambientes sem catálogo.
      });
    return () => { cancelado = true; };
  }, [auth, tenantId, token]);

  const insumo = insumos.find((item) => item.id === form.insumoId);
  const pedidoSelecionado = pedidos.find((pedido) => pedido.id === form.ordemId) ?? null;
  const itemSelecionado = pedidoSelecionado?.itens.find((item) => item.id === form.ordemItemId) ?? null;
  const temperatura = paraNumero(form.temperatura);
  const hoje = hojeISO();

  const sanidade = avaliarSanidade({
    categoriaNome: insumo?.categoria ?? null,
    temperaturaC: temperatura,
  });
  const temperaturaObrigatoria = exigeTemperatura(insumo?.categoria);

  // Etiqueta ao vivo (o servidor recalcula no salvamento).
  const etiquetaPrevista: EtiquetaFefo | null =
    form.dataValidade && /^\d{4}-\d{2}-\d{2}$/.test(form.dataValidade)
      ? classificarFefo(form.dataValidade, hoje)
      : null;

  const dias = etiquetaPrevista ? diasAteValidade(form.dataValidade, hoje) : null;
  const etiquetaExibida = salvo?.etiqueta ?? etiquetaPrevista;
  const estilo = etiquetaExibida ? ESTILO_ETIQUETA[etiquetaExibida] : null;

  function atualizar(parcial: Partial<Formulario>) {
    setForm((atual) => ({ ...atual, ...parcial }));
    setErro(null);
  }

  async function registrar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvo(null);

    if (!tenantId) {
      setErro("Sessão sem hotel identificado. Entre novamente.");
      return;
    }
    if (!form.notaFiscal.trim()) {
      setErro("Informe a nota fiscal.");
      return;
    }
    if (!form.lote.trim()) {
      setErro("Informe o lote.");
      return;
    }
    if (!etiquetaPrevista) {
      setErro("Informe a data de validade.");
      return;
    }
    const quantidade = paraNumero(form.quantidade);
    if (quantidade === null || quantidade <= 0) {
      setErro("Informe a quantidade (maior que zero).");
      return;
    }
    if (temperaturaObrigatoria && temperatura === null) {
      setErro("Temperatura obrigatória para esta categoria.");
      return;
    }

    setEnviando(true);
    try {
      const criado = await criarRecebimento(auth, {
        insumoId: form.insumoId,
        notaFiscal: form.notaFiscal.trim(),
        fornecedor: form.fornecedor.trim() || null,
        lote: form.lote.trim(),
        dataValidade: form.dataValidade,
        temperaturaC: temperatura,
        quantidade,
        unidade: form.unidade,
        ...(form.ordemId && form.ordemItemId ? { ordemId: form.ordemId, ordemItemId: form.ordemItemId } : {}),
      });

      setSalvo({
        etiqueta: (criado.etiquetaFefo as EtiquetaFefo) ?? etiquetaPrevista,
        status: criado.status,
        motivo: criado.motivoBloqueio ?? null,
        estoque: criado.estoque ?? null,
      });
      setForm(FORM_VAZIO);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <HotelModulesNav />

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Hotelaria · A&amp;B
        </p>
        <h1 className="text-2xl font-semibold">Recebimento de mercadorias</h1>
        <p className="text-sm text-muted-foreground">
          Entrada com lote, validade e temperatura. A etiqueta FEFO e o bloqueio sanitário são
          calculados no servidor.
        </p>
      </header>

      <Card>
        <CardHeader className="gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Dados da nota</CardTitle>
            <Badge variant="outline">Catálogo de exemplo</Badge>
          </div>
          <CardDescription>
            A gravação é real em <code className="text-xs">ab_recebimentos</code>.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={registrar} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pedido">Entrega pendente (opcional)</Label>
                <select
                  id="pedido"
                  className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.ordemId}
                  onChange={(e) => {
                    const pedido = pedidos.find((item) => item.id === e.target.value) ?? null;
                    const item = pedido?.itens[0] ?? null;
                    atualizar({
                      ordemId: e.target.value,
                      ordemItemId: item?.id ?? "",
                      ...(item ? { insumoId: item.insumoId, quantidade: String(Number(item.quantidade) - Number(item.quantidadeRecebida)), unidade: item.unidade } : {}),
                    });
                  }}
                >
                  <option value="">Compra avulsa / sem pedido</option>
                  {pedidos.map((pedido) => (
                    <option key={pedido.id} value={pedido.id}>
                      {pedido.coberturaInicio} → {pedido.coberturaFim}{pedido.fornecedor ? ` · ${pedido.fornecedor}` : ""} · {pedido.status}
                    </option>
                  ))}
                </select>
              </div>

              {pedidoSelecionado && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="pedido-item">Item do pedido</Label>
                  <select
                    id="pedido-item"
                    className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.ordemItemId}
                    onChange={(e) => {
                      const item = pedidoSelecionado.itens.find((atual) => atual.id === e.target.value) ?? null;
                      atualizar({
                        ordemItemId: e.target.value,
                        ...(item ? { insumoId: item.insumoId, quantidade: String(Number(item.quantidade) - Number(item.quantidadeRecebida)), unidade: item.unidade } : {}),
                      });
                    }}
                  >
                    <option value="">Selecione o item</option>
                    {pedidoSelecionado.itens.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.insumoNome} · pendente {Number(item.quantidade) - Number(item.quantidadeRecebida)} {item.unidade}
                      </option>
                    ))}
                  </select>
                  {itemSelecionado && (
                    <p className="text-xs text-muted-foreground">Insumo do A&B: {itemSelecionado.insumoNome}</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="insumo">Insumo</Label>
                <select
                  id="insumo"
                  value={form.insumoId}
                  onChange={(e) => atualizar({ insumoId: e.target.value })}
                  className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {insumos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome} · {item.unidade}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nota">
                  Nota fiscal <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="nota"
                  value={form.notaFiscal}
                  onChange={(e) => atualizar({ notaFiscal: e.target.value })}
                  placeholder="Ex.: 12345"
                  maxLength={60}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fornecedor">Fornecedor</Label>
                <Input
                  id="fornecedor"
                  value={form.fornecedor}
                  onChange={(e) => atualizar({ fornecedor: e.target.value })}
                  placeholder="Ex.: Frigorífico Alfa"
                  maxLength={120}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lote">
                  Lote <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="lote"
                  value={form.lote}
                  onChange={(e) => atualizar({ lote: e.target.value })}
                  placeholder="Ex.: L-2026-11"
                  maxLength={60}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="validade">
                  Data de validade <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="validade"
                  type="date"
                  value={form.dataValidade}
                  onChange={(e) => atualizar({ dataValidade: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="temperatura">
                  Temperatura (°C){" "}
                  {temperaturaObrigatoria && <span className="text-red-600">*</span>}
                </Label>
                <Input
                  id="temperatura"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form.temperatura}
                  onChange={(e) => atualizar({ temperatura: e.target.value })}
                  placeholder={temperaturaObrigatoria ? "Ex.: -18" : "opcional"}
                  aria-invalid={sanidade.temperaturaInadequada || undefined}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quantidade">
                  Quantidade <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="quantidade"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={form.quantidade}
                  onChange={(e) => atualizar({ quantidade: e.target.value })}
                  placeholder="Ex.: 20"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unidade">Unidade</Label>
                <select
                  id="unidade"
                  value={form.unidade}
                  onChange={(e) => atualizar({ unidade: e.target.value as Formulario["unidade"] })}
                  className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="un">un</option>
                </select>
              </div>
            </div>

            {sanidade.temperaturaInadequada && (
              <p
                role="alert"
                className="rounded-lg border border-red-400 bg-red-50 p-3 text-sm font-medium text-red-900"
              >
                Temperatura inadequada. Risco Sanitário. ({temperatura?.toFixed(1)} °C — o limite é{" "}
                {TEMPERATURA_MAXIMA_CARNE_C.toFixed(1)} °C)
              </p>
            )}

            {erro && (
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                {erro}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setForm(FORM_VAZIO);
                  setErro(null);
                  setSalvo(null);
                }}
                disabled={enviando}
              >
                Limpar
              </Button>
              <Button
                type="submit"
                disabled={enviando}
                className={
                  sanidade.temperaturaInadequada
                    ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                    : undefined
                }
              >
                {enviando ? "Registrando…" : "Registrar Entrada"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {etiquetaExibida && estilo && (
        <Card className={`border-2 ${estilo.card}`}>
          <CardHeader className="gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Etiqueta FEFO</CardTitle>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${estilo.chip}`}>
                {ROTULO_FEFO[etiquetaExibida].toUpperCase()}
              </span>
            </div>
            <CardDescription className="text-current/80">
              {salvo
                ? "Calculada e gravada pelo servidor no recebimento."
                : "Prévia calculada na tela — o servidor recalcula ao registrar."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-semibold">{insumo?.nome ?? "—"}</p>
            <p>
              Lote {form.lote || salvo ? form.lote || "—" : "—"} · validade{" "}
              {form.dataValidade ? new Date(`${form.dataValidade}T12:00:00`).toLocaleDateString("pt-BR") : "—"}
              {dias !== null && ` · ${dias} dia(s)`}
            </p>
            {salvo && (
              <p className="font-medium">
                Status: {salvo.status === "aprovado" ? "Aprovado" : "Bloqueado"}
                {salvo.motivo ? ` — ${salvo.motivo}` : ""}
              </p>
            )}
            {salvo?.estoque?.aplicado && (
              <p className="font-medium">
                Estoque atualizado: +{salvo.estoque.quantidadeEstoque} {salvo.estoque.unidadeEstoque}
              </p>
            )}
            {salvo?.estoque && !salvo.estoque.aplicado && (
              <p className="font-medium">
                Não entrou no estoque: {salvo.estoque.motivo ?? "motivo não informado"} — o
                recebimento ficou registrado e pode ser reprocessado.
              </p>
            )}
            {!salvo && sanidade.status === "bloqueado" && (
              <p className="font-medium">Ao registrar, entrará como BLOQUEADO: {sanidade.motivoBloqueio}</p>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
