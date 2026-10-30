import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

const APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL || "https://app.appvendorai.com";
const PUSH_REGISTER_URL = `${APP_URL}/api/visitor-intelligence/push/register`;
const NOTIFICATION_CHANNEL = "visitor-intelligence";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function notificationTarget(response: Notifications.NotificationResponse): string | null {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const rawUrl = typeof data?.url === "string" ? data.url : null;
  const sessionId = typeof data?.sessionId === "string" ? data.sessionId : null;

  try {
    const target = rawUrl
      ? new URL(rawUrl)
      : sessionId
        ? new URL(`/content?tab=campanhas&view=visitantes&session=${encodeURIComponent(sessionId)}`, APP_URL)
        : null;
    if (!target) return null;
    const appHost = new URL(APP_URL).host;
    if (target.protocol !== "https:" || target.host !== appHost) return null;
    return target.toString();
  } catch {
    return null;
  }
}

async function nativeExpoPushToken(): Promise<string | null> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL, {
      name: "Visitantes online",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 120, 250],
      sound: "default",
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted"
    ? current
    : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;

  const projectId = Constants.easConfig?.projectId
    ?? (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
  if (!projectId) {
    console.warn("Visitor push: EAS projectId não disponível neste build");
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data || null;
}

export default function VendorAIMobileShell() {
  const webViewRef = useRef<WebView>(null);
  const authTokenRef = useRef<string | null>(null);
  const expoPushTokenRef = useRef<string | null>(null);
  const registeredPairRef = useRef<string | null>(null);
  const handledNotificationRef = useRef<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [webUrl, setWebUrl] = useState(APP_URL);

  const syncPushRegistration = useCallback(async () => {
    const authToken = authTokenRef.current;
    const expoPushToken = expoPushTokenRef.current;
    if (!authToken || !expoPushToken) return;

    const pair = `${authToken.slice(-24)}:${expoPushToken}`;
    if (registeredPairRef.current === pair) return;

    const response = await fetch(PUSH_REGISTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expoPushToken,
        platform: Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : "unknown",
      }),
    });

    if (!response.ok) throw new Error(`push register HTTP ${response.status}`);
    registeredPairRef.current = pair;
  }, []);

  const unregisterPush = useCallback(async (authToken: string | null) => {
    const expoPushToken = expoPushTokenRef.current;
    if (!authToken || !expoPushToken) return;
    await fetch(PUSH_REGISTER_URL, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expoPushToken }),
    }).catch(() => undefined);
    registeredPairRef.current = null;
  }, []);

  const openNotification = useCallback((response: Notifications.NotificationResponse) => {
    const identifier = response.notification.request.identifier;
    if (handledNotificationRef.current === identifier) return;
    handledNotificationRef.current = identifier;
    const target = notificationTarget(response);
    if (!target) return;
    setLoadError(false);
    setWebUrl(target);
  }, []);

  useEffect(() => {
    let active = true;
    void nativeExpoPushToken()
      .then((token) => {
        if (!active || !token) return;
        expoPushTokenRef.current = token;
        return syncPushRegistration();
      })
      .catch((error) => console.warn("Visitor push: falha ao obter token", error));

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) openNotification(response);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      responseSubscription.remove();
    };
  }, [openNotification, syncPushRegistration]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (canGoBack) {
          webViewRef.current?.goBack();
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [canGoBack]),
  );

  const onBridgeMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; token?: unknown };
      if (message.type !== "vendorai_auth") return;
      const nextToken = typeof message.token === "string" && message.token.length > 20 ? message.token : null;
      const previousToken = authTokenRef.current;
      if (previousToken === nextToken) return;

      if (previousToken && !nextToken) void unregisterPush(previousToken);
      authTokenRef.current = nextToken;
      registeredPairRef.current = null;
      if (nextToken) void syncPushRegistration().catch((error) => console.warn("Visitor push: registro falhou", error));
    } catch {
      // Mensagens de outros bridges da WebView são ignoradas.
    }
  }, [syncPushRegistration, unregisterPush]);

  if (loadError) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorTitle}>Não foi possível abrir o VendorAI</Text>
        <Text style={styles.errorText}>Verifique sua conexão e tente novamente.</Text>
        <Text style={styles.retry} onPress={() => setLoadError(false)}>Tentar novamente</Text>
      </View>
    );
  }

  const surfaceBootstrap = `
    (function () {
      try {
        window.localStorage.setItem('vendorai_surface', 'mobile');
        window.localStorage.setItem('vendorai_mobile_platform', ${JSON.stringify(Platform.OS)});
        var lastAuthToken = null;
        function publishVendorAuth() {
          var token = window.localStorage.getItem('vendorai_token');
          if (token === lastAuthToken) return;
          lastAuthToken = token;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'vendorai_auth', token: token }));
          }
        }
        publishVendorAuth();
        window.addEventListener('focus', publishVendorAuth);
        window.addEventListener('storage', publishVendorAuth);
        window.setInterval(publishVendorAuth, 3000);
      } catch (e) {}
    })();
    true;
  `;

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: webUrl }}
      style={styles.webview}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      pullToRefreshEnabled
      startInLoadingState
      setSupportMultipleWindows={false}
      injectedJavaScriptBeforeContentLoaded={surfaceBootstrap}
      onMessage={onBridgeMessage}
      onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
      onShouldStartLoadWithRequest={(request) => {
        const url = request.url;
        if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("about:blank")) {
          return true;
        }
        Linking.openURL(url).catch(() => undefined);
        return false;
      }}
      onError={() => setLoadError(true)}
      renderLoading={() => (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Abrindo VendorAI...</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: "#070b14" },
  loadingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#070b14",
    gap: 14,
  },
  loadingText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#070b14",
    padding: 28,
  },
  errorTitle: { color: "#ffffff", fontSize: 22, fontWeight: "700", textAlign: "center" },
  errorText: { color: "#94a3b8", fontSize: 15, textAlign: "center", marginTop: 10 },
  retry: {
    color: "#ffffff",
    backgroundColor: "#2563EB",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 22,
    overflow: "hidden",
    fontWeight: "700",
  },
});
