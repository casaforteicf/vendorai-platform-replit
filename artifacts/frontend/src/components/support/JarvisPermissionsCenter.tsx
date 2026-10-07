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
    <section className="mx-auto mb-5 w-full max-w-7xl px-4 sm:px-6" aria-label="Centro de Permissões do JARVIS">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary"><ShieldCheck className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">JARVIS — Permissões e autonomia</h2>
              <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                Defina o que o JARVIS pode ouvir, falar, observar e executar. Permissões do dispositivo e autorizações do VendorAI continuam protegidas separadamente.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={applyRecommended} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
              Usar recomendado
            </button>
            <button type="button" onClick={reset} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold">
              Restaurar padrão
            </button>
          </div>
        </div>

        <div className="space-y-5 p-4">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold">Dispositivo</h3>
                <p className="text-xs text-muted-foreground">Microfone e notificações dependem também das permissões do navegador e do sistema operacional.</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-background p-3">
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-muted p-2"><Mic className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <strong className="text-sm">Microfone</strong>
                      <div className="mt-0.5 text-xs text-muted-foreground">{permissionLabel(microphoneState)}</div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Necessário para conversa por voz.</p>
                    </div>
                    <button
                      type="button"
                      disabled={requestingMic || microphoneState === "granted"}
                      onClick={() => void enableMicrophone()}
                      className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      {microphoneState === "granted" ? "Permitido" : requestingMic ? "Solicitando..." : "Permitir"}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-background p-3">
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-muted p-2"><BellRing className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <strong className="text-sm">Notificações</strong>
                      <div className="mt-0.5 text-xs text-muted-foreground">{permissionLabel(notificationState)}</div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Usadas para alertas fora do painel.</p>
                    </div>
                    <button
                      type="button"
                      disabled={requestingNotifications || notificationState === "granted" || notificationState === "unsupported"}
                      onClick={() => void enableNotifications()}
                      className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      {notificationState === "granted" ? "Permitido" : requestingNotifications ? "Solicitando..." : "Permitir"}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold">Níveis de autonomia</h3>
                <p className="text-xs text-muted-foreground">A autonomia nunca substitui permissões de usuário, tenant, agente ou validações do backend.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-background p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">N1 · Livre</div>
                  <div className="mt-1 text-sm font-semibold">Consultar</div>
                  <div className="mt-1 text-xs text-muted-foreground">Buscar, analisar, abrir, filtrar e recomendar.</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-background p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">N2 · Operacional</div>
                  <div className="mt-1 text-sm font-semibold">Conforme autonomia</div>
                  <div className="mt-1 text-xs text-muted-foreground">Segue a autonomia configurada para cada agente.</div>
                </div>
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-primary">N3 · Sensível</div>
                  <div className="mt-1 text-sm font-semibold">Sempre confirmar</div>
                  <div className="mt-1 text-xs text-muted-foreground">Envio, publicação, orçamento, desconto e ações críticas.</div>
                </div>
              </div>
            </section>
          </div>

          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">Experiência e contexto</h3>
              <p className="text-xs text-muted-foreground">Recursos usados pelo JARVIS durante a conversa e o acompanhamento do usuário.</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {EXPERIENCE_PERMISSIONS.map((definition) => (
                <ToggleRow
                  key={definition.key}
                  definition={definition}
                  enabled={permissions[definition.key]}
                  onChange={(enabled) => toggle(definition.key, enabled)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">Execução operacional</h3>
              <p className="text-xs text-muted-foreground">Permissões para preparar ou alterar dados quando houver autorização válida.</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {OPERATIONAL_PERMISSIONS.map((definition) => (
                <ToggleRow
                  key={definition.key}
                  definition={definition}
                  enabled={permissions[definition.key]}
                  onChange={(enabled) => toggle(definition.key, enabled)}
                />
              ))}
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-stretch">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <strong className="text-sm">Proteção obrigatória de ações sensíveis</strong>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Ações N3 continuam exigindo confirmação explícita, inclusive com agente em modo autônomo.
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              </div>
            </div>

            <div className="flex items-center rounded-xl bg-muted/30 px-4 py-3 text-xs text-muted-foreground lg:max-w-sm">
              <span><strong className="text-foreground">Resumo:</strong> {activeCount} permissões/preferências ativas. Wake word em segundo plano depende do app nativo; na web não há escuta permanente com a página fechada.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
