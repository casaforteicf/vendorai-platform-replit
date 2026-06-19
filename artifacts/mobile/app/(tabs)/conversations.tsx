import { Feather } from "@expo/vector-icons";
import { useListTenantConversations } from "@workspace/api-client-react";
import { router } from "expo-router";
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

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: "message-circle",
  instagram: "instagram",
  email: "mail",
  web: "globe",
};

const CHANNEL_COLOR: Record<string, string> = {
  whatsapp: "#22c55e",
  instagram: "#e1306c",
  email: "#3b82f6",
  web: "#8b5cf6",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function ConversationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const { data: conversations, isLoading, refetch } = useListTenantConversations(tenantId, {
    query: { queryKey: ["conversations", tenantId], enabled: !!tenantId, refetchInterval: 30_000 },
  });

  const sorted = [...(conversations ?? [])].sort(
    (a: any, b: any) =>
      new Date(b.updatedAt ?? b.createdAt).getTime() -
      new Date(a.updatedAt ?? a.createdAt).getTime()
  );

  const topPadding = Platform.OS === "web" ? 67 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Conversas</Text>
        {conversations && (
          <Text style={[styles.count, { color: colors.mutedForeground }]}>
            {sorted.filter((c: any) => (c.naoLidas ?? 0) > 0).length} não lidas
          </Text>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }) => {
            const raw = item as any;
            const canal = raw.canal ?? "web";
            const icon = CHANNEL_ICON[canal] ?? "message-circle";
            const channelColor = CHANNEL_COLOR[canal] ?? colors.primary;
            const unread = raw.naoLidas ?? 0;
            const contactName = raw.lead?.name ?? raw.leadId ?? "Contato";

            return (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => router.push(`/conversations/${item.id}`)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: channelColor + "22" }]}>
                  <Feather name={icon as any} size={20} color={channelColor} />
                </View>
                <View style={styles.info}>
                  <View style={styles.topRow}>
                    <Text style={[styles.name, { color: colors.foreground }, unread > 0 && styles.bold]} numberOfLines={1}>
                      {contactName}
                    </Text>
                    <Text style={[styles.time, { color: colors.mutedForeground }]}>
                      {formatTime(item.updatedAt ?? item.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.bottomRow}>
                    <Text
                      style={[styles.preview, { color: colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {canal.charAt(0).toUpperCase() + canal.slice(1)} · {item.status ?? "ativo"}
                    </Text>
                    {unread > 0 ? (
                      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />
          }
          scrollEnabled={!!sorted.length}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="message-circle" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Nenhuma conversa ainda
              </Text>
            </View>
          }
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, gap: 4 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  bold: { fontFamily: "Inter_700Bold" },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  preview: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  empty: { alignItems: "center", gap: 10, paddingTop: 80 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
