import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import HotelModulesNav from "../HotelModulesNav";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  atualizarCargo,
  criarCargo,
  listarCargos,
  mensagemDoErro,
  type AbAuth,
  type Cargo,
  type CargoInput,
} from "@/lib/ab/client";
import {
  OUTRO_SETOR,
  SETORES,
  normalizarSetor,
  rotuloSetor,
  setorEhConhecido,
} from "@/lib/ab/setores";

const CHAVE_CARGOS = (tenantId: string) => ["ab", "cargos", tenantId] as const;

const NOME_MAX = 120;
const DESCRICAO_MAX = 500;

type Formulario = {
  id?: string;
  nome: string;
  /** Valor do `<select>`: um setor conhecido ou `OUTRO_SETOR`. */
  setorConhecido: string;
  setorLivre: string;
  descricao: string;
  ativo: boolean;
};

const FORMULARIO_VAZIO: Formulario = {
  nome: "",
  setorConhecido: SETORES[0].valor,
  setorLivre: "",
  descricao: "",
  ativo: true,
};

type Aviso = { tipo: "sucesso" | "erro"; texto: string };

type FiltroStatus = "todos" | "ativos" | "inativos";

export default function AbCargos() {
  const { user, token, isEffectiveAdmin } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const queryClient = useQueryClient();

  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);
  const pronto = Boolean(token && tenantId);

  const [form, setForm] = useState<Formulario>(FORMULARIO_VAZIO);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const formRef = useRef<HTMLDivElement>(null);

  const cargosQuery = useQuery({
    queryKey: CHAVE_CARGOS(tenantId),
    queryFn: () => listarCargos(auth),
    enabled: pronto,
    staleTime: 30_000,
  });

  const cargos = cargosQuery.data ?? [];

  const setorInformado =
    form.setorConhecido === OUTRO_SETOR ? form.setorLivre : form.setorConhecido;

  function limparFormulario() {
    setForm(FORMULARIO_VAZIO);
    setErroForm(null);
  }

  const salvar = useMutation({
    mutationFn: (dados: { id?: string; entrada: CargoInput }) =>
      dados.id
        ? atualizarCargo(auth, dados.id, dados.entrada)
        : criarCargo(auth, dados.entrada),
    onSuccess: (cargo, dados) => {
      queryClient.invalidateQueries({ queryKey: CHAVE_CARGOS(tenantId) });
      limparFormulario();
      setAviso({
        tipo: "sucesso",
        texto: dados.id
          ? `Cargo "${cargo.nome}" atualizado.`
          : `Cargo "${cargo.nome}" criado.`,
      });
    },
    onError: (erro) => setErroForm(mensagemDoErro(erro)),
  });

  const alternar = useMutation({
    mutationFn: (cargo: Cargo) => atualizarCargo(auth, cargo.id, { ativo: !cargo.ativo }),
    onSuccess: (cargo) => {
      queryClient.invalidateQueries({ queryKey: CHAVE_CARGOS(tenantId) });
      setAviso({
        tipo: "sucesso",
        texto: `Cargo "${cargo.nome}" ${cargo.ativo ? "reativado" : "desativado"}.`,
      });
    },
    onError: (erro) => setAviso({ tipo: "erro", texto: mensagemDoErro(erro) }),
  });

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErroForm(null);
    setAviso(null);

    const nome = form.nome.trim();
    if (!nome) {
      setErroForm("Informe o nome do cargo.");
      return;
    }
    if (nome.length > NOME_MAX) {
      setErroForm(`O nome deve ter no máximo ${NOME_MAX} caracteres.`);
      return;
    }

    const setor = normalizarSetor(setorInformado);
    if (!setor) {
      setErroForm("Informe o setor do cargo (ex.: cozinha, almoxarifado).");
      return;
    }

    const descricao = form.descricao.trim();
    if (descricao.length > DESCRICAO_MAX) {
      setErroForm(`A descrição deve ter no máximo ${DESCRICAO_MAX} caracteres.`);
      return;
    }

    salvar.mutate({
      id: form.id,
      entrada: {
        nome,
        setor,
        descricao: descricao || null,
        ativo: form.ativo,
      },
    });
  }

  function editar(cargo: Cargo) {
    setForm({
      id: cargo.id,
      nome: cargo.nome,
      setorConhecido: setorEhConhecido(cargo.setor) ? cargo.setor : OUTRO_SETOR,
      setorLivre: setorEhConhecido(cargo.setor) ? "" : cargo.setor,
      descricao: cargo.descricao ?? "",
      ativo: cargo.ativo,
    });
    setErroForm(null);
    setAviso(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const setoresNaTela = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const setor of SETORES) vistos.set(setor.valor, setor.rotulo);
    for (const cargo of cargos) {
      if (!vistos.has(cargo.setor)) vistos.set(cargo.setor, rotuloSetor(cargo.setor));
    }
    return [...vistos.entries()].map(([valor, rotulo]) => ({ valor, rotulo }));
  }, [cargos]);

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return cargos.filter((cargo) => {
      if (filtroStatus === "ativos" && !cargo.ativo) return false;
      if (filtroStatus === "inativos" && cargo.ativo) return false;
      if (filtroSetor !== "todos" && cargo.setor !== filtroSetor) return false;
      if (!termo) return true;
      return `${cargo.nome} ${cargo.descricao ?? ""} ${rotuloSetor(cargo.setor)}`
        .toLowerCase()
        .includes(termo);
    });
  }, [busca, cargos, filtroSetor, filtroStatus]);

  const totalAtivos = cargos.filter((cargo) => cargo.ativo).length;
  const ocupado = salvar.isPending;

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <HotelModulesNav />

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Hotelaria · A&amp;B
        </p>
        <h1 className="text-2xl font-semibold">Cargos e setores</h1>
        <p className="text-sm text-muted-foreground">
          Base do RH operacional de alimentos e bebidas. Cada cargo pertence a um setor, e todo o
          restante do módulo (fichas técnicas, briffing, compras) se apoia nessa atribuição.
        </p>
      </header>

      {aviso && (
        <p
          role="status"
          aria-live="polite"
          className={
            aviso.tipo === "sucesso"
              ? "rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
              : "rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          }
        >
          {aviso.texto}
        </p>
      )}

      {!pronto && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          Carregando a sessão do hotel…
        </p>
      )}

      {pronto && isEffectiveAdmin && (
        <div ref={formRef}>
          <Card>
            <CardHeader>
              <CardTitle>{form.id ? "Editar cargo" : "Novo cargo"}</CardTitle>
              <CardDescription>
                {form.id
                  ? "Altere os dados e salve, ou cancele para voltar ao cadastro."
                  : "Cadastre os cargos da operação (ex.: Chefe de Cozinha, Confeiteiro)."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={enviar} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cargo-nome">
                      Nome <span className="text-red-600">*</span>
                    </Label>
                    <Input
                      id="cargo-nome"
                      value={form.nome}
                      maxLength={NOME_MAX}
                      placeholder="Ex.: Chefe de Cozinha"
                      onChange={(e) => setForm({ ...form, nome: e.target.value })}
                      aria-invalid={!form.nome.trim() ? true : undefined}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cargo-setor">
                      Setor <span className="text-red-600">*</span>
                    </Label>
                    <select
                      id="cargo-setor"
                      value={form.setorConhecido}
                      onChange={(e) => setForm({ ...form, setorConhecido: e.target.value })}
                      className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      {SETORES.map((setor) => (
                        <option key={setor.valor} value={setor.valor}>
                          {setor.rotulo}
                        </option>
                      ))}
                      <option value={OUTRO_SETOR}>Outro setor…</option>
                    </select>
                  </div>
                </div>

                {form.setorConhecido === OUTRO_SETOR && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cargo-setor-livre">Nome do setor</Label>
                    <Input
                      id="cargo-setor-livre"
                      value={form.setorLivre}
                      maxLength={80}
                      placeholder="Ex.: Cozinha quente, Bar"
                      onChange={(e) => setForm({ ...form, setorLivre: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      O setor é gravado normalizado: {normalizarSetor(form.setorLivre) || "—"}
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="cargo-descricao">Descrição</Label>
                    <span className="text-xs text-muted-foreground">
                      {form.descricao.length}/{DESCRICAO_MAX}
                    </span>
                  </div>
                  <Textarea
                    id="cargo-descricao"
                    rows={2}
                    value={form.descricao}
                    maxLength={DESCRICAO_MAX}
                    placeholder="Responsabilidades, turno, requisitos…"
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  />
                </div>

                {erroForm && (
                  <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                    {erroForm}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="cargo-ativo"
                      checked={form.ativo}
                      onCheckedChange={(ativo) => setForm({ ...form, ativo })}
                    />
                    <Label htmlFor="cargo-ativo" className="font-normal">
                      Ativo
                    </Label>
                  </div>

                  <div className="ml-auto flex gap-2">
                    {form.id && (
                      <Button type="button" variant="outline" onClick={limparFormulario} disabled={ocupado}>
                        Cancelar
                      </Button>
                    )}
                    <Button type="submit" disabled={ocupado}>
                      {salvar.isPending
                        ? "Salvando…"
                        : form.id
                          ? "Salvar alterações"
                          : "Criar cargo"}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {pronto && !isEffectiveAdmin && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Você pode consultar os cargos, mas só administradores do hotel podem cadastrar ou alterar.
        </p>
      )}

      <Card>
        <CardHeader className="gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Cargos cadastrados</CardTitle>
            <p className="text-xs text-muted-foreground">
              {cargos.length} cargo(s) · {totalAtivos} ativo(s)
            </p>
          </div>

          {cargos.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, setor ou descrição"
                aria-label="Buscar cargos"
              />
              <select
                value={filtroSetor}
                onChange={(e) => setFiltroSetor(e.target.value)}
                aria-label="Filtrar por setor"
                className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="todos">Todos os setores</option>
                {setoresNaTela.map((setor) => (
                  <option key={setor.valor} value={setor.valor}>
                    {setor.rotulo}
                  </option>
                ))}
              </select>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)}
                aria-label="Filtrar por status"
                className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="todos">Todos os status</option>
                <option value="ativos">Somente ativos</option>
                <option value="inativos">Somente inativos</option>
              </select>
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          {pronto && cargosQuery.isPending && (
            <div className="space-y-2">
              {[0, 1, 2].map((linha) => (
                <Skeleton key={linha} className="h-12 w-full" />
              ))}
            </div>
          )}

          {pronto && cargosQuery.isError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <p>{mensagemDoErro(cargosQuery.error)}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => void cargosQuery.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {pronto && cargosQuery.isSuccess && cargos.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum cargo cadastrado ainda. Comece pelo Chefe de Cozinha e pelo Almoxarife.
            </p>
          )}

          {pronto && cargos.length > 0 && listaFiltrada.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum cargo corresponde aos filtros.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setBusca("");
                  setFiltroSetor("todos");
                  setFiltroStatus("todos");
                }}
              >
                Limpar filtros
              </button>
            </p>
          )}

          {pronto && listaFiltrada.length > 0 && (
            <Table>
              <TableCaption className="sr-only">
                Cargos operacionais de alimentos e bebidas deste hotel
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Status</TableHead>
                  {isEffectiveAdmin && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listaFiltrada.map((cargo) => {
                  const alternando = alternar.isPending && alternar.variables?.id === cargo.id;
                  return (
                    <TableRow key={cargo.id}>
                      <TableCell className="max-w-[22rem] whitespace-normal">
                        <p className="font-medium">{cargo.nome}</p>
                        {cargo.descricao && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {cargo.descricao}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{rotuloSetor(cargo.setor)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={cargo.ativo ? "default" : "secondary"}>
                          {cargo.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      {isEffectiveAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => editar(cargo)}
                              disabled={ocupado || alternando}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => alternar.mutate(cargo)}
                              disabled={ocupado || alternando || alternar.isPending}
                            >
                              {alternando ? "…" : cargo.ativo ? "Desativar" : "Reativar"}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
