import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin } from "@workspace/api-client-react";
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
import logoDark from "/logo-full-dark.svg";
import logoLight from "/logo-full-light.svg";

const formSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

export default function Login() {
  const loginMutation = useLogin();
  const { login } = useAuth();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    loginMutation.mutate({ data: values }, {
      onSuccess: (response) => {
        login(response.token, response.user);
      },
      onError: (error) => {
        toast({
          title: "Erro ao entrar",
          description: error.message || "Verifique suas credenciais.",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-24">
        <div className="mx-auto w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <img src={logoLight} alt="Vendor.ai" className="h-10 w-auto mb-6" />
            <h1 className="text-3xl font-bold tracking-tight">Entrar</h1>
            <p className="text-muted-foreground">Insira suas credenciais para acessar a plataforma.</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="seu@email.com" {...field} />
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
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Entrando..." : "Entrar na Plataforma"}
              </Button>
            </form>
          </Form>
          
          <div className="text-center text-sm text-muted-foreground">
            Não tem uma conta?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Criar conta
            </Link>
          </div>
        </div>
      </div>
      <div className="hidden lg:flex bg-primary items-center justify-center p-12">
        <div className="max-w-md text-primary-foreground space-y-6">
          <img src={logoDark} alt="Vendor.ai" className="h-14 w-auto" />
          <h2 className="text-4xl font-bold">O comando central de vendas.</h2>
          <p className="text-lg opacity-80 leading-relaxed">
            CRM, conversas, agendamentos e IA em uma única interface pensada para velocidade e densidade de informação.
          </p>
        </div>
      </div>
    </div>
  );
}
