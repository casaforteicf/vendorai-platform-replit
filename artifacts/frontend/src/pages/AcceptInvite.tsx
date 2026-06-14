import { useRoute } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useValidateInvite,
  useAcceptInvite,
  getValidateInviteQueryKey,
} from "@workspace/api-client-react";
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
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import logoLight from "/logo-full-light.svg";
import logoDark from "/logo-full-dark.svg";

const formSchema = z
  .object({
    name: z.string().min(1, "Nome é obrigatório"),
    password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

export default function AcceptInvite() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token ?? "";

  const { login } = useAuth();
  const { toast } = useToast();

  const {
    data: invite,
    isLoading: inviteLoading,
    error: inviteError,
  } = useValidateInvite(token, {
    query: { retry: false, queryKey: getValidateInviteQueryKey(token) },
  });

  const acceptMutation = useAcceptInvite();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", password: "", confirmPassword: "" },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    acceptMutation.mutate(
      { data: { token, name: values.name, password: values.password } },
      {
        onSuccess: (response) => {
          login(response.token, response.user);
        },
        onError: (error) => {
          toast({
            title: "Erro ao criar conta",
            description: error.message || "Tente novamente.",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-24">
        <div className="mx-auto w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <img src={logoLight} alt="Vendor.ai" className="h-10 w-auto mb-6" />
            <h1 className="text-3xl font-bold tracking-tight">
              Criar sua conta
            </h1>
            <p className="text-muted-foreground">
              Você foi convidado para acessar a plataforma VendorAI.
            </p>
          </div>

          {inviteLoading && (
            <div className="flex items-center gap-3 text-muted-foreground py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Validando convite...</span>
            </div>
          )}

          {!inviteLoading && inviteError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="font-semibold">Convite inválido</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {(inviteError as { message?: string })?.message ||
                  "Este link de convite expirou, já foi utilizado ou é inválido."}
              </p>
              <p className="text-sm text-muted-foreground">
                Solicite um novo convite ao administrador.
              </p>
            </div>
          )}

          {!inviteLoading && invite && (
            <>
              <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>Convite válido para {invite.tenantName}</span>
                </div>
                <p className="text-sm text-muted-foreground pl-6">
                  Conta será criada com o email:{" "}
                  <span className="font-mono font-medium">{invite.email}</span>
                </p>
              </div>

              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-5"
                >
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Seu nome</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome completo" {...field} />
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
                          <Input
                            type="password"
                            placeholder="Mínimo 8 caracteres"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar senha</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={acceptMutation.isPending}
                  >
                    {acceptMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Criando conta...
                      </>
                    ) : (
                      "Criar conta e entrar"
                    )}
                  </Button>
                </form>
              </Form>
            </>
          )}
        </div>
      </div>

      <div className="hidden lg:flex bg-primary items-center justify-center p-12">
        <div className="max-w-md text-primary-foreground space-y-6">
          <img src={logoDark} alt="Vendor.ai" className="h-14 w-auto" />
          <h2 className="text-4xl font-bold">O comando central de vendas.</h2>
          <p className="text-lg opacity-80 leading-relaxed">
            CRM, conversas, agendamentos e IA em uma única interface pensada
            para velocidade e densidade de informação.
          </p>
        </div>
      </div>
    </div>
  );
}
