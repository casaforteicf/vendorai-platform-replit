import { Feather } from "@expo/vector-icons";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

interface AdCampaign {
  id: string;
  tipoAnuncio: "shopping" | "rsa_pmax";
  itemTipo: "produto" | "veiculo" | "imovel";
  modo: "unico" | "carrossel";
  orcamentoDiario: string;
  status: string;
  utmCode: string | null;
}

interface AdCreative {
  id: string;
  campaignId: string;
  headlines: string[];
  descriptions: string[];
  status: "rascunho" | "aprovado";
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_conexao_plataforma: "Aguardando conexão",
  ativo: "Ativa",
  pausado: "Pausada",
  encerrado: "Encerrada",
};
const STATUS_COLOR: Record<string, string> = {
  rascunho: "#94a3b8",
  aguardando_conexao_plataforma: "#f59e0b",
  ativo: "#22c55e",
  pausado: "#64748b",
  encerrado: "#ef4444",
};

function CampaignCard({ campaign, tenantId }: { campaign: AdCampaign; tenantId: string }) {
  const colors = useColors();
  const [creative, setCreative] = useState<AdCreative | null>(null);

  const gerarCriativo = useMutation({
    mutationFn: async () =>
      customFetch<AdCreative>(`/tenants/${tenantId}/ads/campaigns/${campaign.id}/gerar-criativo`, { method: "POST" }),
    onSuccess: (data) => setCreative(data),
    onError: () => Alert.alert("Erro", "Não foi possível gerar o criativo. Tente novamente."),
  });

  const aprovarCriativo = useMutation({
    mutationFn: async () =>
      customFetch<AdCreative>(`/tenants/${tenantId}/ads/creatives/${creative!.id}/aprovar`, { method: "POST" }),
    onSuccess: (data) => setCreative(data),
  });

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { borderColor: colors.border }]}>
            <Text style={[styles.badgeText, { color: colors.foreground }]}>{campaign.itemTipo}</Text>
          </View>
          <View style={[styles.badge, { borderColor: colors.border }]}>
            <Text style={[styles.badgeText, { color: colors.foreground }]}>
              {campaign.tipoAnuncio === "shopping" ? "Shopping" : "Search/PMax"}
            </Text>
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: (STATUS_COLOR[campaign.status] ?? "#94a3b8") + "22" }]}>
          <Text style={[styles.statusPillText, { color: STATUS_COLOR[campaign.status] ?? "#94a3b8" }]}>
            {STATUS_LABEL[campaign.status] ?? campaign.status}
          </Text>
        </View>
      </View>

      <Text style={[styles.orcamento, { color: colors.mutedForeground }]}>
        Orçamento diário: R$ {campaign.orcamentoDiario}
      </Text>

      {campaign.tipoAnuncio === "rsa_pmax" && (
        <View style={{ marginTop: 8 }}>
          {!creative ? (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary + "18" }]}
              onPress={() => gerarCriativo.mutate()}
              disabled={gerarCriativo.isPending}
            >
              {gerarCriativo.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="zap" size={14} color={colors.primary} />
              )}
              <Text style={[styles.buttonText, { color: colors.primary }]}>Gerar criativo</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.creativeBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.creativeLabel, { color: colors.mutedForeground }]}>
                Títulos ({creative.headlines.length})
              </Text>
              <View style={styles.chipRow}>
                {creative.headlines.map((h, i) => (
                  <View key={i} style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.chipText, { color: colors.foreground }]}>{h}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.creativeLabel, { color: colors.mutedForeground, marginTop: 8 }]}>
                Descrições ({creative.descriptions.length})
              </Text>
              {creative.descriptions.map((d, i) => (
                <Text key={i} style={[styles.descText, { color: colors.foreground }]}>{d}</Text>
              ))}

              {creative.status === "aprovado" ? (
                <View style={styles.approvedPill}>
                  <Feather name="check" size={12} color="#16a34a" />
                  <Text style={styles.approvedText}>Aprovado</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: "#16a34a18", marginTop: 8 }]}
                  onPress={() => aprovarCriativo.mutate()}
                  disabled={aprovarCriativo.isPending}
                >
                  {aprovarCriativo.isPending ? (
                    <ActivityIndicator size="small" color="#16a34a" />
                  ) : (
                    <Feather name="check" size={14} color="#16a34a" />
                  )}
                  <Text style={[styles.buttonText, { color: "#16a34a" }]}>Aprovar criativo</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {campaign.tipoAnuncio === "shopping" && (
        <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
          Este item entra automaticamente no feed do Shopping.
        </Text>
      )}
    </View>
  );
}

export default function AdsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const topPadding = Platform.OS === "web" ? 67 : insets.top + 8;

  const { data: campaigns, isLoading, refetch, isRefetching } = useQuery<AdCampaign[]>({
    queryKey: ["ad-campaigns", tenantId],
    queryFn: () => customFetch<AdCampaign[]>(`/tenants/${tenantId}/ads/campaigns`),
    enabled: !!tenantId,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Anúncios</Text>
        <View style={{ width: 32 }} />
      </View>

      {isLoading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={campaigns ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          renderItem={({ item }) => <CampaignCard campaign={item} tenantId={tenantId} />}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Feather name="target" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Nenhuma campanha ainda.{"\n"}Crie pelo painel web pra começar.
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 32, height: 32, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { textAlign: "center", fontSize: 14, lineHeight: 20 },
  listContent: { padding: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 12 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1 },
  badge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, textTransform: "capitalize" },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: "600" },
  orcamento: { fontSize: 13, marginTop: 8 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonText: { fontSize: 13, fontWeight: "600" },
  creativeBox: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 10, marginTop: 4 },
  creativeLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 12 },
  descText: { fontSize: 13, marginTop: 4 },
  approvedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "#16a34a18",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  approvedText: { fontSize: 12, fontWeight: "600", color: "#16a34a" },
  helperText: { fontSize: 12, marginTop: 8 },
});
