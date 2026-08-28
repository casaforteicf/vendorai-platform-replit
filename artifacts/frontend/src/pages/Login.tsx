import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, useDemoLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
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
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import logoDark from "/logo-full-dark.svg";
import logoLight from "/logo-full-light.svg";

const formSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.32 2.98-7.36Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.91A6.01 6.01 0 0 1 6.08 12c0-.66.11-1.3.31-1.91V7.5H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.5l3.35-2.59Z" />
      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.5l3.35 2.59C7.18 7.72 9.39 5.96 12 5.96Z" />
    </svg>
  );
}

export default function Login() {
  const loginMutation = useLogin();
  const demoLoginMutation = useDemoLogin();
  const { login } = useAuth();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

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

  function onGoogleLogin() {
    window.location.assign("/api/auth/google");
  }

  function onDemoLogin() {
    demoLoginMutation.mutate(
      { data: { email: "demo", password: "demo" } },
      {
        onSuccess: (response) => {
          login(response.token, response.user, { isDemo: true });
        },
        onError: (error) => {
          toast({
            title: "Erro ao entrar na demo",
            description: error.message || "Não foi possível acessar a conta de demonstração.",
            variant: "destructive",
          });
        },
      },
    );
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
                      <div className="relative">
                        <Input type={showPassword ? "text" : "password"} placeholder="••••••••" {...field} className="pr-10" />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          tabIndex={-1}
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
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

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <div className="space-y-3">
            <Button type="button" variant="outline" className="w-full gap-2" onClick={onGoogleLogin}>
              <GoogleIcon />
              Entrar com Google
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onDemoLogin}
              disabled={demoLoginMutation.isPending}
            >
              {demoLoginMutation.isPending ? "Entrando..." : "Acessar conta de demonstração"}
            </Button>
          </div>

          <div className="text-center">
            <Link
              href="/esqueci-senha"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
            >
              Esqueci minha senha
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