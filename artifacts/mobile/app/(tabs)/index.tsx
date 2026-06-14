import { Feather } from "@expo/vector-icons";
import {
  useGetTenantDashboard,
  useListLeads,
} from "@workspace/api-client-react";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChurnBadge } from "@/components/ChurnBadge";
import { KPICard } from "@/components/KPICard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const { data: dashboard, isLoading: loadingDash, refetch: refetchDash } =
    useGetTenantDashboard(tenantId, { query: { enabled: !!tenantId } });

  const { data: leads, isLoading: loadingLeads, refetch: refetchLeads } =
    useListLeads({ query: { enabled: !!tenantId } });

  const isLoading = loadingDash || loadingLeads;
  const highRiskLeads = (leads ?? [])
    .filter((l: any) => (l.churnRisk ?? 0) >= 70)
    .sort((a: any, b: any) => (b.churnRisk ?? 0) - (a.churnRisk ?? 0))
    .slice(0, 5);

  const topPadding = Platform.OS === "web" ? 67 : insets.top + 8;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPadding, paddingBottom: insets.bottom + 100 }]}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => { refetchDash(); refetchLeads(); }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.titleRow}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            Bom dia, {user?.name?.split(" ")[0] ?? ""}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Dashboard</Text>
        </View>
        <View style={[styles.avatarWrap, { backgroundColor: colors.primary + "22" }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {user?.name?.charAt(0).toUpperCase() ?? "?"}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiRow}>
              <KPICard
                label="Total Leads"
                value={(dashboard as any)?.totalLeads ?? (leads?.length ?? 0)}
                icon="users"
                color={colors.primary}
              />
              <KPICard
                label="Alto Risco"
                value={(dashboard as any)?.leadsAltoRisco ?? highRiskLeads.length}
                icon="alert-triangle"
                color="#ef4444"
              />
            </View>
            <View style={styles.kpiRow}>
              <KPICard
                label="Pipeline Ativo"
                value={(dashboard as any)?.dealsAtivos ?? "—"}
                icon="trending-up"
                color="#22c55e"
              />
              <KPICard
                label="Agend. Hoje"
                value={(dashboard as any)?.agendamentosHoje ?? "—"}
                icon="calendar"
                color="#f59e0b"
              />
            </View>
          </View>

          {highRiskLeads.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Feather name="alert-triangle" size={15} color="#ef4444" />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Leads em Risco
                </Text>
              </View>
              {highRiskLeads.map((lead: any) => (
                <TouchableOpacity
                  key={lead.id}
                  style={[styles.riskRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push(`/leads/${lead.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.riskAvatar, { backgroundColor: "#ef444422" }]}>
                    <Text style={styles.riskInitials}>
                      {lead.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.riskInfo}>
                    <Text style={[styles.riskName, { color: colors.foreground }]} numberOfLines={1}>
                      {lead.name}
                    </Text>
                    {lead.empresa ? (
                      <Text style={[styles.riskSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {lead.empresa}
                      </Text>
                    ) : null}
                  </View>
                  <ChurnBadge risk={lead.churnRisk ?? 0} size="sm" />
                  <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 24 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  avatarWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  kpiGrid: { gap: 10 },
  kpiRow: { flexDirection: "row", gap: 10 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  riskRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  riskAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  riskInitials: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#ef4444" },
  riskInfo: { flex: 1 },
  riskName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  riskSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
