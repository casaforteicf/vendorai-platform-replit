import { Feather } from "@expo/vector-icons";
import { fetch as expoFetch } from "expo/fetch";
import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? "https://appvendorai.com").replace(/\/$/, "");

type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";

type ClientAction = {
  type: "open_external_url";
  provider?: string;
  uri?: string;
  fallbackUrl: string;
  label?: string;
};

type ProactiveItem = {
  id: string;
  title: string;
  priorityScore: number;
  recommendedAction: string | null;
  explicitFinancialImpact?: { amount: number } | null;
  historicalFinancialEstimate?: {
    medianAmount: number;
    sampleSize: number;
    confidence: number;
  } | null;
};

type ProactivityResponse = {
  proactivity: {
    interruptNow: ProactiveItem[];
    briefing: ProactiveItem[];
    silentCount: number;
  };
};

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildMobileProactiveOpening(data: ProactivityResponse) {
  const urgent = data.proactivity.interruptNow ?? [];
  const briefing = data.proactivity.briefing ?? [];

  if (urgent.length) {
    const visible = urgent.slice(0, 3);
    const display = [
      `Tenho ${urgent.length === 1 ? "1 ponto que merece sua atenção agora" : `${urgent.length} pontos que merecem sua atenção agora`}.`,
      ...visible.map((item, index) => {
        const financial = item.explicitFinancialImpact?.amount != null
          ? ` Impacto atual informado: ${formatBrl(item.explicitFinancialImpact.amount)}.`
          : item.historicalFinancialEstimate
            ? ` Precedente histórico: mediana ${formatBrl(item.historicalFinancialEstimate.medianAmount)} em ${item.historicalFinancialEstimate.sampleSize} casos.`
            : "";
        return `${index + 1}. ${item.title} — prioridade ${item.priorityScore}/100.${financial}`;
      }),
    ].join("\n");
    const spoken = `Tenho ${urgent.length === 1 ? "um ponto" : `${urgent.length} pontos`} que merecem sua atenção agora. O principal é: ${visible[0]?.title ?? "uma prioridade do negócio"}. Posso detalhar ou ouvir seu comando.`;
    return { display, spoken };
  }

  if (briefing.length) {
    const visible = briefing.slice(0, 5);
    const display = [
      "Não encontrei nada que justifique interromper você agora.",
      `Tenho ${briefing.length === 1 ? "1 ponto" : `${briefing.length} pontos`} para o próximo briefing:`,
      ...visible.map((item, index) => `${index + 1}. ${item.title} — prioridade ${item.priorityScore}/100.`),
    ].join("\n");
    const spoken = `Não há nada urgente agora. Tenho ${briefing.length === 1 ? "um ponto" : `${briefing.length} pontos`} para o briefing. O principal é: ${visible[0]?.title ?? "uma prioridade do negócio"}.`;
    return { display, spoken };
  }

  return {
    display: "Não encontrei nenhuma prioridade que justifique interromper você agora. Continuo acompanhando os sinais do negócio.",
    spoken: "Não há nenhuma prioridade urgente agora. Continuo acompanhando o negócio.",
  };
}

export default function JarvisScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ wake?: string }>();
  const { token, user, isLoading } = useAuth();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("JARVIS pronto para conversar.");
  const [enabled, setEnabled] = useState(false);
  const sendingRef = useRef(false);
  const proactiveHandledRef = useRef(false);
  const openedByWakeWord = params.wake === "1";
  const conversationId = useMemo(
    () => `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    [],
  );

  const startListening = useCallback(async () => {
    if (sendingRef.current) return;
    const permission = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (!permission.granted) {
      const requested = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!requested.granted) {
        setVoiceState("error");
        setAnswer("Preciso da permissão de microfone para conversar por voz.");
        return;
      }
    }
    setEnabled(true);
    setTranscript("");
    setVoiceState("listening");
    ExpoSpeechRecognitionModule.start({
      lang: "pt-BR",
      interimResults: true,
      continuous: false,
      maxAlternatives: 1,
    });
  }, []);

  const speak = useCallback((text: string, continueListening = false) => {
    Speech.stop();
    setVoiceState("speaking");
    Speech.speak(text, {
      language: "pt-BR",
      rate: 0.96,
      pitch: 0.96,
      onDone: () => {
        setVoiceState("idle");
        if (continueListening) setTimeout(() => void startListening(), 350);
      },
      onError: () => {
        setVoiceState("idle");
        if (continueListening) setTimeout(() => void startListening(), 350);
      },
    });
  }, [startListening]);

  const openClientAction = useCallback(async (action: ClientAction) => {
    try {
      if (action.uri) {
        const canOpenNative = await Linking.canOpenURL(action.uri).catch(() => false);
        if (canOpenNative) {
          await Linking.openURL(action.uri);
          return;
        }
      }
      await Linking.openURL(action.fallbackUrl);
    } catch {
      setVoiceState("error");
      setAnswer((current) => `${current}\n\nNão consegui abrir ${action.provider ?? "o serviço externo"} neste dispositivo.`);
    }
  }, []);

  const sendToJarvis = useCallback(async (text: string) => {
    const command = text.trim();
    if (!command || !token || sendingRef.current) return;
    sendingRef.current = true;
    setVoiceState("thinking");
    setAnswer("Analisando...");

    try {
      const response = await expoFetch(`${API_BASE}/api/support/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: command }],
          conversationId,
          context: {
            route: "/jarvis",
            title: "JARVIS Mobile",
            source: "android_voice",
            wakeWord: openedByWakeWord,
          },
        }),
      });

      if (!response.ok || !response.body) throw new Error("Falha na conexão com o JARVIS");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";
      let pendingClientAction: ClientAction | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              content?: string;
              done?: boolean;
              error?: string;
              clientAction?: ClientAction;
            };
            if (payload.content) {
              fullAnswer += payload.content;
              setAnswer(fullAnswer);
            }
            if (payload.done && payload.clientAction?.type === "open_external_url") {
              pendingClientAction = payload.clientAction;
            }
            if (payload.error) throw new Error(payload.error);
          } catch {
            // Ignora chunks SSE incompletos; o buffer preserva a próxima parte.
          }
        }
      }

      const spoken = fullAnswer.trim() || "Concluí a análise, mas não recebi uma resposta em texto.";
      setAnswer(spoken);
      if (pendingClientAction) {
        speak(spoken, false);
        setTimeout(() => void openClientAction(pendingClientAction!), 650);
      } else {
        speak(spoken, true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não consegui falar com o JARVIS.";
      setVoiceState("error");
      setAnswer(message);
      speak(message, false);
    } finally {
      sendingRef.current = false;
    }
  }, [conversationId, openedByWakeWord, openClientAction, speak, token]);

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript?.trim() ?? "";
    if (text) setTranscript(text);
    if (event.isFinal && text) {
      ExpoSpeechRecognitionModule.stop();
      void sendToJarvis(text);
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "no-speech" || event.error === "speech-timeout") {
      setVoiceState("idle");
      setAnswer("Não ouvi um comando. Toque no microfone para tentar novamente.");
      return;
    }
    setVoiceState("error");
    setAnswer(event.message || "Não consegui reconhecer sua voz.");
  });

  useSpeechRecognitionEvent("end", () => {
    if (!sendingRef.current && voiceState === "listening") setVoiceState("idle");
  });

  const enableVoice = useCallback(async () => {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setVoiceState("error");
      setAnswer("Permissão de microfone não concedida.");
      return;
    }
    setEnabled(true);
    setAnswer("Voz habilitada. Você já pode falar com o JARVIS pelo microfone.");
    speak("Voz habilitada. Estou pronto para conversar.", false);
  }, [speak]);

  useEffect(() => {
    if (isLoading || proactiveHandledRef.current) return;
    if (!token || !user) {
      if (openedByWakeWord) router.replace("/login");
      return;
    }

    proactiveHandledRef.current = true;
    setEnabled(true);

    const loadOpening = async () => {
      try {
        const response = await expoFetch(`${API_BASE}/api/jarvis/proactivity`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Falha ao carregar prioridades");
        const data = await response.json() as ProactivityResponse;
        const opening = buildMobileProactiveOpening(data);
        setAnswer(opening.display);
        const prefix = openedByWakeWord ? "Bom dia. " : "";
        speak(`${prefix}${opening.spoken}`, openedByWakeWord);
      } catch {
        if (openedByWakeWord) {
          setAnswer("Ativado pela palavra de chamada.");
          speak("Bom dia. Estou ouvindo.", true);
        }
      }
    };

    void loadOpening();
  }, [isLoading, openedByWakeWord, speak, token, user]);

  useEffect(() => () => {
    Speech.stop();
    ExpoSpeechRecognitionModule.abort();
  }, []);

  const stateLabel: Record<VoiceState, string> = {
    idle: enabled ? "Voz pronta" : "Microfone não habilitado",
    listening: "Ouvindo...",
    thinking: "Analisando...",
    speaking: "Respondendo...",
    error: "Atenção necessária",
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 24 : insets.top + 10 }]}> 
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>JARVIS</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Agente Mestre do VendorAI</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={[styles.orb, { backgroundColor: voiceState === "listening" ? colors.primary : colors.primary + "22" }]}> 
            {voiceState === "thinking" ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Feather name="mic" size={30} color={voiceState === "listening" ? "#fff" : colors.primary} />
            )}
          </View>
          <Text style={[styles.state, { color: colors.foreground }]}>{stateLabel[voiceState]}</Text>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            {openedByWakeWord
              ? "Sessão aberta pela palavra de ativação Jarvis."
              : "O microfone funciona neste APK. A ativação com o app em segundo plano depende do wake word configurado no build."}
          </Text>
        </View>

        {transcript ? (
          <View style={[styles.message, { backgroundColor: colors.primary + "14" }]}> 
            <Text style={[styles.messageLabel, { color: colors.primary }]}>Você</Text>
            <Text style={[styles.messageText, { color: colors.foreground }]}>{transcript}</Text>
          </View>
        ) : null}

        <View style={[styles.message, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}> 
          <Text style={[styles.messageLabel, { color: colors.primary }]}>JARVIS</Text>
          <Text style={[styles.messageText, { color: colors.foreground }]}>{answer}</Text>
        </View>

        {!enabled ? (
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => void enableVoice()}>
            <Feather name="mic" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Habilitar voz do JARVIS</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={() => void startListening()}
            disabled={voiceState === "thinking" || voiceState === "speaking"}
          >
            <Feather name="mic" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Falar com o JARVIS</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.privacy, { color: colors.mutedForeground }]}>Quando o wake word estiver configurado, a escuta de fundo processa somente a palavra de ativação no aparelho. O comando seguinte é enviado ao VendorAI autenticado para execução conforme suas permissões e níveis de autonomia.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  content: { padding: 20, gap: 16 },
  statusCard: { alignItems: "center", borderWidth: 1, borderRadius: 20, padding: 24, gap: 10 },
  orb: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  state: { fontSize: 18, fontFamily: "Inter_700Bold" },
  hint: { textAlign: "center", fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  message: { borderRadius: 16, padding: 16, gap: 6 },
  messageLabel: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  messageText: { fontSize: 15, lineHeight: 22, fontFamily: "Inter_400Regular" },
  primaryButton: { minHeight: 52, borderRadius: 14, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryButtonText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  privacy: { fontSize: 11, lineHeight: 17, textAlign: "center", fontFamily: "Inter_400Regular" },
});