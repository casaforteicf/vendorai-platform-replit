import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

// Modal de cálculo de orçamento por m² (teto vinílico, revestimento de parede).
// Ver claude/calculo-orcamento-m2-e-perfil.md no projeto pra contexto completo.
// Componente é só apresentação/estado de formulário — quem faz a chamada de API
// é o `onCalcular` passado pela tela que usa este componente (Propostas.tsx),
// pra reaproveitar o mesmo jeito de autenticar/fetch que o resto da tela já usa.

export interface ProdutoParaCalculoM2 {
  id: string;
  nome: string;
  tipoCalculo?: string | null;
}

export interface CatalogoItemParaAcessorio {
  id: string;
  nome: string;
}

interface SuperficieForm {
  nome: string;
  largura: string;
  comprimento: string;
  altura: string;
  m2Direto: string;
  perimetroManual: string;
}

export interface ResultadoCalculoM2 {
  produtoPrincipal: {
    produtoId: string;
    quantidadeNecessaria: number;
    numeroPacotes: number;
    valorTotal: number;
    detalhamentoSuperficies: { nome?: string; area: number; perimetro?: number }[];
  };
  /** @deprecated use composicao — mantido só por compatibilidade de leitura. */
  acessorioPerimetro?: {
    produtoId: string;
    quantidadeNecessaria: number;
    numeroPacotes: number;
    valorTotal: number;
  };
  /** Composição de N itens (generaliza acessorioPerimetro), na mesma ordem de itensComposicao. */
  composicao?: {
    produtoId: string;
    quantidadeNecessaria: number;
    numeroPacotes: number;
    valorTotal: number;
  }[];
  itensComposicao?: { produtoId: string; nome: string; baseCalculo: "area" | "perimetro" }[];
  acessorioSugeridoAutomaticamente: boolean;
}

export interface ResultadoConfirmadoCalculoM2 {
  quantidade: number;
  precoUnitario: number;
  /** @deprecated use itensComposicao — mantido só por compatibilidade. */
  acessorio?: {
    produtoId: string;
    nome: string;
    quantidade: number;
    precoUnitario: number;
  };
  itensComposicao?: {
    produtoId: string;
    nome: string;
    quantidade: number;
    precoUnitario: number;
  }[];
}

function novaSuperficie(): SuperficieForm {
  return { nome: "", largura: "", comprimento: "", altura: "", m2Direto: "", perimetroManual: "" };
}

export function CalculoOrcamentoM2Dialog({
  open,
  onOpenChange,
  produto,
  acessoriosDisponiveis,
  onCalcular,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produto: ProdutoParaCalculoM2 | null;
  acessoriosDisponiveis: CatalogoItemParaAcessorio[];
  onCalcular: (payload: {
    produtoId: string;
    superficies: Record<string, unknown>[];
    acessorioProdutoId?: string;
  }) => Promise<ResultadoCalculoM2>;
  onConfirm: (resultado: ResultadoConfirmadoCalculoM2) => void;
}) {
  const isTeto = produto?.tipoCalculo === "area_com_acabamento_perimetro";
  const [superficies, setSuperficies] = useState<SuperficieForm[]>([novaSuperficie()]);
  const [acessorioProdutoId, setAcessorioProdutoId] = useState<string>("");
  const [resultado, setResultado] = useState<ResultadoCalculoM2 | null>(null);
  const [erro, setErro] = useState("");
  const [calculando, setCalculando] = useState(false);

  function resetState() {
    setSuperficies([novaSuperficie()]);
    setAcessorioProdutoId("");
    setResultado(null);
    setErro("");
  }

  function updateSuperficie(idx: number, patch: Partial<SuperficieForm>) {
    setSuperficies((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function addSuperficie() {
    setSuperficies((prev) => [...prev, novaSuperficie()]);
  }

  function removeSuperficie(idx: number) {
    setSuperficies((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCalcular() {
    if (!produto) return;
    setErro("");
    setCalculando(true);
    try {
      const payloadSuperficies = superficies.map((s) => {
        const item: Record<string, unknown> = {};
        if (s.nome) item.nome = s.nome;
        if (s.m2Direto) {
          item.m2Direto = parseFloat(s.m2Direto);
          if (s.perimetroManual) item.perimetroManual = parseFloat(s.perimetroManual);
        } else {
          if (s.largura) item.largura = parseFloat(s.largura);
          if (isTeto && s.comprimento) item.comprimento = parseFloat(s.comprimento);
          if (!isTeto && s.altura) item.altura = parseFloat(s.altura);
          if (s.perimetroManual) item.perimetroManual = parseFloat(s.perimetroManual);
        }
        return item;
      });

      const data = await onCalcular({
        produtoId: produto.id,
        superficies: payloadSuperficies,
        ...(acessorioProdutoId ? { acessorioProdutoId } : {}),
      });
      setResultado(data);
    } catch (e: any) {
      setErro(e?.message ?? "Não foi possível calcular.");
      setResultado(null);
    } finally {
      setCalculando(false);
    }
  }

  function handleConfirmar() {
    if (!resultado || !produto) return;
    const pp = resultado.produtoPrincipal;
    const quantidade = pp.numeroPacotes > 0 ? pp.numeroPacotes : pp.quantidadeNecessaria;
    const precoUnitario = quantidade > 0 ? pp.valorTotal / quantidade : 0;

    const itensComposicao: ResultadoConfirmadoCalculoM2["itensComposicao"] = (resultado.composicao ?? []).map((item, i) => {
      const qtd = item.numeroPacotes > 0 ? item.numeroPacotes : item.quantidadeNecessaria;
      const precoUnit = qtd > 0 ? item.valorTotal / qtd : 0;
      const nome = resultado.itensComposicao?.[i]?.nome
        ?? acessoriosDisponiveis.find((a) => a.id === item.produtoId)?.nome
        ?? "Item da composição";
      return { produtoId: item.produtoId, nome, quantidade: qtd, precoUnitario: precoUnit };
    });

    // Campo legado (1 item só) — preenchido a partir do primeiro item de
    // composicao, pra quem ainda lê só `acessorio`.
    const acessorio = itensComposicao[0];

    onConfirm({ quantidade, precoUnitario, acessorio, itensComposicao });
    resetState();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetState();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Calcular por m² — {produto?.nome}</DialogTitle>
          <DialogDescription>
            {isTeto
              ? "Informe cada ambiente que vai receber o teto. Área e perímetro são somados automaticamente."
              : "Informe cada parede que vai receber o revestimento. Sem desconto de vãos de porta/janela."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
          {superficies.map((s, idx) => (
            <div key={idx} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Input
                  placeholder={isTeto ? "Nome do ambiente (ex: Sala)" : "Nome da parede (ex: Parede fundo)"}
                  value={s.nome}
                  onChange={(e) => updateSuperficie(idx, { nome: e.target.value })}
                  className="h-8 text-sm"
                />
                {superficies.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeSuperficie(idx)}>
                    Remover
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Largura (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 text-sm"
                    value={s.largura}
                    onChange={(e) => updateSuperficie(idx, { largura: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">{isTeto ? "Comprimento (m)" : "Altura (m)"}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 text-sm"
                    value={isTeto ? s.comprimento : s.altura}
                    onChange={(e) =>
                      updateSuperficie(idx, isTeto ? { comprimento: e.target.value } : { altura: e.target.value })
                    }
                  />
                </div>
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Já sei o m² direto (planta cotada)</summary>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <Label className="text-xs">m² direto</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 text-sm"
                      value={s.m2Direto}
                      onChange={(e) => updateSuperficie(idx, { m2Direto: e.target.value })}
                    />
                  </div>
                  {isTeto && (
                    <div>
                      <Label className="text-xs">Perímetro (m)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 text-sm"
                        value={s.perimetroManual}
                        onChange={(e) => updateSuperficie(idx, { perimetroManual: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </details>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addSuperficie}>
            + {isTeto ? "Adicionar ambiente" : "Adicionar parede"}
          </Button>

          {isTeto && acessoriosDisponiveis.length > 0 && (
            <div>
              <Label className="text-xs">Acabamento de perímetro</Label>
              <Select value={acessorioProdutoId} onValueChange={setAcessorioProdutoId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Automático (sugestão por Coleção/Cor)" />
                </SelectTrigger>
                <SelectContent>
                  {acessoriosDisponiveis.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {resultado && (
          <div className="border rounded-md p-3 bg-muted/40 space-y-1 text-sm">
            <p>
              Área total: <strong>{resultado.produtoPrincipal.quantidadeNecessaria} m²</strong> ·{" "}
              {resultado.produtoPrincipal.numeroPacotes > 0
                ? `${resultado.produtoPrincipal.numeroPacotes} pacote(s)`
                : "cobrança por m²"}{" "}
              · <strong>R$ {resultado.produtoPrincipal.valorTotal.toFixed(2)}</strong>
            </p>
            {(resultado.composicao ?? []).map((item, i) => {
              const info = resultado.itensComposicao?.[i];
              const unidadeLabel = info?.baseCalculo === "perimetro" ? "m" : "m²";
              return (
                <p key={item.produtoId} className="text-muted-foreground">
                  {info?.nome ?? "Item da composição"}
                  {i === 0 && resultado.acessorioSugeridoAutomaticamente ? " (sugerido automaticamente)" : ""}:{" "}
                  {item.quantidadeNecessaria} {unidadeLabel} ·{" "}
                  {item.numeroPacotes > 0 ? `${item.numeroPacotes} pacote(s)` : "cobrança direta"} · R${" "}
                  {item.valorTotal.toFixed(2)}
                </p>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={handleCalcular} disabled={calculando}>
            {calculando ? "Calculando..." : "Calcular"}
          </Button>
          <Button type="button" onClick={handleConfirmar} disabled={!resultado}>
            Usar este cálculo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
