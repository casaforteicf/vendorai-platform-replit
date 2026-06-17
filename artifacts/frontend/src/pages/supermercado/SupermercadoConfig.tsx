import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetSupermercadoConfig,
  useUpsertSupermercadoConfig,
  getGetSupermercadoConfigQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Zap, MessageCircle, RefreshCw, Clock } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form";

const configSchema = z.object({
  zapiInstanceId: z.string().optional(),
  zapiToken: z.string().optional(),
  botAtivo: z.boolean(),
  mensagemBoasVindas: z.string().optional(),
  campanhasAtivas: z.boolean(),
  contatosPorRodada: z.coerce.number().min(1).max(500),
  horarioEnvio: z.string(),
  erpApiUrl: z.string().optional(),
  erpApiKey: z.string().optional(),
  erpSyncEnabled: z.boolean(),
});
type ConfigForm = z.infer<typeof configSchema>;

export default function SupermercadoConfig() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: config, isLoading } = useGetSupermercadoConfig(tenantId, {
    query: { enabled: !!tenantId, queryKey: getGetSupermercadoConfigQueryKey(tenantId) },
  });

  const upsertMut = useUpsertSupermercadoConfig();

  const form = useForm<ConfigForm>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      zapiInstanceId: "",
      zapiToken: "",
      botAtivo: false,
      mensagemBoasVindas: "",
      campanhasAtivas: true,
      contatosPorRodada: 50,
      horarioEnvio: "09:00",
      erpApiUrl: "",
      erpApiKey: "",
      erpSyncEnabled: false,
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        zapiInstanceId: config.zapiInstanceId ?? "",
        zapiToken: config.zapiToken ?? "",
        botAtivo: config.botAtivo,
        mensagemBoasVindas: config.mensagemBoasVindas ?? "",
        campanhasAtivas: config.campanhasAtivas,
        contatosPorRodada: config.contatosPorRodada,
        horarioEnvio: config.horarioEnvio,
        erpApiUrl: config.erpApiUrl ?? "",
        erpApiKey: config.erpApiKey ?? "",
        erpSyncEnabled: config.erpSyncEnabled,
      });
    }
  }, [config, form]);

  function onSubmit(values: ConfigForm) {
    upsertMut.mutate({ tenantId, data: values }, {
      onSuccess: () => {
        toast({ title: "Configurações salvas." });
        qc.invalidateQueries({ queryKey: getGetSupermercadoConfigQueryKey(tenantId) });
      },
      onError: () => toast({ title: "Erro ao salvar configurações", variant: "destructive" }),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Configurações do Supermercado</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure WhatsApp, automações de campanhas e integração com ERP.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

          {/* WhatsApp (Z-API) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-green-500" />
                WhatsApp via Z-API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="zapiInstanceId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instance ID</FormLabel>
                    <FormControl><Input placeholder="Ex: 3DXV9..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="zapiToken" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Token</FormLabel>
                    <FormControl><Input type="password" placeholder="Token de acesso" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="botAtivo" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div>
                    <FormLabel className="!mt-0">Bot Ativo</FormLabel>
                    <FormDescription className="text-xs">Habilita respostas automáticas via WhatsApp.</FormDescription>
                  </div>
                </FormItem>
              )} />
              <FormField control={form.control} name="mensagemBoasVindas" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mensagem de Boas-vindas</FormLabel>
                  <FormControl>
                    <Input placeholder="Olá! Bem-vindo ao nosso supermercado 🛒" {...field} />
                  </FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Campanhas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Automação de Campanhas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="campanhasAtivas" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div>
                    <FormLabel className="!mt-0">Campanhas Ativas</FormLabel>
                    <FormDescription className="text-xs">Habilita o envio automático de campanhas agendadas.</FormDescription>
                  </div>
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="contatosPorRodada" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contatos por Disparo</FormLabel>
                    <FormControl><Input type="number" min={1} max={500} {...field} /></FormControl>
                    <FormDescription className="text-xs">Máx. 500</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="horarioEnvio" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Horário de Envio</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Input type="time" {...field} />
                      </div>
                    </FormControl>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* ERP */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-blue-500" />
                Integração com ERP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="erpSyncEnabled" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div>
                    <FormLabel className="!mt-0">Sincronização Ativa</FormLabel>
                    <FormDescription className="text-xs">Importa produtos do seu ERP automaticamente.</FormDescription>
                  </div>
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="erpApiUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL da API do ERP</FormLabel>
                    <FormControl><Input placeholder="https://erp.seudominio.com" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="erpApiKey" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chave da API</FormLabel>
                    <FormControl><Input type="password" placeholder="sk-..." {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" disabled={upsertMut.isPending} className="w-full">
            {upsertMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar Configurações
          </Button>
        </form>
      </Form>
    </div>
  );
}
