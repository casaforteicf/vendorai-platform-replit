import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListAgendamentos, getListAgendamentosQueryKey, useCreateAgendamento } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalendarIcon, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  title: z.string().min(2, "Título é obrigatório"),
  leadId: z.string().min(1, "Lead é obrigatório"),
  type: z.string().min(1, "Tipo é obrigatório"),
  startAt: z.string().min(1, "Data de início é obrigatória"),
  endAt: z.string().min(1, "Data de término é obrigatória"),
});

export default function Agenda() {
  const { user } = useAuth();
  const tenantId = user?.tenantId || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: agendamentos, isLoading } = useListAgendamentos(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListAgendamentosQueryKey(tenantId)
    }
  });

  const createAgendamento = useCreateAgendamento();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      leadId: "",
      type: "reuniao",
      startAt: "",
      endAt: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createAgendamento.mutate({ data: { tenantId, ...values } as any }, {
      onSuccess: () => {
        toast({ title: "Agendamento criado com sucesso." });
        queryClient.invalidateQueries({ queryKey: getListAgendamentosQueryKey(tenantId) });
        setIsDialogOpen(false);
        form.reset();
      },
      onError: () => {
        toast({ title: "Erro ao criar agendamento", variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Agenda</h1>
          <p className="text-muted-foreground">Gerencie seus compromissos e reuniões.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Agendamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Agendamento</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título</FormLabel>
                      <FormControl><Input placeholder="Reunião de Apresentação" {...field} /></FormControl>
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
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="reuniao">Reunião</SelectItem>
                          <SelectItem value="ligacao">Ligação</SelectItem>
                          <SelectItem value="demo">Demonstração</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Início (Data e Hora)</FormLabel>
                        <FormControl><Input type="datetime-local" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Término (Data e Hora)</FormLabel>
                        <FormControl><Input type="datetime-local" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createAgendamento.isPending}>
                  {createAgendamento.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">Carregando agenda...</div>
        ) : agendamentos?.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground border border-dashed rounded-lg">
            Nenhum compromisso agendado.
          </div>
        ) : (
          agendamentos?.map((agendamento: any) => (
            <Card key={agendamento.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">{agendamento.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center text-sm text-muted-foreground">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground mr-3">
                    {agendamento.type || 'Reunião'}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                    {agendamento.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <span>{new Date(agendamento.startAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {new Date(agendamento.startAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                    {new Date(agendamento.endAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
