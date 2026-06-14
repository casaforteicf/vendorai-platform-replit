import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChurnBadge } from "./ChurnBadge";
import { useColors } from "@/hooks/useColors";

interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  churnRisk?: number;
  canal?: string;
  empresa?: string;
}

interface LeadCardProps {
  lead: Lead;
  onPress: () => void;
}

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: "message-circle",
  instagram: "instagram",
  email: "mail",
  web: "globe",
};

export function LeadCard({ lead, onPress }: LeadCardProps) {
  const colors = useColors();

  const initials = lead.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const channelIcon = CHANNEL_ICONS[lead.canal ?? ""] ?? "user";

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
        <Text style={[styles.initials, { color: colors.primary }]}>{initials}</Text>
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {lead.name}
        </Text>
        {lead.empresa ? (
          <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {lead.empresa}
          </Text>
        ) : lead.email ? (
          <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {lead.email}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>
        {lead.churnRisk !== undefined && lead.churnRisk !== null ? (
          <ChurnBadge risk={lead.churnRisk} size="sm" />
        ) : null}
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  sub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
