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
import { BarChart3, Eye, EyeOff, FileText, Pause, Play, Sparkles, Users, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import logoDark from "/logo-full-dark.svg";
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


type DemoChapter = {
  id: string;
  label: string;
  title: string;
  description: string;
  start: number;
  icon: typeof Users;
};

const PT_CHAPTERS: DemoChapter[] = [
  { id: "crm", label: "CRM", title: "Pipeline em tempo real", description: "Leads, oportunidades e próximos passos organizados em um único fluxo.", start: 0, icon: Users },
  { id: "vendi", label: "Vendi IA", title: "IA trabalhando junto com a equipe", description: "Sugestões, contexto e ações assistidas no momento certo.", start: 6, icon: Sparkles },
  { id: "propostas", label: "Propostas", title: "Do orçamento à proposta", description: "Monte, revise e acompanhe propostas sem sair da jornada comercial.", start: 12, icon: FileText },
  { id: "inteligencia", label: "Inteligência", title: "Decisões com visão do negócio", description: "Indicadores e prioridades para agir com mais velocidade.", start: 18, icon: BarChart3 },
];

const ES_CHAPTERS: DemoChapter[] = [
  { id: "crm", label: "CRM", title: "Pipeline en tiempo real", description: "Leads, oportunidades y próximos pasos organizados en un único flujo.", start: 0, icon: Users },
  { id: "vendi", label: "Vendi IA", title: "IA trabajando con el equipo", description: "Sugerencias, contexto y acciones asistidas en el momento adecuado.", start: 6, icon: Sparkles },
  { id: "propostas", label: "Propuestas", title: "Del presupuesto a la propuesta", description: "Crea, revisa y acompaña propuestas sin salir de la jornada comercial.", start: 12, icon: FileText },
  { id: "inteligencia", label: "Inteligencia", title: "Decisiones con visión del negocio", description: "Indicadores y prioridades para actuar con más velocidad.", start: 18, icon: BarChart3 },
];

function ProductTour({ locale }: { locale: string }) {
  const chapters = locale === "pt-BR" ? PT_CHAPTERS : ES_CHAPTERS;
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoUrl = (import.meta.env.VITE_LOGIN_DEMO_VIDEO_URL as string | undefined)?.trim();
  const active = chapters[activeIndex]!;

  useEffect(() => {
    if (videoUrl || !playing) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % chapters.length);
    }, 4300);
    return () => window.clearInterval(timer);
  }, [chapters.length, playing, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    video.muted = muted;
    if (playing) {
      void video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, [muted, playing, videoReady]);

  const selectChapter = (index: number) => {
    setActiveIndex(index);
    const video = videoRef.current;
    if (video && videoReady) {
      video.currentTime = chapters[index]!.start;
      setPlaying(true);
      void video.play().catch(() => undefined);
    }
  };

  const togglePlay = () => setPlaying((value) => !value);

  return (
    <div className="w-full max-w-2xl text-white">
      <div className="mb-5 flex items-center justify-between gap-4">
        <img src={logoDark} alt="Vendor.ai" className="h-11 w-auto" />
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
          {locale === "pt-BR" ? "Conheça a plataforma" : "Conoce la plataforma"}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-slate-950/90 shadow-2xl shadow-blue-950/20">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="aspect-video w-full object-cover"
            autoPlay
            muted={muted}
            playsInline
            loop
            preload="metadata"
            onLoadedMetadata={() => setVideoReady(true)}
            onTimeUpdate={(event) => {
              const current = event.currentTarget.currentTime;
              let next = 0;
              for (let index = 0; index < chapters.length; index += 1) {
                if (current >= chapters[index]!.start) next = index;
              }
              if (next !== activeIndex) setActiveIndex(next);
            }}
          />
        ) : (
          <div className="aspect-video p-5 sm:p-7">
            <div className="flex h-full overflow-hidden rounded-xl border border-white/10 bg-slate-50 text-slate-900">
              <div className="w-[27%] border-r border-slate-200 bg-white p-3">
                <div className="mb-4 h-5 w-20 rounded bg-slate-900/90" />
                <div className="space-y-2">
                  {["Visão geral", "CRM", "Conversas", "Propostas", "Inteligência"].map((item, index) => (
                    <div
                      key={item}
                      className={`rounded-md px-2 py-2 text-[10px] font-medium transition-all duration-500 ${index === activeIndex + 1 || (activeIndex === 3 && index === 4) ? "bg-blue-50 text-blue-700" : "text-slate-500"}`}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="min-w-0 flex-1 bg-slate-50 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="h-2.5 w-20 rounded bg-slate-300" />
                    <div className="mt-2 h-5 w-40 rounded bg-slate-900/85" />
                  </div>
                  <div className="h-8 w-20 rounded-lg bg-blue-600" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="h-2 w-12 rounded bg-slate-200" />
                      <div className="mt-2 h-5 w-16 rounded bg-slate-800" />
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-3 flex gap-2">
                    {[0, 1, 2, 3].map((item) => (
                      <div key={item} className={`h-6 flex-1 rounded transition-colors duration-700 ${item === activeIndex ? "bg-blue-100" : "bg-slate-100"}`} />
                    ))}
                  </div>
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <div className={`h-6 w-6 rounded-full transition-colors duration-500 ${item === activeIndex ? "bg-blue-600" : "bg-slate-200"}`} />
                        <div className="h-2 flex-1 rounded bg-slate-200" />
                        <div className="h-5 w-14 rounded bg-slate-100" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent px-5 pb-5 pt-16">
          <div className="flex items-end justify-between gap-5">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">{active.label}</p>
              <h2 className="text-xl font-semibold leading-tight sm:text-2xl">{active.title}</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/70">{active.description}</p>
            </div>
            <div className="pointer-events-auto flex shrink-0 gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={playing ? "Pausar demonstração" : "Reproduzir demonstração"}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              {videoUrl ? (
                <button
                  type="button"
                  onClick={() => setMuted((value) => !value)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label={muted ? "Ativar som" : "Desativar som"}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {chapters.map((chapter, index) => {
          const Icon = chapter.icon;
          const selected = index === activeIndex;
          return (
            <button
              key={chapter.id}
              type="button"
              onClick={() => selectChapter(index)}
              className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${selected ? "border-white/40 bg-white text-slate-900 shadow-sm" : "border-white/15 bg-white/10 text-white hover:bg-white/15"}`}
              aria-pressed={selected}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium">{chapter.label}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/75">
        {locale === "pt-BR"
          ? "CRM, conversas, propostas, automações e IA conectados em uma única experiência."
          : "CRM, conversaciones, propuestas, automatizaciones e IA conectados en una sola experiencia."}
      </p>
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
