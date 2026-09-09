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
type Message = { role: "user" | "assistant"; content: string };

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

const QUICK_COMMANDS = [
  "Como está o comercial hoje?",
  "Quais leads precisam de atenção?",
  "O que mudou desde ontem?",
  "Qual é a próxima melhor ação?",
];

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function compactForSpeech(text: string) {
  const cleaned = text
    .replace(/[#*_`>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 420) return cleaned;
  const firstSentences = cleaned.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ");
  return `${firstSentences || cleaned.slice(0, 380)} Quer que eu detalhe?`;
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
    return {
      display,
      spoken: `Tenho ${urgent.length === 1 ? "um ponto" : `${urgent.length} pontos`} que merecem sua atenção agora. O principal é ${visible[0]?.title ?? "uma prioridade do negócio"}.`,
    };
  }

  if (briefing.length) {
    const visible = briefing.slice(0, 5);
    return {
      display: [
        "Não encontrei nada que justifique interromper você agora.",
        `Tenho ${briefing.length === 1 ? "1 ponto" : `${briefing.length} pontos`} para o próximo briefing:`,
        ...visible.map((item, index) => `${index + 1}. ${item.title} — prioridade ${item.priorityScore}/100.`),
      ].join("\n"),
      spoken: `Não há nada urgente agora. O principal ponto do briefing é ${visible[0]?.title ?? "uma prioridade do negócio"}.`,
    };
  }

  return {
    display: "Não encontrei nenhuma prioridade urgente. Continuo acompanhando os sinais do negócio.",
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
  const [handsFree, setHandsFree] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const sendingRef = useRef(false);
  const proactiveHandledRef = useRef(false);
  const handsFreeRef = useRef(true);
  const openedByWakeWord = params.wake === "1";
  const conversationId = useMemo(
    () => `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    [],
  );

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  const stopVoice = useCallback(() => {
    Speech.stop();
    ExpoSpeechRecognitionModule.abort();
    setVoiceState("idle");
  }, []);

  const startListening = useCallback(async () => {
    if (sendingRef.current) return;
    Speech.stop();

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

  const speak = useCallback((text: string, continueListening = handsFreeRef.current) => {
    Speech.stop();
    const spokenText = compactForSpeech(text);
    setVoiceState("speaking");
    Speech.speak(spokenText, {
      language: "pt-BR",
      rate: 0.98,
      pitch: 0.96,
      onDone: () => {
        setVoiceState("idle");
        if (continueListening && handsFreeRef.current) {
          setTimeout(() => void startListening(), 300);
        }
      },
      onError: () => {
        setVoiceState("idle");
        if (continueListening && handsFreeRef.current) {
          setTimeout(() => void startListening(), 300);
        }
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
    const nextMessages: Message[] = [...messages, { role: "user", content: command }].slice(-12);
    setMessages(nextMessages);

    try {
      const response = await expoFetch(`${API_BASE}/api/support/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: nextMessages,
          conversationId,
          context: {
            route: "/jarvis",
            title: "JARVIS Mobile",
            source: "android_voice",
            wakeWord: openedByWakeWord,
            handsFree: handsFreeRef.current,
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
            // O buffer preserva chunks SSE incompletos.
          }
        }
      }

      const finalAnswer = fullAnswer.trim() || "Concluí a análise, mas não recebi uma resposta em texto.";
      setAnswer(finalAnswer);
      setMessages((current) => [...current, { role: "assistant", content: finalAnswer }].slice(-12));

      if (pendingClientAction) {
        speak(finalAnswer, false);
        setTimeout(() => void openClientAction(pendingClientAction!), 650);
      } else {
        speak(finalAnswer, handsFreeRef.current);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não consegui falar com o JARVIS.";
      setVoiceState("error");
      setAnswer(message);
      speak(message, false);
    } finally {
      sendingRef.current = false;
    }
  }, [conversationId, messages, openedByWakeWord, openClientAction, speak, token]);

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
      if (handsFreeRef.current) {
        setAnswer("Continuo aqui. Pode falar quando quiser.");
        setTimeout(() => void startListening(), 700);
      } else {
        setAnswer("Não ouvi um comando. Toque no microfone para tentar novamente.");
      }
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
    setHandsFree(true);
    setAnswer("Voz habilitada. Pode falar normalmente comigo.");
    speak("Voz habilitada. Pode falar normalmente comigo.", true);
  }, [speak]);

  const toggleHandsFree = useCallback(() => {
    setHandsFree((current) => {
      const next = !current;
      if (!next) {
        ExpoSpeechRecognitionModule.abort();
        setVoiceState("idle");
      } else if (enabled && voiceState === "idle") {
        setTimeout(() => void startListening(), 250);
      }
      return next;
    });
  }, [enabled, startListening, voiceState]);

  const handleOrbPress = useCallback(() => {
    if (voiceState === "speaking") {
      Speech.stop();
      setVoiceState("idle");
      void startListening();
      return;
    }
    if (voiceState === "listening") {
      ExpoSpeechRecognitionModule.stop();
      setVoiceState("idle");
      return;
    }
    if (voiceState !== "thinking") void startListening();
  }, [startListening, voiceState]);

  useEffect(() => {
    if (isLoading || proactiveHandledRef.current) return;
    if (!token || !user) {
      if (openedByWakeWord) router.replace("/login");
      return;
    }

    proactiveHandledRef.current = true;
    setEnabled(true);
    setHandsFree(true);

    const loadOpening = async () => {
      try {
        const response = await expoFetch(`${API_BASE}/api/jarvis/proactivity`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Falha ao carregar prioridades");
        const data = await response.json() as ProactivityResponse;
        const opening = buildMobileProactiveOpening(data);
        setAnswer(opening.display);
        const prefix = openedByWakeWord ? "Estou aqui. " : "";
        speak(`${prefix}${opening.spoken}`, openedByWakeWord);
      } catch {
        if (openedByWakeWord) {
          setAnswer("Ativado pela palavra de chamada. Estou ouvindo.");
          speak("Estou aqui. Pode falar.", true);
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
    idle: enabled ? (handsFree ? "Pronto para conversar" : "Voz pronta") : "Microfone não habilitado",
    listening: "Ouvindo você...",
    thinking: "Entendendo e executando...",
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
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Assistente de voz do VendorAI</Text>
        </View>
        <TouchableOpacity
          onPress={toggleHandsFree}
          style={[styles.modeButton, { borderColor: colors.border, backgroundColor: handsFree ? colors.primary + "14" : colors.card }]}
        >
          <Feather name={handsFree ? "radio" : "mic"} size={15} color={handsFree ? colors.primary : colors.mutedForeground} />
          <Text style={[styles.modeText, { color: handsFree ? colors.primary : colors.mutedForeground }]}>Mãos livres</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={voiceState === "listening" ? "Parar de ouvir" : "Falar com JARVIS"}
            onPress={handleOrbPress}
            style={[
              styles.orb,
              {
                backgroundColor: voiceState === "listening" || voiceState === "speaking"
                  ? colors.primary
                  : colors.primary + "18",
              },
            ]}
          >
            {voiceState === "thinking" ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Feather
                name={voiceState === "speaking" ? "volume-2" : "mic"}
                size={34}
                color={voiceState === "listening" || voiceState === "speaking" ? "#fff" : colors.primary}
              />
            )}
          </TouchableOpacity>
          <Text style={[styles.state, { color: colors.foreground }]}>{stateLabel[voiceState]}</Text>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            {handsFree
              ? "Conversa contínua: fale, receba a resposta e continue falando sem tocar em Enviar."
              : "Toque no microfone para falar. Você também pode interromper a resposta tocando no círculo."}
          </Text>
          {openedByWakeWord ? (
            <View style={[styles.wakeBadge, { backgroundColor: colors.primary + "14" }]}> 
              <Feather name="radio" size={13} color={colors.primary} />
              <Text style={[styles.wakeText, { color: colors.primary }]}>Ativado por “Jarvis”</Text>
            </View>
          ) : null}
        </View>

        {transcript ? (
          <View style={[styles.message, styles.userMessage, { backgroundColor: colors.primary + "12" }]}> 
            <Text style={[styles.messageLabel, { color: colors.primary }]}>Você</Text>
            <Text style={[styles.messageText, { color: colors.foreground }]}>{transcript}</Text>
          </View>
        ) : null}

        <View style={[styles.message, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}> 
          <Text style={[styles.messageLabel, { color: colors.primary }]}>JARVIS</Text>
          <Text style={[styles.messageText, { color: colors.foreground }]}>{answer}</Text>
        </View>

        <View style={styles.quickSection}>
          <Text style={[styles.quickTitle, { color: colors.mutedForeground }]}>Você pode simplesmente dizer:</Text>
          <View style={styles.quickGrid}>
            {QUICK_COMMANDS.map((command) => (
              <TouchableOpacity
                key={command}
                style={[styles.quickChip, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => void sendToJarvis(command)}
                disabled={voiceState === "thinking"}
              >
                <Text style={[styles.quickChipText, { color: colors.foreground }]}>{command}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {!enabled ? (
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => void enableVoice()}>
            <Feather name="mic" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Habilitar voz do JARVIS</Text>
          </TouchableOpacity>
        ) : voiceState === "thinking" ? (
          <View style={[styles.primaryButton, { backgroundColor: colors.primary + "20" }]}> 
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.primaryButtonText, { color: colors.primary }]}>JARVIS está trabalhando</Text>
          </View>
        ) : (
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleOrbPress}>
            <Feather name={voiceState === "listening" ? "square" : "mic"} size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>{voiceState === "listening" ? "Parar escuta" : "Falar agora"}</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.privacy, { color: colors.mutedForeground }]}>A palavra de ativação é processada no aparelho quando o wake word está disponível. Comandos e ações seguem autenticação, permissões do tenant e confirmação para operações sensíveis.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  modeButton: { minHeight: 36, borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  modeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 14 },
  statusCard: { alignItems: "center", borderWidth: 1, borderRadius: 24, padding: 22, gap: 10 },
  orb: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center" },
  state: { fontSize: 19, fontFamily: "Inter_700Bold" },
  hint: { textAlign: "center", fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  wakeBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  wakeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  message: { borderRadius: 16, padding: 16, gap: 6 },
  userMessage: { marginLeft: 28 },
  messageLabel: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  messageText: { fontSize: 15, lineHeight: 22, fontFamily: "Inter_400Regular" },
  quickSection: { gap: 8 },
  quickTitle: { fontSize: 12, fontFamily: "Inter_500Medium" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  quickChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  primaryButton: { minHeight: 54, borderRadius: 16, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryButtonText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  privacy: { fontSize: 11, lineHeight: 17, textAlign: "center", fontFamily: "Inter_400Regular" },
});