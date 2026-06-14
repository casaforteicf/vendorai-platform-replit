import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSegmentTemplates,
  useCompleteOnboarding,
  getGetTenantQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Building2,
  ShoppingBag,
  Users,
  Radio,
} from "lucide-react";
import logoLight from "/logo-full-light.svg";

const productSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  descricao: z.string().optional(),
  preco: z.coerce.number().nonnegative().optional(),
});

const concorrenteSchema = z.object({ value: z.string() });

const formSchema = z.object({
  nomeFantasia: z.string().min(1, "Nome da empresa é obrigatório"),
  vertical: z.string().min(1, "Segmento é obrigatório"),
  logoUrl: z.string().optional(),
  produtos: z.array(productSchema).optional(),
  diferenciais: z.string().optional(),
  publicoAlvo: z.string().optional(),
  concorrentes: z.array(concorrenteSchema).optional(),
  canaisVenda: z.array(z.string()).optional(),
});

type WizardForm = z.infer<typeof formSchema>;

const CANAIS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "site", label: "Site próprio" },
  { id: "marketplace", label: "Marketplace" },
  { id: "fisico", label: "Loja física" },
];

const TOTAL_DATA_STEPS = 4;

const STEP_META = [
  { icon: Building2, label: "Identidade" },
  { icon: ShoppingBag, label: "Produtos" },
  { icon: Users, label: "Mercado" },
  { icon: Radio, label: "Canais" },
];

export default function Onboarding() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: segments = [], isLoading: segmentsLoading } =
    useListSegmentTemplates();
  const completeMutation = useCompleteOnboarding();

  const form = useForm<WizardForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nomeFantasia: "",
      vertical: "",
      logoUrl: "",
      produtos: [{ nome: "", descricao: "", preco: undefined }],
      diferenciais: "",
      publicoAlvo: "",
      concorrentes: [{ value: "" }],
      canaisVenda: [],
    },
  });

  const {
    fields: produtoFields,
    append: appendProduto,
    remove: removeProduto,
  } = useFieldArray({ control: form.control, name: "produtos" });

  const {
    fields: concorrenteFields,
    append: appendConcorrente,
    remove: removeConcorrente,
  } = useFieldArray({ control: form.control, name: "concorrentes" });

  async function handleNext() {
    if (step === 1) {
      const valid = await form.trigger(["nomeFantasia", "vertical"]);
      if (!valid) return;
    }
    if (step === TOTAL_DATA_STEPS) {
      setStep(5);
      return;
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  function toggleCanal(canal: string) {
    const current = form.getValues("canaisVenda") ?? [];
    const next = current.includes(canal)
      ? current.filter((c) => c !== canal)
      : [...current, canal];
    form.setValue("canaisVenda", next);
  }

  async function submitWizard(values: WizardForm) {
    if (!user?.tenantId) return;
    setSubmitting(true);
    setSubmitError(null);

    const tenantId = user.tenantId;

    const produtosFiltrados = (values.produtos ?? [])
      .filter((p) => p.nome.trim())
      .map((p) => ({
        nome: p.nome,
        descricao: p.descricao,
        preco: p.preco,
      }));

    const concorrentesFiltrados = (values.concorrentes ?? [])
      .map((c) => c.value.trim())
      .filter(Boolean);

    completeMutation.mutate(
      {
        tenantId,
        data: {
          nomeFantasia: values.nomeFantasia,
          vertical: values.vertical,
          logoUrl: values.logoUrl || undefined,
          produtos: produtosFiltrados.length > 0 ? produtosFiltrados : undefined,
          diferenciais: values.diferenciais || undefined,
          publicoAlvo: values.publicoAlvo || undefined,
          concorrentes:
            concorrentesFiltrados.length > 0 ? concorrentesFiltrados : undefined,
          canaisVenda:
            (values.canaisVenda ?? []).length > 0
              ? values.canaisVenda
              : undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetTenantQueryKey(tenantId),
          });
          setSubmitting(false);
          setLocation("/");
        },
        onError: (err) => {
          setSubmitting(false);
          setSubmitError(err.message || "Erro ao salvar. Tente novamente.");
          toast({
            title: "Erro ao salvar configurações",
            description: err.message || "Tente novamente.",
            variant: "destructive",
          });
        },
      }
    );
  }

  useEffect(() => {
    if (step === 5 && !submitting && !submitError) {
      form.handleSubmit(submitWizard)();
    }
  }, [step]);

  const progressPct =
    step <= TOTAL_DATA_STEPS ? ((step - 1) / TOTAL_DATA_STEPS) * 100 : 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-6 py-4 flex items-center gap-4">
        <img src={logoLight} alt="Vendor.ai" className="h-8 w-auto" />
        {step <= TOTAL_DATA_STEPS && (
          <div className="flex-1 max-w-md">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Configuração inicial</span>
              <span>
                {step} de {TOTAL_DATA_STEPS}
              </span>
            </div>
            <Progress value={progressPct} className="h-1.5" />
          </div>
        )}
      </header>

      <main className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-xl space-y-6">
          {step <= TOTAL_DATA_STEPS && (
            <div className="flex gap-2 mb-6">
              {STEP_META.map((s, i) => {
                const idx = i + 1;
                const Icon = s.icon;
                const active = idx === step;
                const done = idx < step;
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {step === 1 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Identidade do negócio</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Como seus clientes te conhecem?
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nomeFantasia">
                    Nome da empresa <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="nomeFantasia"
                    placeholder="Ex: Estética da Ana"
                    {...form.register("nomeFantasia")}
                  />
                  {form.formState.errors.nomeFantasia && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.nomeFantasia.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>
                    Segmento <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.watch("vertical")}
                    onValueChange={(v) => form.setValue("vertical", v)}
                    disabled={segmentsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o segmento..." />
                    </SelectTrigger>
                    <SelectContent>
                      {segments.map((s) => (
                        <SelectItem key={s.id} value={s.nome}>
                          {s.nome}
                        </SelectItem>
                      ))}
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.formState.errors.vertical && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.vertical.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logoUrl">URL da logo</Label>
                  <Input
                    id="logoUrl"
                    placeholder="https://seusite.com/logo.png"
                    {...form.register("logoUrl")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Opcional. Cole o link público da sua logo.
                  </p>
                  {form.watch("logoUrl") && (
                    <img
                      src={form.watch("logoUrl")}
                      alt="Preview"
                      className="h-12 w-auto rounded border object-contain"
                      onError={(e) =>
                        ((e.target as HTMLImageElement).style.display = "none")
                      }
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">O que você vende</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Principais produtos ou serviços
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>Produtos / Serviços</Label>
                  {produtoFields.map((field, i) => (
                    <div
                      key={field.id}
                      className="rounded-lg border p-3 space-y-2"
                    >
                      <div className="flex gap-2 items-start">
                        <Input
                          placeholder="Nome do produto ou serviço"
                          {...form.register(`produtos.${i}.nome`)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeProduto(i)}
                          disabled={produtoFields.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Descrição (opcional)"
                        {...form.register(`produtos.${i}.descricao`)}
                      />
                      <Input
                        type="number"
                        placeholder="Preço (opcional)"
                        {...form.register(`produtos.${i}.preco`)}
                        className="w-36"
                      />
                    </div>
                  ))}
                  {produtoFields.length < 5 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        appendProduto({ nome: "", descricao: "", preco: undefined })
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar produto
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="diferenciais">
                    Diferencial competitivo
                  </Label>
                  <Textarea
                    id="diferenciais"
                    placeholder="O que te diferencia da concorrência? Ex: atendimento rápido, produtos importados, preço acessível..."
                    rows={3}
                    {...form.register("diferenciais")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="publicoAlvo">Público-alvo</Label>
                  <Textarea
                    id="publicoAlvo"
                    placeholder="Quem é seu cliente ideal? Ex: mulheres 25-45 anos, empresas de médio porte..."
                    rows={2}
                    {...form.register("publicoAlvo")}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Concorrentes</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Quem são seus principais competidores?
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Concorrentes (opcional)</Label>
                  {concorrenteFields.map((field, i) => (
                    <div key={field.id} className="flex gap-2">
                      <Input
                        placeholder={`Concorrente ${i + 1}`}
                        {...form.register(`concorrentes.${i}.value`)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeConcorrente(i)}
                        disabled={concorrenteFields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {concorrenteFields.length < 5 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => appendConcorrente({ value: "" })}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar concorrente
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Pode pular se preferir. Até 5 concorrentes.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 4 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Canais de atendimento</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Por onde você atende ou vende? (selecione todos que se aplicam)
                  </p>
                </div>

                <div className="grid gap-3">
                  {CANAIS.map((canal) => {
                    const canais = form.watch("canaisVenda") ?? [];
                    const checked = canais.includes(canal.id);
                    return (
                      <label
                        key={canal.id}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          checked
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          id={canal.id}
                          checked={checked}
                          onCheckedChange={() => toggleCanal(canal.id)}
                        />
                        <span className="font-medium">{canal.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pode pular se preferir.
                </p>
              </CardContent>
            </Card>
          )}

          {step === 5 && (
            <Card>
              <CardContent className="pt-10 pb-10 flex flex-col items-center text-center gap-6">
                {submitting && (
                  <>
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <div>
                      <p className="text-lg font-semibold">
                        Salvando suas configurações...
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Isso levará apenas um momento.
                      </p>
                    </div>
                  </>
                )}

                {!submitting && !submitError && (
                  <>
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                    <div>
                      <p className="text-lg font-semibold">
                        Tudo configurado!
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Redirecionando para o dashboard...
                      </p>
                    </div>
                  </>
                )}

                {submitError && (
                  <div className="space-y-4 w-full">
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                      {submitError}
                    </div>
                    <div className="flex gap-3 justify-center">
                      <Button variant="outline" onClick={() => setStep(4)}>
                        Voltar
                      </Button>
                      <Button
                        onClick={() => {
                          setSubmitError(null);
                          form.handleSubmit(submitWizard)();
                        }}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {step <= TOTAL_DATA_STEPS && (
            <div className="flex justify-between pt-2">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={step === 1}
                className="gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={handleNext} className="gap-1.5">
                {step === TOTAL_DATA_STEPS ? "Concluir" : "Próximo"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
