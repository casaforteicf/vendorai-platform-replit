import { useListLeads } from "@workspace/api-client-react";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { LeadCard } from "@/components/LeadCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { typography } from "@/constants/typography";

type FilterType = "all" | "high";

export default function LeadsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ search?: string | string[] }>();
  const initialSearch = Array.isArray(params.search) ? params.search[0] ?? "" : params.search ?? "";
  const [search, setSearch] = useState(initialSearch);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    const next = Array.isArray(params.search) ? params.search[0] ?? "" : params.search ?? "";
    setSearch(next);
  }, [params.search]);

  const { data: leads, isLoading, refetch } = useListLeads({
    query: { queryKey: ["leads"], enabled: !!user?.tenantId },
  });

  const filtered = useMemo(() => {
    let list = leads ?? [];
    if (filter === "high") list = list.filter((l: any) => (l.churnRisk ?? 0) >= 70);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l: any) =>
          l.name?.toLowerCase().includes(q) ||
          l.nome?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.empresa?.toLowerCase().includes(q) ||
          l.telefone?.toLowerCase().includes(q) ||
          l.endereco?.toLowerCase().includes(q)
      );
    }
    return list.sort((a: any, b: any) => (b.churnRisk ?? 0) - (a.churnRisk ?? 0));
  }, [leads, search, filter]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Leads</Text>
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          {filtered.length} {filtered.length === 1 ? "lead" : "leads"}
        </Text>

        <View style={[styles.searchWrap, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nome, empresa, telefone, e-mail ou endereço..."
            placeholderTextColor={colors.mutedForeground}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.filters}>
          {(["all", "high"] as FilterType[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterBtn,
                {
                  backgroundColor: filter === f ? colors.primary : colors.secondary,
                  borderColor: filter === f ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter(f)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: filter === f ? "#fff" : colors.mutedForeground },
                ]}
              >
                {f === "all" ? "Todos" : "Alto Risco"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }) => (
            <LeadCard lead={item as any} onPress={() => router.push(`/leads/${item.id}`)} />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 100 },
          ]}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />
          }
          scrollEnabled={!!filtered.length}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="users" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Nenhum lead encontrado
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
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  title: { fontSize: typography.size.pageTitle, fontFamily: typography.family.bold, letterSpacing: -0.5 },
  count: { fontSize: typography.size.label, fontFamily: typography.family.regular },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: typography.family.regular },
  filters: { flexDirection: "row", gap: 8 },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: { fontSize: typography.size.label, fontFamily: typography.family.medium },
  list: { paddingHorizontal: 20, paddingTop: 12 },
  empty: { alignItems: "center", gap: 10, paddingTop: 60 },
  emptyText: { fontSize: 15, fontFamily: typography.family.regular },
});
