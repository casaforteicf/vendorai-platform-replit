import { Feather } from "@expo/vector-icons";
import {
  useAnalyzeLeadIntelligence,
  useGetLead,
  useGetOrCreateLeadIntelligence,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChurnBadge } from "@/components/ChurnBadge";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: "message-circle",
  instagram: "instagram",
  email: "mail",
  web: "globe",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[sectionStyles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[sectionStyles.title, { color: colors.mutedForeground }]}>{title}</Text>
      {children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  title: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
});

export default function LeadDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const { data: lead, isLoading: loadingLead } = useGetLead(id ?? "", {
    query: { enabled: !!id },
  });

  const { data: ci, isLoading: loadingCI, refetch: refetchCI } = useGetOrCreateLeadIntelligence(
    id ?? "",
    { query: { enabled: !!id } }
  );

  const analyzeMutation = useAnalyzeLeadIntelligence();
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (analyzing || analyzeMutation.isPending) return;
    setAnalyzing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await analyzeMutation.mutateAsync({ tenantId, leadId: id ?? "" });
      await refetchCI();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Análise concluída", `Risco de churn: ${ci?.churnRisk ?? 0}%`);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = e?.message ?? "Falha na análise. Tente novamente.";
      Alert.alert("Erro", msg);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loadingLead) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!lead) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Lead não encontrado</Text>
      </View>
    );
  }

  const churnRisk = (ci as any)?.churnRisk ?? null;
  const journeyStage = (ci as any)?.journeyStage;
  const nextBestAction = (ci as any)?.nextBestAction;
  const opportunities = (ci as any)?.opportunities ?? [];
  const churnReasons = (ci as any)?.churnReasons ?? [];
  const lastAnalyzedAt = (ci as any)?.lastAnalyzedAt;
  const canal = (lead as any).canal ?? "web";
  const channelIcon = CHANNEL_ICON[canal] ?? "user";

  const initials = (lead as any).name
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
          <Text style={[styles.initials, { color: colors.primary }]}>{initials}</Text>
        </View>
        <View style={styles.heroInfo}>
          <Text style={[styles.heroName, { color: colors.foreground }]}>{(lead as any).name}</Text>
          {(lead as any).empresa ? (
            <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>{(lead as any).empresa}</Text>
          ) : null}
          <View style={styles.heroMeta}>
            <View style={[styles.channelBadge, { backgroundColor: colors.secondary }]}>
              <Feather name={channelIcon as any} size={12} color={colors.mutedForeground} />
              <Text style={[styles.channelText, { color: colors.mutedForeground }]}>{canal}</Text>
            </View>
            {churnRisk !== null ? <ChurnBadge risk={churnRisk} size="sm" /> : null}
          </View>
        </View>
      </View>

      {/* Contact info */}
      <Section title="Contato">
        {(lead as any).email ? (
          <View style={styles.infoRow}>
            <Feather name="mail" size={14} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.foreground }]}>{(lead as any).email}</Text>
          </View>
        ) : null}
        {(lead as any).phone ? (
          <View style={styles.infoRow}>
            <Feather name="phone" size={14} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.foreground }]}>{(lead as any).phone}</Text>
          </View>
        ) : null}
        {!(lead as any).email && !(lead as any).phone ? (
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>Sem informações de contato</Text>
        ) : null}
      </Section>

      {/* Customer Intelligence */}
      <View style={[styles.ciCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.ciHeader}>
          <View style={styles.ciTitleRow}>
            <Feather name="cpu" size={16} color={colors.primary} />
            <Text style={[styles.ciTitle, { color: colors.foreground }]}>Customer Intelligence</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.analyzeBtn,
              { backgroundColor: colors.primary },
              analyzing && { opacity: 0.7 },
            ]}
            onPress={handleAnalyze}
            disabled={analyzing}
            activeOpacity={0.8}
          >
            {analyzing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="zap" size={14} color="#fff" />
                <Text style={styles.analyzeBtnText}>Analisar com IA</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {lastAnalyzedAt ? (
          <Text style={[styles.lastAnalyzed, { color: colors.mutedForeground }]}>
            Última análise: {new Date(lastAnalyzedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </Text>
        ) : null}

        {loadingCI ? (
          <ActivityIndicator color={colors.primary} />
        ) : ci ? (
          <View style={styles.ciContent}>
            {churnRisk !== null ? (
              <View style={styles.riskBar}>
                <View style={styles.riskBarLabels}>
                  <Text style={[styles.riskBarLabel, { color: colors.mutedForeground }]}>Risco de Churn</Text>
                  <Text style={[styles.riskBarValue, { color: churnRisk >= 70 ? "#ef4444" : churnRisk >= 40 ? "#f59e0b" : "#22c55e" }]}>
                    {churnRisk}%
                  </Text>
                </View>
                <View style={[styles.riskTrack, { backgroundColor: colors.secondary }]}>
                  <View
                    style={[
                      styles.riskFill,
                      {
                        width: `${churnRisk}%`,
                        backgroundColor: churnRisk >= 70 ? "#ef4444" : churnRisk >= 40 ? "#f59e0b" : "#22c55e",
                      },
                    ]}
                  />
                </View>
              </View>
            ) : null}

            {journeyStage ? (
              <View style={styles.ciRow}>
                <Text style={[styles.ciLabel, { color: colors.mutedForeground }]}>Estágio</Text>
                <View style={[styles.stageBadge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.stageText, { color: colors.accentForeground }]}>{journeyStage}</Text>
                </View>
              </View>
            ) : null}

            {nextBestAction ? (
              <View style={styles.ciBlock}>
                <Text style={[styles.ciLabel, { color: colors.mutedForeground }]}>Próxima Ação</Text>
                <View style={[styles.actionBox, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "33" }]}>
                  <Feather name="arrow-right-circle" size={14} color={colors.primary} />
                  <Text style={[styles.actionText, { color: colors.foreground }]}>{nextBestAction}</Text>
                </View>
              </View>
            ) : null}

            {churnReasons.length > 0 ? (
              <View style={styles.ciBlock}>
                <Text style={[styles.ciLabel, { color: colors.mutedForeground }]}>Motivos de Churn</Text>
                {churnReasons.map((r: any, i: number) => (
                  <View key={i} style={styles.listItem}>
                    <View style={[styles.bullet, { backgroundColor: "#ef4444" }]} />
                    <Text style={[styles.listText, { color: colors.foreground }]}>
                      {typeof r === "string" ? r : r.reason ?? r.text ?? JSON.stringify(r)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {opportunities.length > 0 ? (
              <View style={styles.ciBlock}>
                <Text style={[styles.ciLabel, { color: colors.mutedForeground }]}>Oportunidades</Text>
                {opportunities.map((o: any, i: number) => (
                  <View key={i} style={styles.listItem}>
                    <View style={[styles.bullet, { backgroundColor: "#22c55e" }]} />
                    <Text style={[styles.listText, { color: colors.foreground }]}>
                      {typeof o === "string" ? o : o.opportunity ?? o.text ?? JSON.stringify(o)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.noCI, { color: colors.mutedForeground }]}>
            Clique em "Analisar com IA" para gerar inteligência sobre este lead.
          </Text>
        )}
      </View>

      {/* Quick action: go to conversations */}
      <TouchableOpacity
        style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push("/(tabs)/conversations")}
        activeOpacity={0.7}
      >
        <Feather name="message-circle" size={18} color={colors.primary} />
        <Text style={[styles.actionRowText, { color: colors.foreground }]}>Ver Conversas</Text>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 14, borderWidth: 1, gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  initials: { fontSize: 22, fontFamily: "Inter_700Bold" },
  heroInfo: { flex: 1, gap: 6 },
  heroName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  heroSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  channelBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  channelText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  ciCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 14 },
  ciHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ciTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ciTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  analyzeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  analyzeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  lastAnalyzed: { fontSize: 11, fontFamily: "Inter_400Regular" },
  ciContent: { gap: 14 },
  riskBar: { gap: 6 },
  riskBarLabels: { flexDirection: "row", justifyContent: "space-between" },
  riskBarLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  riskBarValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  riskTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  riskFill: { height: 8, borderRadius: 4 },
  ciRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ciLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  stageBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  stageText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  ciBlock: { gap: 8 },
  actionBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1 },
  actionText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  listItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  listText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  noCI: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 12 },
  actionRow: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 14, borderWidth: 1, gap: 12 },
  actionRowText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
});
