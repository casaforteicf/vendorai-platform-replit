import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListDeals, getListDealsQueryKey, useCreateDeal, Deal } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  title: z.string().min(2, "Título é obrigatório"),
  leadId: z.string().min(1, "Lead é obrigatório"),
  valorEstimado: z.coerce.number().min(0, "Valor inválido").optional(),
});

export default function Deals() {
  const { user } = useAuth();
  const tenantId = user?.tenantId || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: deals, isLoading } = useListDeals(tenantId, undefined, {
    query: {
      enabled: !!tenantId,
      queryKey: getListDealsQueryKey(tenantId),
    }
  });

  const createDeal = useCreateDeal();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      leadId: "",
      valorEstimado: 0,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createDeal.mutate({ data: { tenantId, ...values } as any }, {
      onSuccess: () => {
        toast({ title: "Negócio criado com sucesso." });
        queryClient.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) });
        setIsDialogOpen(false);
        form.reset();
      },
      onError: () => {
        toast({ title: "Erro ao criar negócio", variant: "destructive" });
      }
    });
  }

  // Simple Kanban view mock
  const etapas = ["prospeccao", "qualificacao", "proposta", "negociacao", "fechado_ganho"];
  
  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Negócios</h1>
          <p className="text-muted-foreground">Acompanhe seu pipeline de vendas.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Negócio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Negócio</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título</FormLabel>
                      <FormControl><Input placeholder="Venda de Software" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="leadId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID do Lead</FormLabel>
                      <FormControl><Input placeholder="ID do lead" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="valorEstimado"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor Estimado</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createDeal.isPending}>
                  {createDeal.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 min-w-max h-full pb-4">
          {etapas.map((etapa) => {
            const columnDeals = deals?.filter((d: any) => d.etapa === etapa) || [];
            
            return (
              <div key={etapa} className="w-80 flex flex-col bg-muted/30 rounded-lg p-3">
                <h3 className="font-semibold text-sm uppercase text-muted-foreground mb-3 flex items-center justify-between">
                  {etapa.replace("_", " ")}
                  <span className="bg-muted px-2 py-0.5 rounded-full text-xs">{columnDeals.length}</span>
                </h3>
                
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {isLoading ? (
                    <div className="text-center text-xs text-muted-foreground mt-4">Carregando...</div>
                  ) : columnDeals.length === 0 ? (
                    <div className="text-center text-xs text-muted-foreground mt-4 border border-dashed border-border rounded-md p-4">Vazio</div>
                  ) : (
                    columnDeals.map((deal: any) => (
                      <Card key={deal.id} className="cursor-pointer hover:border-primary/50 transition-colors">
                        <CardContent className="p-4 space-y-2">
                          <h4 className="font-medium text-sm leading-tight">{deal.title}</h4>
                          <p className="text-xs text-muted-foreground font-mono">
                            {deal.valorEstimado ? `R$ ${deal.valorEstimado}` : 'Sem valor'}
                          </p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
