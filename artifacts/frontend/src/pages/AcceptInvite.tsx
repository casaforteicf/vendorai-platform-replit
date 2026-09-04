import { useMemo } from "react";
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
import { useI18n } from "@/i18n";
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

const PT_COPY = {
  nameRequired: "Nome é obrigatório",
  passwordMinimum: "Senha deve ter pelo menos 8 caracteres",
  confirmRequired: "Confirme a senha",
  mismatch: "As senhas não coincidem",
  createError: "Erro ao criar conta",
  tryAgain: "Tente novamente.",
  title: "Criar sua conta",
  subtitle: "Você foi convidado para acessar a plataforma.",
  validating: "Validando convite...",
  invalidInvite: "Convite inválido",
  invalidInviteDescription: "Este link de convite expirou, já foi utilizado ou é inválido.",
  requestNew: "Solicite um novo convite ao administrador.",
  validInvite: (tenantName: string) => `Convite válido para ${tenantName}`,
  accountEmail: "A conta será criada com o e-mail:",
  yourName: "Seu nome",
  fullName: "Nome completo",
  password: "Senha",
  minimumPlaceholder: "Mínimo 8 caracteres",
  confirmPassword: "Confirmar senha",
  creating: "Criando conta...",
  createAndEnter: "Criar conta e entrar",
  headline: "O comando central de vendas.",
  description: "CRM, conversas, agendamentos e IA em uma única interface pensada para velocidade e densidade de informação.",
} as const;

const ES_COPY = {
  nameRequired: "El nombre es obligatorio",
  passwordMinimum: "La contraseña debe tener al menos 8 caracteres",
  confirmRequired: "Confirma la contraseña",
  mismatch: "Las contraseñas no coinciden",
  createError: "Error al crear la cuenta",
  tryAgain: "Inténtalo de nuevo.",
  title: "Crea tu cuenta",
  subtitle: "Has sido invitado a acceder a la plataforma.",
  validating: "Validando invitación...",
  invalidInvite: "Invitación inválida",
  invalidInviteDescription: "Este enlace de invitación venció, ya fue utilizado o no es válido.",
  requestNew: "Solicita una nueva invitación al administrador.",
  validInvite: (tenantName: string) => `Invitación válida para ${tenantName}`,
  accountEmail: "La cuenta se creará con el correo electrónico:",
  yourName: "Tu nombre",
  fullName: "Nombre completo",
  password: "Contraseña",
  minimumPlaceholder: "Mínimo 8 caracteres",
  confirmPassword: "Confirmar contraseña",
  creating: "Creando cuenta...",
  createAndEnter: "Crear cuenta e ingresar",
  headline: "El centro de comando de ventas.",
  description: "CRM, conversaciones, agenda e IA en una sola interfaz diseñada para trabajar con velocidad y alta densidad de información.",
} as const;

type InviteFormValues = {
  name: string;
  password: string;
  confirmPassword: string;
};

export default function AcceptInvite() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token ?? "";

  const { login } = useAuth();
  const { toast } = useToast();
  const { locale } = useI18n();
  const copy = locale === "pt-BR" ? PT_COPY : ES_COPY;
  const formSchema = useMemo(
    () =>
      z
        .object({
          name: z.string().min(1, copy.nameRequired),
          password: z.string().min(8, copy.passwordMinimum),
          confirmPassword: z.string().min(1, copy.confirmRequired),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: copy.mismatch,
          path: ["confirmPassword"],
        }),
    [copy],
  );

  const {
    data: invite,
    isLoading: inviteLoading,
    error: inviteError,
  } = useValidateInvite(token, {
    query: { retry: false, queryKey: getValidateInviteQueryKey(token) },
  });

  const acceptMutation = useAcceptInvite();

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", password: "", confirmPassword: "" },
  });

  function onSubmit(values: InviteFormValues) {
    acceptMutation.mutate(
      { data: { token, name: values.name, password: values.password } },
      {
        onSuccess: (response) => {
          login(response.token, response.user);
        },
        onError: (error) => {
          toast({
            title: copy.createError,
            description: error.message || copy.tryAgain,
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
            <h1 className="text-3xl font-bold tracking-tight">{copy.title}</h1>
            <p className="text-muted-foreground">{copy.subtitle}</p>
          </div>

          {inviteLoading && (
            <div className="flex items-center gap-3 text-muted-foreground py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{copy.validating}</span>
            </div>
          )}

          {!inviteLoading && inviteError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="font-semibold">{copy.invalidInvite}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {(inviteError as { message?: string })?.message || copy.invalidInviteDescription}
              </p>
              <p className="text-sm text-muted-foreground">{copy.requestNew}</p>
            </div>
          )}

          {!inviteLoading && invite && (
            <>
              <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>{copy.validInvite(invite.tenantName)}</span>
                </div>
                <p className="text-sm text-muted-foreground pl-6">
                  {copy.accountEmail}{" "}
                  <span className="font-mono font-medium">{invite.email}</span>
                </p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{copy.yourName}</FormLabel>
                        <FormControl>
                          <Input placeholder={copy.fullName} {...field} />
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
                        <FormLabel>{copy.password}</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder={copy.minimumPlaceholder} {...field} />
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
                        <FormLabel>{copy.confirmPassword}</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={acceptMutation.isPending}>
                    {acceptMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {copy.creating}
                      </>
                    ) : (
                      copy.createAndEnter
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
          <h2 className="text-4xl font-bold">{copy.headline}</h2>
          <p className="text-lg opacity-80 leading-relaxed">{copy.description}</p>
        </div>
      </div>
    </div>
  );
}
