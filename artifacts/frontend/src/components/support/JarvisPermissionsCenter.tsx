import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellRing,
  Bot,
  CheckCircle2,
  Eye,
  FileUp,
  LockKeyhole,
  Mic,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Volume2,
  WandSparkles,
} from "lucide-react";
import {
  DEFAULT_JARVIS_PERMISSIONS,
  getMicrophonePermissionState,
  getNotificationPermissionState,
  JARVIS_PERMISSIONS_EVENT,
  type JarvisPermissions,
  loadJarvisPermissions,
  RECOMMENDED_JARVIS_PERMISSIONS,
  requestMicrophonePermission,
  requestNotificationPermission,
  saveJarvisPermissions,
  type DevicePermissionState,
} from "@/lib/jarvisPermissions";

type ToggleKey = Exclude<keyof JarvisPermissions, "alwaysConfirmSensitiveActions" | "microphone" | "notifications">;

type ToggleDefinition = {
  key: ToggleKey;
  title: string;
  description: string;
  icon: typeof Mic;
};

const EXPERIENCE_PERMISSIONS: ToggleDefinition[] = [
  { key: "voiceReplies", title: "Respostas por voz", description: "Permite ao JARVIS falar respostas em voz alta.", icon: Volume2 },
  { key: "handsFree", title: "Conversa mãos livres", description: "Depois da ativação inicial, tenta reabrir o microfone para continuar a conversa.", icon: Mic },
  { key: "wakeWord", title: "Ativação por “Jarvis”", description: "No app nativo pode usar wake word conforme as permissões do sistema; no navegador exige sessão ativa.", icon: Sparkles },
  { key: "screenContext", title: "Entender a tela atual", description: "Permite usar rota, títulos, modal e itens selecionados. Senhas e parâmetros sensíveis são protegidos.", icon: Eye },
  { key: "attachments", title: "Usar arquivos enviados", description: "Permite analisar anexos que você escolher enviar ao JARVIS.", icon: FileUp },
  { key: "proactiveAlerts", title: "Alertas proativos", description: "Permite mostrar avisos quando o motor de prioridade identificar algo importante.", icon: Bell },
  { key: "proactiveVoice", title: "Alertas proativos por voz", description: "Permite falar alertas de alta prioridade quando a voz estiver disponível.", icon: BellRing },
];

const OPERATIONAL_PERMISSIONS: ToggleDefinition[] = [
  { key: "createOperationalTasks", title: "Criar tarefas e preparações", description: "Nível operacional: tarefas, registros, rascunhos e preparações. A autonomia real do agente continua valendo.", icon: Bot },
  { key: "editOperationalData", title: "Editar dados operacionais", description: "Permite alterações reversíveis quando o usuário e o agente tiverem autorização no VendorAI.", icon: WandSparkles },
  { key: "undoReversibleActions", title: "Desfazer ações reversíveis", description: "Permite Undo somente quando houver estado anterior confiável. Ações sensíveis ainda exigem confirmação.", icon: RotateCcw },
];

function permissionLabel(state: DevicePermissionState) {
  if (state === "granted") return "Permitido";
  if (state === "denied") return "Bloqueado pelo dispositivo";
  if (state === "prompt") return "Ainda não solicitado";
  if (state === "unsupported") return "Não disponível";
  return "Status não identificado";
}

function ToggleRow({ definition, enabled, onChange }: {
  definition: ToggleDefinition;
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const Icon = definition.icon;
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-background p-3">
      <span className="mt-0.5 rounded-lg bg-muted p-2 text-muted-foreground"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{definition.title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{definition.description}</span>
      </span>
      <input
        type="checkbox"
        className="mt-2 h-4 w-4 accent-primary"
        checked={enabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={definition.title}
      />
    </label>
  );
}

export function JarvisPermissionsCenter() {
  const [permissions, setPermissions] = useState<JarvisPermissions>(() => loadJarvisPermissions());
  const [microphoneState, setMicrophoneState] = useState<DevicePermissionState>("unknown");
  const [notificationState, setNotificationState] = useState<DevicePermissionState>(() => getNotificationPermissionState());
  const [requestingMic, setRequestingMic] = useState(false);
  const [requestingNotifications, setRequestingNotifications] = useState(false);

  useEffect(() => {
    void getMicrophonePermissionState().then(setMicrophoneState);
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<JarvisPermissions>).detail;
      setPermissions(detail ?? loadJarvisPermissions());
    };
    window.addEventListener(JARVIS_PERMISSIONS_EVENT, sync);
    return () => window.removeEventListener(JARVIS_PERMISSIONS_EVENT, sync);
  }, []);

  const activeCount = useMemo(() => {
    const keys = Object.keys(permissions) as Array<keyof JarvisPermissions>;
    return keys.filter((key) => permissions[key] === true).length;
  }, [permissions]);

  const persist = (next: JarvisPermissions) => {
    const safe = { ...next, alwaysConfirmSensitiveActions: true } as JarvisPermissions;
    setPermissions(safe);
    saveJarvisPermissions(safe);
  };

  const toggle = (key: ToggleKey, enabled: boolean) => persist({ ...permissions, [key]: enabled });

  const enableMicrophone = async () => {
    if (requestingMic) return;
    setRequestingMic(true);
    try {
      const state = await requestMicrophonePermission();
      setMicrophoneState(state);
      persist({ ...permissions, microphone: state === "granted" });
    } finally {
      setRequestingMic(false);
    }
  };

  const enableNotifications = async () => {
    if (requestingNotifications) return;
    setRequestingNotifications(true);
    try {
      const state = await requestNotificationPermission();
      setNotificationState(state);
      persist({ ...permissions, notifications: state === "granted" });
    } finally {
      setRequestingNotifications(false);
    }
  };

  const applyRecommended = () => {
    persist({
      ...RECOMMENDED_JARVIS_PERMISSIONS,
      microphone: microphoneState === "granted",
      notifications: notificationState === "granted",
    });
  };

  const reset = () => persist({ ...DEFAULT_JARVIS_PERMISSIONS });

  return (
    <section className="mx-auto mb-5 w-full max-w-7xl px-4 sm:px-6" aria-label="Centro de Permissões do JARVIS">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <h2 className="text-base font-semibold">JARVIS — Permissões e autonomia</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                Uma única central para definir o que o JARVIS pode ouvir, falar, observar e executar. Permissões do dispositivo e autorização do VendorAI continuam sendo verificadas separadamente.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={applyRecommended} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
              Configuração recomendada
            </button>
            <button type="button" onClick={reset} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold">
              Restaurar padrão
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Dispositivo e voz</h3>
              <p className="text-xs text-muted-foreground">O sistema operacional sempre tem a palavra final sobre microfone e notificações.</p>
            </div>

            <div className="rounded-xl border border-border/70 p-3">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-muted p-2"><Mic className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <strong className="text-sm">Microfone</strong>
                  <div className="mt-0.5 text-xs text-muted-foreground">{permissionLabel(microphoneState)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">Necessário para conversa por voz. A solicitação só acontece quando você toca no botão ao lado.</p>
                </div>
                <button
                  type="button"
                  disabled={requestingMic || microphoneState === "granted"}
                  onClick={() => void enableMicrophone()}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {microphoneState === "granted" ? "Permitido" : requestingMic ? "Solicitando..." : "Permitir"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 p-3">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-muted p-2"><BellRing className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <strong className="text-sm">Notificações do dispositivo</strong>
                  <div className="mt-0.5 text-xs text-muted-foreground">{permissionLabel(notificationState)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">Para alertas fora do painel quando a plataforma e o sistema operacional suportarem.</p>
                </div>
                <button
                  type="button"
                  disabled={requestingNotifications || notificationState === "granted" || notificationState === "unsupported"}
                  onClick={() => void enableNotifications()}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {notificationState === "granted" ? "Permitido" : requestingNotifications ? "Solicitando..." : "Permitir"}
                </button>
              </div>
            </div>

            {EXPERIENCE_PERMISSIONS.map((definition) => (
              <ToggleRow
                key={definition.key}
                definition={definition}
                enabled={permissions[definition.key]}
                onChange={(enabled) => toggle(definition.key, enabled)}
              />
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Execução e governança</h3>
              <p className="text-xs text-muted-foreground">Essas preferências nunca substituem permissões de usuário, tenant, agente ou validações do backend.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">N1 · Livre</div>
                <div className="mt-1 text-sm font-semibold">Consultar</div>
                <div className="mt-1 text-xs text-muted-foreground">Buscar, analisar, abrir, filtrar e recomendar.</div>
              </div>
              <div className="rounded-xl border border-border/70 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">N2 · Operacional</div>
                <div className="mt-1 text-sm font-semibold">Conforme autonomia</div>
                <div className="mt-1 text-xs text-muted-foreground">Segue manual, assistido ou autônomo configurado para cada agente.</div>
              </div>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-primary">N3 · Sensível</div>
                <div className="mt-1 text-sm font-semibold">Sempre confirmar</div>
                <div className="mt-1 text-xs text-muted-foreground">Envio, publicação, orçamento, desconto, fechamento e alterações críticas.</div>
              </div>
            </div>

            {OPERATIONAL_PERMISSIONS.map((definition) => (
              <ToggleRow
                key={definition.key}
                definition={definition}
                enabled={permissions[definition.key]}
                onChange={(enabled) => toggle(definition.key, enabled)}
              />
            ))}

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <strong className="text-sm">Proteção obrigatória de ações sensíveis</strong>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Esta proteção não pode ser desligada nesta tela. Ações N3 continuam exigindo confirmação explícita, mesmo quando um agente estiver em modo autônomo.
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              </div>
            </div>

            <div className="rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Resumo:</strong> {activeCount} permissões/preferências ativas. Wake word em segundo plano depende do app nativo e das regras do Android/iOS; a versão web não promete escuta permanente com a página fechada.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
