import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, useDemoLogin } from "@workspace/api-client-react";
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
import { Eye, EyeOff, Lightbulb, MapPin, Sparkles, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import logoDark from "/logo-full-dark.svg";
import { featureForDate } from "@/lib/vendorFeatureCatalog";
import logoLight from "/logo-full-light.svg";

const POST_LOGIN_PATH_KEY = "vendorai_post_login_path";

const PT_COPY = {
  invalidEmail: "Email inválido",
  requiredPassword: "Senha é obrigatória",
  loginErrorTitle: "Erro ao entrar",
  loginErrorDescription: "Verifique suas credenciais.",
  demoErrorTitle: "Erro ao entrar na demo",
  demoErrorDescription: "Não foi possível acessar a conta de demonstração.",
  title: "Entrar",
  subtitle: "Insira suas credenciais para acessar a plataforma.",
  email: "Email",
  emailPlaceholder: "seu@email.com",
  password: "Senha",
  hidePassword: "Ocultar senha",
  showPassword: "Mostrar senha",
  entering: "Entrando...",
  enterPlatform: "Entrar na Plataforma",
  or: "ou",
  enterGoogle: "Entrar com Google",
  demo: "Acessar conta de demonstração",
  forgotPassword: "Esqueci minha senha",
  headline: "O comando central de vendas.",
  description: "CRM, conversas, agendamentos e IA em uma única interface pensada para velocidade e densidade de informação.",
} as const;

const ES_COPY = {
  invalidEmail: "Correo electrónico inválido",
  requiredPassword: "La contraseña es obligatoria",
  loginErrorTitle: "Error al iniciar sesión",
  loginErrorDescription: "Verifica tus credenciales.",
  demoErrorTitle: "Error al entrar en la demo",
  demoErrorDescription: "No fue posible acceder a la cuenta de demostración.",
  title: "Iniciar sesión",
  subtitle: "Ingresa tus credenciales para acceder a la plataforma.",
  email: "Correo electrónico",
  emailPlaceholder: "tu@email.com",
  password: "Contraseña",
  hidePassword: "Ocultar contraseña",
  showPassword: "Mostrar contraseña",
  entering: "Ingresando...",
  enterPlatform: "Entrar a la plataforma",
  or: "o",
  enterGoogle: "Entrar con Google",
  demo: "Acceder a la cuenta de demostración",
  forgotPassword: "Olvidé mi contraseña",
  headline: "El centro de comando de ventas.",
  description: "CRM, conversaciones, agenda e IA en una sola interfaz diseñada para trabajar con velocidad y alta densidad de información.",
} as const;

type LoginFormValues = {
  email: string;
  password: string;
};

function consumeSafePostLoginPath(): string | null {
  const path = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
  return path;
}


type DailyProverb = {
  reference: string;
  pt: string;
  es: string;
};

const DAILY_PROVERBS: DailyProverb[] = [
  { reference: "Provérbios 3:5-6", pt: "Confie em Deus de todo o coração e permita que Ele direcione seus caminhos.", es: "Confía en Dios de todo corazón y permite que Él dirija tus caminos." },
  { reference: "Provérbios 16:3", pt: "Entregue seus planos a Deus e trabalhe com propósito.", es: "Entrega tus planes a Dios y trabaja con propósito." },
  { reference: "Provérbios 21:5", pt: "Planos bem pensados e trabalho constante conduzem a bons resultados.", es: "Los planes bien pensados y el trabajo constante conducen a buenos resultados." },
  { reference: "Provérbios 22:29", pt: "A excelência no trabalho abre portas e coloca você diante de grandes oportunidades.", es: "La excelencia en el trabajo abre puertas y te pone frente a grandes oportunidades." },
  { reference: "Provérbios 11:14", pt: "Boas decisões crescem quando buscamos conselho e ouvimos pessoas sábias.", es: "Las buenas decisiones crecen cuando buscamos consejo y escuchamos a personas sabias." },
  { reference: "Provérbios 15:22", pt: "Planos ganham força quando são construídos com bons conselhos.", es: "Los planes se fortalecen cuando se construyen con buenos consejos." },
  { reference: "Provérbios 10:4", pt: "Mãos diligentes constroem prosperidade com constância.", es: "Las manos diligentes construyen prosperidad con constancia." },
  { reference: "Provérbios 12:24", pt: "A dedicação coloca você em posição de liderança.", es: "La dedicación te coloca en posición de liderazgo." },
  { reference: "Provérbios 13:4", pt: "Desejo sem ação não basta; a diligência produz frutos.", es: "El deseo sin acción no basta; la diligencia produce frutos." },
  { reference: "Provérbios 14:23", pt: "Todo trabalho sério produz resultado; apenas falar não é suficiente.", es: "Todo trabajo serio produce resultado; solo hablar no es suficiente." },
  { reference: "Provérbios 16:9", pt: "Planejamos o caminho, mas permanecemos abertos à direção de Deus.", es: "Planeamos el camino, pero permanecemos abiertos a la dirección de Dios." },
  { reference: "Provérbios 18:15", pt: "A mente sábia busca conhecimento e continua aprendendo.", es: "La mente sabia busca conocimiento y continúa aprendiendo." },
  { reference: "Provérbios 19:20", pt: "Ouvir conselhos hoje ajuda a tomar decisões mais sábias amanhã.", es: "Escuchar consejos hoy ayuda a tomar decisiones más sabias mañana." },
  { reference: "Provérbios 20:18", pt: "Estratégias ficam melhores quando são avaliadas com conselho.", es: "Las estrategias mejoran cuando se evalúan con buen consejo." },
  { reference: "Provérbios 22:4", pt: "Humildade, respeito a Deus e caráter constroem riqueza que permanece.", es: "Humildad, respeto a Dios y carácter construyen una riqueza que permanece." },
  { reference: "Provérbios 24:3-4", pt: "Sabedoria constrói; entendimento fortalece; conhecimento enche de valor.", es: "La sabiduría construye; el entendimiento fortalece; el conocimiento llena de valor." },
  { reference: "Provérbios 27:17", pt: "Pessoas boas se desafiam e se tornam melhores juntas.", es: "Las buenas personas se desafían y se vuelven mejores juntas." },
];

function proverbForToday(): DailyProverb {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return DAILY_PROVERBS[dayOfYear % DAILY_PROVERBS.length]!;
}

function ProductTour({ locale }: { locale: string }) {
  const dailyFeature = featureForDate();
  const dailyProverb = proverbForToday();
  const isPt = locale === "pt-BR";

  return (
    <div className="w-full max-w-2xl text-white">
      <div className="mb-6 flex items-center justify-between gap-4">
        <img src={logoDark} alt="Vendor.ai" className="h-14 w-auto sm:h-16" />
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
          {isPt ? "Uma função nova por dia" : "Una función nueva por día"}
        </span>
      </div>

      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-100/80">
          {isPt ? "Função do dia" : "Función del día"} · {dailyFeature.category}
        </p>
        <h2 className="max-w-xl text-3xl font-semibold leading-[1.06] tracking-tight sm:text-4xl">
          {dailyFeature.name}
        </h2>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-white/78">
          {dailyFeature.whatItDoes}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/15 bg-white/[0.09] p-4 backdrop-blur">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/12">
            <Lightbulb className="h-4 w-4" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
            {isPt ? "Como usar" : "Cómo usar"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/90">{dailyFeature.howToUse}</p>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.09] p-4 backdrop-blur">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/12">
            <TrendingUp className="h-4 w-4" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
            {isPt ? "Benefício" : "Beneficio"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/90">{dailyFeature.benefit}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/15 bg-slate-950/20 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
          <MapPin className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
            {isPt ? "Onde encontrar" : "Dónde encontrar"}
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-white/90">
            {dailyFeature.category} · {dailyFeature.route}
          </p>
        </div>
        <Sparkles className="ml-auto h-4 w-4 shrink-0 text-white/45" />
      </div>

      <div className="mt-5 rounded-xl border border-white/15 bg-white/[0.08] px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
            {isPt ? "Provérbio do dia" : "Proverbio del día"}
          </span>
          <span className="text-xs font-medium text-white/70">{dailyProverb.reference}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/90">
          {isPt ? dailyProverb.pt : dailyProverb.es}
        </p>
      </div>
    </div>
  );
}

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
  const { locale } = useI18n();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const copy = locale === "pt-BR" ? PT_COPY : ES_COPY;
  const formSchema = useMemo(
    () => z.object({
      email: z.string().email(copy.invalidEmail),
      password: z.string().min(1, copy.requiredPassword),
    }),
    [copy],
  );

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: LoginFormValues) {
    loginMutation.mutate({ data: values }, {
      onSuccess: (response) => {
        const returnPath = consumeSafePostLoginPath();
        login(response.token, response.user);
        if (returnPath) window.location.assign(returnPath);
      },
      onError: (error) => {
        toast({
          title: copy.loginErrorTitle,
          description: error.message || copy.loginErrorDescription,
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
          const returnPath = consumeSafePostLoginPath();
          login(response.token, response.user, { isDemo: true });
          if (returnPath) window.location.assign(returnPath);
        },
        onError: (error) => {
          toast({
            title: copy.demoErrorTitle,
            description: error.message || copy.demoErrorDescription,
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

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{copy.email}</FormLabel>
                    <FormControl>
                      <Input placeholder={copy.emailPlaceholder} {...field} />
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
                      <div className="relative">
                        <Input type={showPassword ? "text" : "password"} placeholder="••••••••" {...field} className="pr-10" />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          tabIndex={-1}
                          aria-label={showPassword ? copy.hidePassword : copy.showPassword}
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
                {loginMutation.isPending ? copy.entering : copy.enterPlatform}
              </Button>
            </form>
          </Form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">{copy.or}</span>
            </div>
          </div>

          <div className="space-y-3">
            <Button type="button" variant="outline" className="w-full gap-2" onClick={onGoogleLogin}>
              <GoogleIcon />
              {copy.enterGoogle}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onDemoLogin}
              disabled={demoLoginMutation.isPending}
            >
              {demoLoginMutation.isPending ? copy.entering : copy.demo}
            </Button>
          </div>

          <div className="text-center">
            <Link
              href="/esqueci-senha"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
            >
              {copy.forgotPassword}
            </Link>
          </div>
        </div>
      </div>
      <div className="hidden lg:flex items-center justify-center bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 p-10 xl:p-14">
        <ProductTour locale={locale} />
      </div>
    </div>
  );
}
