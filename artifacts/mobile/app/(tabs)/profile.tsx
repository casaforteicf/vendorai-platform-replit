import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
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

interface RowProps {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}

function Row({ icon, label, value, onPress, destructive }: RowProps) {
  const colors = useColors();
  const color = destructive ? colors.destructive : colors.foreground;

  const content = (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: (destructive ? colors.destructive : colors.primary) + "18" }]}>
        <Feather name={icon as any} size={16} color={destructive ? colors.destructive : colors.primary} />
      </View>
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>
      ) : null}
      {onPress ? <Feather name="chevron-right" size={16} color={colors.mutedForeground} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const topPadding = Platform.OS === "web" ? 67 : insets.top + 8;

  const handleLogout = () => {
    Alert.alert("Sair", "Deseja sair da sua conta?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const roleLabel: Record<string, string> = {
    super_admin: "Super Admin",
    tenant_admin: "Admin",
    tenant_user: "Usuário",
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
    >
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Perfil</Text>
      </View>

      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0).toUpperCase() ?? "?"}
          </Text>
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>{user?.name}</Text>
        <View style={[styles.roleBadge, { backgroundColor: colors.primary + "22" }]}>
          <Text style={[styles.roleText, { color: colors.primary }]}>
            {roleLabel[user?.role ?? ""] ?? user?.role}
          </Text>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Row icon="mail" label="Email" value={user?.email} />
        <Row icon="shield" label="Função" value={roleLabel[user?.role ?? ""] ?? user?.role} />
        <Row icon="hash" label="Tenant ID" value={(user?.tenantId ?? "").slice(0, 8) + "…"} />
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
        <Row
          icon="log-out"
          label="Sair da conta"
          onPress={handleLogout}
          destructive
        />
      </View>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>VendorAI Mobile v1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  avatarSection: { alignItems: "center", paddingVertical: 24, gap: 10 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#fff" },
  name: { fontSize: 20, fontFamily: "Inter_700Bold" },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  roleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  section: {
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  rowValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  version: { textAlign: "center", marginTop: 32, fontSize: 12, fontFamily: "Inter_400Regular" },
});
