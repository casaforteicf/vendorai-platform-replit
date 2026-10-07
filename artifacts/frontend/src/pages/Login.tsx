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
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  EyeOff,
  MessageSquareText,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import logoLight from "/logo-full-light.svg";

const POST_LOGIN_PATH_KEY = "vendorai_post_login_path";
const PUBLIC_MEDIA = "https://appvendorai.com/media/vendorai-official";

const PT_COPY = {
  invalidEmail: "Email inválido",
  requiredPassword: "Senha é obrigatória",
  loginErrorTitle: "Erro ao entrar",
  loginErrorDescription: "Verifique suas credenciais.",
  demoErrorTitle: "Erro ao entrar na demo",
  demoErrorDescription: "Não foi possível acessar a conta de demonstração.",
  title: "Bem-vindo ao Vendor.ai",
  subtitle: "Sua operação comercial, atendimento e inteligência em um só lugar.",
  email: "Email",
  emailPlaceholder: "seu@email.com",
  password: "Senha",
  passwordPlaceholder: "Digite sua senha",
  hidePassword: "Ocultar senha",
  showPassword: "Mostrar senha",
  entering: "Entrando...",
  enterPlatform: "Entrar na Plataforma",
  or: "ou",
  enterGoogle: "Entrar com Google",
  demo: "Acessar conta de demonstração",
  forgotPassword: "Esqueci minha senha",
  knowVendor: "Conhecer o Vendor.ai",
  tourKicker: "PLATAFORMA COMPLETA",
  tourTitle: "Conheça as ferramentas do Vendor.ai",
  tourSubtitle: "Veja telas reais do produto e entenda como cada ferramenta entra na operação.",
  realScreen: "Tela real do Vendor.ai",
  unavailableScreen: "Prévia real temporariamente indisponível.",
  previous: "Ferramenta anterior",
  next: "Próxima ferramenta",
  proverbLabel: "Provérbio do dia",
  reflectionLabel: "Reflexão",
} as const;

const ES_COPY = {
  invalidEmail: "Correo electrónico inválido",
  requiredPassword: "La contraseña es obligatoria",
  loginErrorTitle: "Error al iniciar sesión",
  loginErrorDescription: "Verifica tus credenciales.",
  demoErrorTitle: "Error al entrar en la demo",
  demoErrorDescription: "No fue posible acceder a la cuenta de demostración.",
  title: "Bienvenido a Vendor.ai",
  subtitle: "Tu operación comercial, atención e inteligencia en un solo lugar.",
  email: "Correo electrónico",
  emailPlaceholder: "tu@email.com",
  password: "Contraseña",
  passwordPlaceholder: "Ingresa tu contraseña",
  hidePassword: "Ocultar contraseña",
  showPassword: "Mostrar contraseña",
  entering: "Ingresando...",
  enterPlatform: "Entrar a la plataforma",
  or: "o",
  enterGoogle: "Entrar con Google",
  demo: "Acceder a la cuenta de demostración",
  forgotPassword: "Olvidé mi contraseña",
  knowVendor: "Conocer Vendor.ai",
  tourKicker: "PLATAFORMA COMPLETA",
  tourTitle: "Conoce las herramientas de Vendor.ai",
  tourSubtitle: "Mira pantallas reales del producto y entiende cómo participa cada herramienta en la operación.",
  realScreen: "Pantalla real de Vendor.ai",
  unavailableScreen: "Vista real temporalmente no disponible.",
  previous: "Herramienta anterior",
  next: "Siguiente herramienta",
  proverbLabel: "Proverbio del día",
  reflectionLabel: "Reflexión",
} as const;

type LoginFormValues = {
  email: string;
  password: string;
};

type TourItem = {
  key: string;
  label: string;
  kicker: string;
  title: string;
  description: string;
  bullets: string[];
  image?: string;
  previewNote?: string;
  icon: typeof BarChart3;
};

const PT_TOUR: TourItem[] = [
  {
    key: "crm",
    label: "CRM & Pipeline",
    kicker: "CRM",
    title: "Pipeline comercial com estágio, responsável e próxima ação.",
    description: "O CRM organiza oportunidades e mantém o histórico comercial visível para pessoas e agentes de IA.",
    bullets: ["Pipeline visual", "Responsável e próxima ação", "Histórico compartilhado com os agentes"],
    image: `${PUBLIC_MEDIA}/crm-pipeline/desktop-1440.png`,
    icon: BarChart3,
  },
  {
    key: "agents",
    label: "Agentes de IA",
    kicker: "Agentes de IA",
    title: "Agentes especializados trabalhando junto com sua equipe.",
    description: "Configure agentes para atuar em diferentes momentos da operação, respeitando contexto, regras e permissões do tenant.",
    bullets: ["Configuração por função", "Contexto compartilhado", "Ações conforme permissões"],
    image: `${PUBLIC_MEDIA}/agents/desktop-1440.png`,
    icon: Sparkles,
  },
  {
    key: "omnichannel",
    label: "Omnichannel",
    kicker: "Atendimento",
    title: "Todas as conversas entram na mesma operação.",
    description: "O Omnichannel reúne atendimento e histórico para reduzir perda de contexto entre canais, pessoas e etapas do funil.",
    bullets: ["Caixa de entrada unificada", "Histórico do contato", "Distribuição e continuidade"],
    image: `${PUBLIC_MEDIA}/omnichannel/desktop-1440.png`,
    icon: MessageSquareText,
  },
  {
    key: "prospector",
    label: "Prospecção",
    kicker: "Prospector IA",
    title: "Encontre novos clientes antes de esperar o próximo lead.",
    description: "O Prospector IA organiza descoberta, enriquecimento e priorização para transformar busca ativa em uma rotina comercial estruturada.",
    bullets: ["Busca por perfil e região", "Enriquecimento de contexto", "Priorização para abordagem"],
    image: `${PUBLIC_MEDIA}/prospector/desktop-1440.png`,
    icon: Search,
  },
  {
    key: "revenue",
    label: "Revenue Intelligence",
    kicker: "Revenue Scout",
    title: "A próxima venda também pode estar dentro da sua carteira.",
    description: "O Revenue Scout observa sinais, regras e comportamento para encontrar recompra, expansão e oportunidades que poderiam passar despercebidas.",
    bullets: ["Recompra e cross-sell", "Sinais de oportunidade", "Próxima melhor ação"],
    image: `${PUBLIC_MEDIA}/revenue-scout/desktop-1440.png`,
    icon: Sparkles,
  },
  {
    key: "propostas",
    label: "Propostas & Orçamentos",
    kicker: "Propostas",
    title: "Da composição comercial à proposta apresentada ao cliente.",
    description: "O Vendor.ai organiza propostas, itens e versões para manter a negociação comercial vinculada ao contexto do cliente.",
    bullets: ["Propostas organizadas", "Itens e versões", "Histórico comercial"],
    image: `${PUBLIC_MEDIA}/propostas/desktop-1440.png`,
    icon: CircleDollarSign,
  },
  {
    key: "marketing",
    label: "Marketing",
    kicker: "Marketing & Conteúdo",
    title: "Planejamento, conteúdo e campanhas no mesmo fluxo.",
    description: "O Marketing Hub reúne planejamento de mídia, criação de conteúdo e operação de campanhas para conectar estratégia, execução e acompanhamento.",
    bullets: ["Planejamento de mídia", "Conteúdo e calendário", "Campanhas e anúncios"],
    image: `${PUBLIC_MEDIA}/marketing-content/desktop-1440.png`,
    icon: Sparkles,
  },
  {
    key: "agenda",
    label: "Agenda Inteligente",
    kicker: "Agenda",
    title: "Próxima ação com responsável e prazo.",
    description: "A agenda conecta compromissos, tarefas e follow-ups ao contexto comercial para que a operação não dependa da memória de alguém.",
    bullets: ["Compromissos e tarefas", "Vínculo com leads", "Próxima ação organizada"],
    image: `${PUBLIC_MEDIA}/agenda/desktop-1440.png`,
    icon: CalendarDays,
  },
  {
    key: "analytics",
    label: "Analytics",
    kicker: "Analytics",
    title: "Dados comerciais precisam virar decisão.",
    description: "Os painéis conectam indicadores de vendas, marketing e operação para facilitar comparação, leitura de desempenho e acompanhamento de evolução.",
    bullets: ["KPIs comerciais", "Indicadores de marketing", "Comparações e relatórios"],
    image: `${PUBLIC_MEDIA}/analytics/desktop-1440.png`,
    icon: BarChart3,
  },
  {
    key: "financeiro",
    label: "Financeiro & ERP",
    kicker: "Financeiro & ERP",
    title: "A operação comercial não termina no fechamento.",
    description: "O Financeiro / ERP Hub aproxima cobrança, comissões, conciliação e indicadores da mesma jornada que originou a venda.",
    bullets: ["Cobranças e recebimentos", "Comissões", "Conciliação e indicadores"],
    image: `${PUBLIC_MEDIA}/financeiro-erp/desktop-1440.png`,
    icon: CircleDollarSign,
  },
];

const ES_TOUR: TourItem[] = [
  {
    key: "crm",
    label: "CRM & Pipeline",
    kicker: "CRM",
    title: "Pipeline comercial con etapa, responsable y próxima acción.",
    description: "El CRM organiza oportunidades y mantiene el historial comercial visible para personas y agentes de IA.",
    bullets: ["Pipeline visual", "Responsable y próxima acción", "Historial compartido con los agentes"],
    image: `${PUBLIC_MEDIA}/crm-pipeline/desktop-1440.png`,
    icon: BarChart3,
  },
  {
    key: "agents",
    label: "Agentes de IA",
    kicker: "Agentes de IA",
    title: "Agentes especializados trabajando junto con tu equipo.",
    description: "Configura agentes para actuar en diferentes momentos de la operación, respetando contexto, reglas y permisos del tenant.",
    bullets: ["Configuración por función", "Contexto compartido", "Acciones según permisos"],
    image: `${PUBLIC_MEDIA}/agents/desktop-1440.png`,
    icon: Sparkles,
  },
  {
    key: "omnichannel",
    label: "Omnichannel",
    kicker: "Atención",
    title: "Todas las conversaciones entran en la misma operación.",
    description: "Omnichannel reúne atención e historial para reducir pérdida de contexto entre canales, personas y etapas del embudo.",
    bullets: ["Bandeja unificada", "Historial del contacto", "Distribución y continuidad"],
    image: `${PUBLIC_MEDIA}/omnichannel/desktop-1440.png`,
    icon: MessageSquareText,
  },
  {
    key: "prospector",
    label: "Prospección",
    kicker: "Prospector IA",
    title: "Encuentra nuevos clientes antes de esperar el próximo lead.",
    description: "Prospector IA organiza descubrimiento, enriquecimiento y priorización para convertir la búsqueda activa en una rutina comercial estructurada.",
    bullets: ["Búsqueda por perfil y región", "Enriquecimiento de contexto", "Priorización para contacto"],
    image: `${PUBLIC_MEDIA}/prospector/desktop-1440.png`,
    icon: Search,
  },
  {
    key: "revenue",
    label: "Revenue Intelligence",
    kicker: "Revenue Scout",
    title: "La próxima venta también puede estar dentro de tu cartera.",
    description: "Revenue Scout observa señales, reglas y comportamiento para encontrar recompra, expansión y oportunidades que podrían pasar desapercibidas.",
    bullets: ["Recompra y cross-sell", "Señales de oportunidad", "Próxima mejor acción"],
    image: `${PUBLIC_MEDIA}/revenue-scout/desktop-1440.png`,
    icon: Sparkles,
  },
  {
    key: "propostas",
    label: "Propuestas & Presupuestos",
    kicker: "Propuestas",
    title: "De la composición comercial a la propuesta presentada al cliente.",
    description: "Vendor.ai organiza propuestas, ítems y versiones para mantener la negociación vinculada al contexto del cliente.",
    bullets: ["Propuestas organizadas", "Ítems y versiones", "Historial comercial"],
    image: `${PUBLIC_MEDIA}/propostas/desktop-1440.png`,
    icon: CircleDollarSign,
  },
  {
    key: "marketing",
    label: "Marketing",
    kicker: "Marketing & Contenido",
    title: "Planificación, contenido y campañas en el mismo flujo.",
    description: "Marketing Hub reúne planificación de medios, creación de contenido y operación de campañas para conectar estrategia, ejecución y seguimiento.",
    bullets: ["Planificación de medios", "Contenido y calendario", "Campañas y anuncios"],
    image: `${PUBLIC_MEDIA}/marketing-content/desktop-1440.png`,
    icon: Sparkles,
  },
  {
    key: "agenda",
    label: "Agenda Inteligente",
    kicker: "Agenda",
    title: "Próxima acción con responsable y plazo.",
    description: "La agenda conecta compromisos, tareas y seguimientos al contexto comercial para que la operación no dependa de la memoria de alguien.",
    bullets: ["Compromisos y tareas", "Vínculo con leads", "Próxima acción organizada"],
    image: `${PUBLIC_MEDIA}/agenda/desktop-1440.png`,
    icon: CalendarDays,
  },
  {
    key: "analytics",
    label: "Analytics",
    kicker: "Analytics",
    title: "Los datos comerciales deben convertirse en decisión.",
    description: "Los paneles conectan indicadores de ventas, marketing y operación para facilitar comparación, lectura de desempeño y seguimiento de evolución.",
    bullets: ["KPIs comerciales", "Indicadores de marketing", "Comparaciones e informes"],
    image: `${PUBLIC_MEDIA}/analytics/desktop-1440.png`,
    icon: BarChart3,
  },
  {
    key: "financeiro",
    label: "Finanzas & ERP",
    kicker: "Finanzas & ERP",
    title: "La operación comercial no termina en el cierre.",
    description: "Financeiro / ERP Hub acerca cobros, comisiones, conciliación e indicadores a la misma jornada que originó la venta.",
    bullets: ["Cobros y recibos", "Comisiones", "Conciliación e indicadores"],
    image: `${PUBLIC_MEDIA}/financeiro-erp/desktop-1440.png`,
    icon: CircleDollarSign,
  },
];

const PT_PROVERBS = [
  { reference: "Provérbios 21:5", text: "Os planos bem preparados conduzem a resultados consistentes.", reflection: "Planejamento cuidadoso e execução constante reduzem improvisos e melhoram a qualidade das decisões." },
  { reference: "Provérbios 16:3", text: "Confie seus trabalhos ao Senhor e estabeleça seus planos com propósito.", reflection: "Propósito claro ajuda a transformar atividade em direção e disciplina em resultado." },
  { reference: "Provérbios 15:22", text: "Planos se fortalecem quando passam por bons conselhos.", reflection: "Ouvir perspectivas qualificadas antes de decidir reduz pontos cegos e melhora a execução." },
  { reference: "Provérbios 16:9", text: "O coração faz planos, mas o caminho pode exigir ajustes.", reflection: "Planejar é essencial; revisar a rota diante de fatos novos também faz parte de uma boa gestão." },
  { reference: "Provérbios 22:29", text: "A excelência no trabalho abre espaço para maiores responsabilidades.", reflection: "Qualidade, domínio e consistência constroem confiança ao longo do tempo." },
  { reference: "Provérbios 27:17", text: "Pessoas aprimoram pessoas.", reflection: "Times fortes crescem quando existe troca franca, aprendizado e colaboração." },
  { reference: "Provérbios 3:5-6", text: "Nem toda decisão deve depender apenas da própria compreensão.", reflection: "Humildade para revisar premissas e buscar direção evita decisões estreitas ou precipitadas." },
];

const ES_PROVERBS = [
  { reference: "Proverbios 21:5", text: "Los planes bien preparados conducen a resultados consistentes.", reflection: "La planificación cuidadosa y la ejecución constante reducen la improvisación y mejoran las decisiones." },
  { reference: "Proverbios 16:3", text: "Entrega tu trabajo a Dios y establece tus planes con propósito.", reflection: "Un propósito claro ayuda a convertir actividad en dirección y disciplina en resultado." },
  { reference: "Proverbios 15:22", text: "Los planes se fortalecen cuando reciben buen consejo.", reflection: "Escuchar perspectivas calificadas antes de decidir reduce puntos ciegos y mejora la ejecución." },
  { reference: "Proverbios 16:9", text: "El corazón hace planes, pero el camino puede exigir ajustes.", reflection: "Planificar es esencial; revisar la ruta ante hechos nuevos también forma parte de una buena gestión." },
  { reference: "Proverbios 22:29", text: "La excelencia en el trabajo abre espacio para mayores responsabilidades.", reflection: "Calidad, dominio y consistencia construyen confianza a lo largo del tiempo." },
  { reference: "Proverbios 27:17", text: "Las personas ayudan a perfeccionar a otras personas.", reflection: "Los equipos fuertes crecen con intercambio franco, aprendizaje y colaboración." },
  { reference: "Proverbios 3:5-6", text: "No toda decisión debe depender solamente de la propia comprensión.", reflection: "La humildad para revisar premisas y buscar dirección evita decisiones estrechas o apresuradas." },
];

function consumeSafePostLoginPath(): string | null {
  const path = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
  return path;
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

function dayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000);
}

function RealProductImage({
  src,
  alt,
  unavailable,
}: {
  src: string;
  alt: string;
  unavailable: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center bg-[linear-gradient(145deg,#f8fafc_0%,#eef4ff_100%)] px-8 text-center">
        <div className="max-w-sm rounded-2xl border border-slate-200/80 bg-white/90 px-7 py-6 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
            <BarChart3 className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-700">{alt}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{unavailable}</p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-contain object-top"
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export default function Login() {
  const loginMutation = useLogin();
  const demoLoginMutation = useDemoLogin();
  const { login } = useAuth();
  const { locale } = useI18n();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [homologLoginError, setHomologLoginError] = useState<string | null>(null);
  const homologAutoLoginAttempted = useRef(false);
  const copy = locale === "pt-BR" ? PT_COPY : ES_COPY;
  const tour = locale === "pt-BR" ? PT_TOUR : ES_TOUR;
  const proverbs = locale === "pt-BR" ? PT_PROVERBS : ES_PROVERBS;
  const active = tour[activeIndex];
  const proverb = proverbs[dayOfYear(new Date()) % proverbs.length];
  const isHomologationHost = useMemo(() => {
    const host = window.location.hostname.toLowerCase();
    return (
      host === "homolog.appvendorai.com"
      || host === "homolog2.appvendorai.com"
      || host.includes("vendorai-homolog-frontend-production.up.railway.app")
      || host.includes("vendorai-homolog-preview-production.up.railway.app")
    );
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % tour.length);
    }, 9000);
    return () => window.clearInterval(id);
  }, [tour.length]);

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
      },
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

  async function onHomologLogin() {
    setHomologLoginError(null);
    try {
      const response = await fetch("/api/auth/homolog-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const returnPath = consumeSafePostLoginPath();
      login(payload.token, payload.user);
      const target = returnPath && returnPath !== "/" && returnPath !== "/login"
        ? returnPath
        : "/dashboard";
      window.location.replace(target);
    } catch (error) {
      console.error("Homologation passwordless login failed", error);
      setHomologLoginError(
        locale === "pt-BR"
          ? "Não foi possível entrar automaticamente na homologação."
          : "No fue posible ingresar automáticamente a homologación.",
      );
    }
  }

  useEffect(() => {
    if (!isHomologationHost || homologAutoLoginAttempted.current) return;

    const existingToken = localStorage.getItem("vendorai_token");
    if (existingToken) {
      homologAutoLoginAttempted.current = true;
      const returnPath = consumeSafePostLoginPath();
      const target = returnPath && returnPath !== "/" && returnPath !== "/login"
        ? returnPath
        : "/dashboard";
      window.location.replace(target);
      return;
    }

    homologAutoLoginAttempted.current = true;
    void onHomologLogin();
  }, [isHomologationHost]);

  function previousTool() {
    setActiveIndex((current) => (current - 1 + tour.length) % tour.length);
  }

  function nextTool() {
    setActiveIndex((current) => (current + 1) % tour.length);
  }

  const ActiveIcon = active.icon;

  if (isHomologationHost) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-6 text-slate-950">
        <div className="w-full max-w-sm text-center">
          <img src={logoLight} alt="Vendor.ai" className="mx-auto h-12 w-auto" />
          <div className="mt-8 text-[22px] font-semibold tracking-[-0.025em]">
            {locale === "pt-BR" ? "Homologação Vendor.ai" : "Homologación Vendor.ai"}
          </div>
          <p className="mt-2 text-[14px] leading-6 text-slate-500">
            {homologLoginError
              ? homologLoginError
              : (locale === "pt-BR" ? "Entrando automaticamente, sem senha..." : "Ingresando automáticamente, sin contraseña...")}
          </p>
          {homologLoginError ? (
            <Button
              type="button"
              onClick={() => void onHomologLogin()}
              className="mt-6 h-11 rounded-lg bg-[#5b4ce6] px-5 text-white hover:bg-[#4e3fd8]"
            >
              {locale === "pt-BR" ? "Tentar novamente" : "Intentar nuevamente"}
            </Button>
          ) : (
            <div className="mx-auto mt-6 h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#5b4ce6]" aria-label="Entrando" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-950 lg:grid lg:grid-cols-[42%_58%]">
      <section className="flex min-h-screen items-center bg-white px-6 py-10 sm:px-10 lg:px-12 xl:px-20">
        <div className="mx-auto w-full max-w-[460px]">
          <img src={logoLight} alt="Vendor.ai" className="h-12 w-auto" />

          <div className="mt-10">
            <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-950">
              {copy.title}
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-6 text-slate-500">
              {copy.subtitle}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-9 space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-[13px] font-semibold text-slate-800">{copy.email}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={copy.emailPlaceholder}
                        {...field}
                        className="h-12 rounded-xl border-slate-200 bg-white px-4 text-[14px] shadow-none focus-visible:ring-2 focus-visible:ring-orange-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-[13px] font-semibold text-slate-800">{copy.password}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder={copy.passwordPlaceholder}
                          {...field}
                          className="h-12 rounded-xl border-slate-200 bg-white px-4 pr-11 text-[14px] shadow-none focus-visible:ring-2 focus-visible:ring-orange-200"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
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

              <Button
                type="submit"
                className="h-12 w-full rounded-xl bg-orange-500 text-[14px] font-semibold text-white shadow-none transition hover:bg-orange-600"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? copy.entering : copy.enterPlatform}
                {!loginMutation.isPending && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>
          </Form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-[12px] text-slate-400">{copy.or}</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-xl border-slate-200 bg-white text-[14px] font-medium shadow-none hover:bg-slate-50"
            onClick={onGoogleLogin}
          >
            <GoogleIcon />
            <span className="ml-2">{copy.enterGoogle}</span>
          </Button>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px]">
            <Link href="/esqueci-senha" className="font-medium text-blue-600 hover:text-blue-700 hover:underline">
              {copy.forgotPassword}
            </Link>
            <button
              type="button"
              onClick={onDemoLogin}
              disabled={demoLoginMutation.isPending}
              className="font-semibold text-slate-700 transition hover:text-orange-600 hover:underline disabled:opacity-50"
            >
              {demoLoginMutation.isPending ? copy.entering : copy.demo}
            </button>
          </div>

          <div className="mt-10 border-t border-slate-100 pt-6">
            <a
              href="https://appvendorai.com"
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-blue-600 hover:text-blue-700"
            >
              {copy.knowVendor}
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>

      <section className="relative hidden min-h-screen overflow-hidden border-l border-slate-200/70 bg-[radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.12),transparent_34%),radial-gradient(circle_at_100%_100%,rgba(249,115,22,0.10),transparent_28%),linear-gradient(145deg,#f7fbff_0%,#eef5ff_48%,#f8fafc_100%)] lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border border-orange-300/40" />
        <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full border border-blue-300/30" />

        <div className="relative flex flex-1 flex-col px-8 pb-6 pt-8 xl:px-12 xl:pt-10 2xl:px-16">
          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-orange-500">
            <span>{copy.tourKicker}</span>
            <span className="h-px w-12 bg-orange-300" />
          </div>

          <h2 className="mt-4 text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-slate-950 xl:text-[38px]">
            {copy.tourTitle}
          </h2>
          <p className="mt-2 text-[14px] leading-6 text-slate-500">
            {copy.tourSubtitle}
          </p>

          <div className="mt-6 flex gap-2 overflow-x-auto pb-2 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tour.map((item, index) => {
              const Icon = item.icon;
              const selected = index === activeIndex;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`flex min-w-max items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-[12px] font-semibold transition ${
                    selected
                      ? "border-orange-300 bg-orange-50 text-orange-600"
                      : "border-transparent bg-white/55 text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800"
                  }`}
                  aria-pressed={selected}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(245px,0.62fr)_minmax(0,1.38fr)] items-center gap-6 xl:gap-8">
            <div className="self-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-[0_12px_28px_rgba(249,115,22,0.22)]">
                <ActiveIcon className="h-5 w-5" />
              </div>
              <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-orange-500">
                {active.kicker}
              </p>
              <h3 className="mt-2 text-[25px] font-semibold leading-[1.14] tracking-[-0.025em] text-slate-950">
                {active.title}
              </h3>
              <p className="mt-3 text-[14px] leading-6 text-slate-600">
                {active.description}
              </p>

              <div className="mt-5 space-y-3">
                {active.bullets.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-2.5 text-[13px] leading-5 text-slate-600">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={previousTool}
                  aria-label={copy.previous}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex gap-1.5">
                  {tour.map((item, index) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      aria-label={item.label}
                      className={`h-2 rounded-full transition-all ${
                        index === activeIndex ? "w-5 bg-orange-500" : "w-2 bg-slate-300"
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={nextTool}
                  aria-label={copy.next}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-w-0 self-center">
              <div className="overflow-hidden rounded-[22px] border border-white/80 bg-white/85 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600">
                    {copy.realScreen}
                  </span>
                </div>
                <div className="aspect-[16/10] bg-slate-50">
                  {active.image ? (
                    <RealProductImage
                      src={active.image}
                      alt={`${copy.realScreen}: ${active.label}`}
                      unavailable={copy.unavailableScreen}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-10 text-center">
                      <div className="max-w-md">
                        <Sparkles className="mx-auto h-8 w-8 text-orange-500" />
                        <p className="mt-4 text-[14px] font-semibold text-slate-800">{active.label}</p>
                        <p className="mt-2 text-[12px] leading-5 text-slate-500">{active.previewNote}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <footer className="mt-3 border-t border-slate-200/80 pt-4">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-400">
                  {copy.proverbLabel} · {proverb.reference}
                </p>
                <p className="mt-1 text-[14px] font-semibold leading-5 text-slate-800">{proverb.text}</p>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">
                  <span className="font-semibold">{copy.reflectionLabel}:</span> {proverb.reflection}
                </p>
              </div>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
