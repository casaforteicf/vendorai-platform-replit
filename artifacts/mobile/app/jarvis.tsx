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
  const wakeHandledRef = useRef(false);
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
            wakeWord: params.wake === "1",
          },
        }),
      });

      if (!response.ok || !response.body) throw new Error("Falha na conexão com o JARVIS");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as { content?: string; error?: string };
            if (payload.content) {
              fullAnswer += payload.content;
              setAnswer(fullAnswer);
            }
            if (payload.error) throw new Error(payload.error);
          } catch {
            // Ignora chunks SSE incompletos; o buffer preserva a próxima parte.
          }
        }
      }

      const spoken = fullAnswer.trim() || "Concluí a análise, mas não recebi uma resposta em texto.";
      setAnswer(spoken);
      speak(spoken, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não consegui falar com o JARVIS.";
      setVoiceState("error");
      setAnswer(message);
      speak(message, false);
    } finally {
      sendingRef.current = false;
    }
  }, [conversationId, params.wake, speak, token]);

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

  const enableWakeWord = useCallback(async () => {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setVoiceState("error");
      setAnswer("Permissão de microfone não concedida.");
      return;
    }
    setEnabled(true);
    setAnswer("Ativação por voz habilitada. Você pode fechar a interface e dizer “Jarvis”.");
    speak("Ativação por voz habilitada. Pode me chamar dizendo Jarvis.", false);
  }, [speak]);

  useEffect(() => {
    if (isLoading || wakeHandledRef.current || params.wake !== "1") return;
    wakeHandledRef.current = true;
    if (!token || !user) {
      router.replace("/login");
      return;
    }
    setEnabled(true);
    setAnswer("Ativado por voz.");
    speak("Bom dia. Estou ouvindo.", true);
  }, [isLoading, params.wake, speak, token, user]);

  useEffect(() => () => {
    Speech.stop();
    ExpoSpeechRecognitionModule.abort();
  }, []);

  const stateLabel: Record<VoiceState, string> = {
    idle: enabled ? "Jarvis ativo" : "Ativação desligada",
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
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Diga “Jarvis” com o app em segundo plano para abrir esta sessão.</Text>
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
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => void enableWakeWord()}>
            <Feather name="power" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Ativar “Jarvis” em segundo plano</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={() => void startListening()}
            disabled={voiceState === "thinking" || voiceState === "speaking"}
          >
            <Feather name="mic" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Falar com o Jarvis</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.privacy, { color: colors.mutedForeground }]}>A escuta de fundo processa somente a palavra de ativação no aparelho. O comando seguinte é enviado ao VendorAI autenticado para execução conforme suas permissões e níveis de autonomia.</Text>
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
