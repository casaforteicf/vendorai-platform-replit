import { Feather } from "@expo/vector-icons";
import {
  useGetConversation,
  useListConversationMessages,
} from "@workspace/api-client-react";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const SENDER_AGENT = "agent";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

interface Bubble {
  id: string;
  content: string;
  sender: string;
  createdAt: string;
}

export default function ConversationDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const { data: conversation, isLoading: loadingConv } = useGetConversation(id ?? "", {
    query: { queryKey: ["conversation", id], enabled: !!id },
  });

  const { data: messages, isLoading: loadingMsgs, refetch } = useListConversationMessages(
    tenantId,
    id ?? "",
    { query: { queryKey: ["messages", tenantId, id], enabled: !!id && !!tenantId, refetchInterval: 15_000 } }
  );

  const reversed = [...(messages ?? [])].reverse();

  const isLoading = loadingConv || loadingMsgs;

  const renderBubble = ({ item, index }: { item: any; index: number }) => {
    const isAgent = item.sender === SENDER_AGENT || item.remetente === "agent";
    const prevItem = reversed[index + 1];
    const showDay =
      !prevItem ||
      formatDay(item.createdAt) !== formatDay(prevItem.createdAt);

    return (
      <>
        <View style={[styles.bubble, isAgent ? styles.agentBubble : styles.leadBubble]}>
          <View
            style={[
              styles.bubbleInner,
              isAgent
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <Text style={[styles.bubbleText, { color: isAgent ? "#fff" : colors.foreground }]}>
              {item.content ?? item.conteudo ?? ""}
            </Text>
            <Text style={[styles.bubbleTime, { color: isAgent ? "#ffffffaa" : colors.mutedForeground }]}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
        {showDay ? (
          <View style={styles.dayRow}>
            <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dayText, { color: colors.mutedForeground }]}>
              {formatDay(item.createdAt)}
            </Text>
            <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
          </View>
        ) : null}
      </>
    );
  };

  const canal = (conversation as any)?.canal ?? "web";
  const leadName = (conversation as any)?.lead?.name ?? "Contato";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={reversed}
          keyExtractor={(item: any) => item.id}
          renderItem={renderBubble}
          inverted
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 16 },
          ]}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />
          }
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="message-circle" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Nenhuma mensagem ainda
              </Text>
            </View>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingTop: 16, gap: 4 },
  bubble: { marginVertical: 2 },
  agentBubble: { alignItems: "flex-end" },
  leadBubble: { alignItems: "flex-start" },
  bubbleInner: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    gap: 4,
  },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  bubbleTime: { fontSize: 11, fontFamily: "Inter_400Regular", alignSelf: "flex-end" },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 12 },
  dayLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dayText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  empty: { alignItems: "center", gap: 10, paddingTop: 80 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
