import { useLogin } from "@workspace/api-client-react";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { saveToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = useLogin();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Preencha email e senha.");
      return;
    }
    setError("");
    try {
      const res = await loginMutation.mutateAsync({ data: { email, password } });
      await saveToken(res.token, res.user as any);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message ?? "Credenciais inválidas. Tente novamente.");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.inner}
      >
        <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
          <View style={styles.header}>
            <View style={[styles.logoWrap, { backgroundColor: colors.primary }]}>
              <Text style={styles.logoText}>V</Text>
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>VendorAI</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              CRM com Inteligência Artificial
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>
              Senha
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              onSubmitEditing={handleLogin}
              returnKeyType="go"
            />

            {error ? (
              <View style={[styles.errorWrap, { backgroundColor: colors.destructive + "18" }]}>
                <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.btn,
                { backgroundColor: colors.primary },
                loginMutation.isPending && { opacity: 0.7 },
              ]}
              onPress={handleLogin}
              disabled={loginMutation.isPending}
              activeOpacity={0.85}
            >
              {loginMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnText}>Entrar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, gap: 32 },
  header: { alignItems: "center", gap: 10 },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 4,
  },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 4 },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  errorWrap: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
  },
  errorText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  btn: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
