import { Feather } from "@expo/vector-icons";
import { useListAgendamentos } from "@workspace/api-client-react";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const STATUS_COLOR: Record<string, string> = {
  pendente: "#f59e0b",
  confirmado: "#3b82f6",
  concluido: "#22c55e",
  cancelado: "#ef4444",
};

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function AgendaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const { data: agendamentos, isLoading, refetch } = useListAgendamentos(tenantId, undefined, {
    query: { queryKey: ["agendamentos", tenantId], enabled: !!tenantId },
  });

  const sorted = [...(agendamentos ?? [])].sort(
    (a: any, b: any) =>
      new Date(a.dataHoraInicio).getTime() - new Date(b.dataHoraInicio).getTime()
  );

  const upcoming = sorted.filter(
    (a: any) =>
      new Date(a.dataHoraInicio).getTime() >= Date.now() &&
      a.status !== "cancelado"
  );
  const todayItems = upcoming.filter((a: any) => isToday(a.dataHoraInicio));
  const futureItems = upcoming.filter((a: any) => !isToday(a.dataHoraInicio));

  const topPadding = Platform.OS === "web" ? 67 : insets.top + 8;

  const AgendaItem = ({ item }: { item: any }) => {
    const statusColor = STATUS_COLOR[item.status] ?? colors.mutedForeground;
    const statusLabel = STATUS_LABEL[item.status] ?? item.status;

    return (
      <View style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.accent, { backgroundColor: statusColor }]} />
        <View style={styles.itemContent}>
          <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={2}>
            {item.titulo}
          </Text>
          <View style={styles.itemMeta}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.itemTime, { color: colors.mutedForeground }]}>
              {formatDateTime(item.dataHoraInicio)}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
    );
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Agenda</Text>
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          {todayItems.length} hoje · {futureItems.length} próximos
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={[
            ...(todayItems.length > 0
              ? [{ type: "section", label: "Hoje" }, ...todayItems.map((i: any) => ({ ...i, type: "item" }))]
              : []),
            ...(futureItems.length > 0
              ? [{ type: "section", label: "Próximos" }, ...futureItems.map((i: any) => ({ ...i, type: "item" }))]
              : []),
            ...(upcoming.length === 0 ? [{ type: "empty" }] : []),
          ]}
          keyExtractor={(item: any, idx) => item.id ?? `${item.type}-${idx}`}
          renderItem={({ item }: any) => {
            if (item.type === "section") {
              return (
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                  {item.label}
                </Text>
              );
            }
            if (item.type === "empty") {
              return (
                <View style={styles.empty}>
                  <Feather name="calendar" size={40} color={colors.mutedForeground} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    Nenhum agendamento próximo
                  </Text>
                </View>
              );
            }
            return <AgendaItem item={item} />;
          }}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />
          }
          scrollEnabled={!!upcoming.length}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, gap: 4 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  count: { fontSize: 13, fontFamily: "Inter_400Regular" },
  list: { paddingHorizontal: 20, paddingTop: 8 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 6,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  accent: { width: 4, alignSelf: "stretch" },
  itemContent: { flex: 1, padding: 12, gap: 6 },
  itemTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  itemMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  itemTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statusBadge: {
    marginRight: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", gap: 10, paddingTop: 80 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
