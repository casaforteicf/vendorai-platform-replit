import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { useListPartnerTenants } from "@workspace/api-client-react";
import { useIndicateLead, type IndicateLeadPayload } from "@/lib/partnerApi";
import { useToast } from "@/hooks/use-toast";

interface FormValues {
  tenantId: string;
  nome: string;
  telefone: string;
  email: string;
  empresa: string;
  objetivo: string;
}

export function PartnerIndicationForm({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { data: tenants, isLoading: loadingTenants } = useListPartnerTenants();
  const mutation = useIndicateLead();

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      tenantId: "",
      nome: "",
      telefone: "",
      email: "",
      empresa: "",
      objetivo: "",
    },
  });

  const onSubmit = (values: FormValues) => {
    const payload: IndicateLeadPayload = {
      tenantId: values.tenantId,
      nome: values.nome,
      telefone: values.telefone || undefined,
      email: values.email || undefined,
      empresa: values.empresa || undefined,
      objetivo: values.objetivo || undefined,
    };

    mutation.mutate(payload, {
      onSuccess: () => {
        toast({ title: "Cliente indicado com sucesso!" });
        reset();
        setOpen(false);
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Erro ao indicar cliente",
          description: err.message,
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Indicar Cliente
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Indicar Cliente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Tenant */}
          <div className="space-y-1.5">
            <Label htmlFor="tenantId">Empresa (CRM destino) *</Label>
            <Select
              onValueChange={(v) => setValue("tenantId", v)}
              disabled={loadingTenants}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingTenants ? "Carregando..." : "Selecionar empresa"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(tenants ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              placeholder="Nome completo"
              {...register("nome", { required: true })}
            />
            {errors.nome && (
              <p className="text-xs text-destructive">Campo obrigatório</p>
            )}
          </div>

          {/* Telefone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                placeholder="(11) 99999-9999"
                {...register("telefone")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@empresa.com"
                {...register("email")}
              />
            </div>
          </div>

          {/* Segmento */}
          <div className="space-y-1.5">
            <Label htmlFor="empresa">Segmento / Empresa</Label>
            <Input
              id="empresa"
              placeholder="Ex: Varejo, Construção civil..."
              {...register("empresa")}
            />
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="objetivo">Observações</Label>
            <Textarea
              id="objetivo"
              placeholder="Contexto, interesse, dor principal..."
              rows={3}
              {...register("objetivo")}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Indicar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
