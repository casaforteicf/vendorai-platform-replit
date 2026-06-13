import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Briefcase } from "lucide-react";

const formSchema = z.object({
  tenantName: z.string().min(2, "Nome da empresa é obrigatório"),
  tenantSlug: z.string().min(2, "Slug da empresa é obrigatório"),
  name: z.string().min(2, "Seu nome é obrigatório"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
});

export default function Register() {
  const registerMutation = useRegister();
  const { login } = useAuth();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tenantName: "",
      tenantSlug: "",
      name: "",
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    registerMutation.mutate({ data: values }, {
      onSuccess: (response) => {
        login(response.token, response.user);
      },
      onError: (error) => {
        toast({
          title: "Erro ao criar conta",
          description: error.message || "Ocorreu um erro.",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex bg-primary items-center justify-center p-12">
        <div className="max-w-md text-primary-foreground space-y-6">
          <Briefcase className="w-16 h-16 opacity-80" />
          <h2 className="text-4xl font-bold">Acelere sua operação de vendas.</h2>
          <p className="text-lg opacity-80 leading-relaxed">
            Comece a usar o VendorAI Core agora mesmo. Uma nova maneira de gerenciar seus leads e negócios.
          </p>
        </div>
      </div>
      <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-24 overflow-y-auto">
        <div className="mx-auto w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Criar Conta</h1>
            <p className="text-muted-foreground">Registre sua empresa na plataforma.</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="tenantName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Empresa</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Corp" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tenantSlug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Identificador (Slug)</FormLabel>
                    <FormControl>
                      <Input placeholder="acme" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seu Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="João Silva" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="joao@acme.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full mt-2" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Criando conta..." : "Registrar Empresa"}
              </Button>
            </form>
          </Form>
          
          <div className="text-center text-sm text-muted-foreground">
            Já tem uma conta?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Entrar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
