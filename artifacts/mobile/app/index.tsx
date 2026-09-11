import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { WebView } from "react-native-webview";

const APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL || "https://app.appvendorai.com";

const MOBILE_NORMALIZE_JS = `
  (function () {
    try {
      var viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement('meta');
        viewport.setAttribute('name', 'viewport');
        document.head.appendChild(viewport);
      }
      viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');

      var style = document.getElementById('vendorai-native-mobile-normalize');
      if (!style) {
        style = document.createElement('style');
        style.id = 'vendorai-native-mobile-normalize';
        style.textContent = ` + "`" + `
          html, body, #root {
            width: 100% !important;
            max-width: 100vw !important;
            min-width: 0 !important;
            overflow-x: hidden !important;
            -webkit-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
          }
          @media (max-width: 640px) {
            html { font-size: 13px !important; }
            body { font-size: 13px !important; line-height: 1.4 !important; }
            .vendor-settings-compact { font-size: 13px !important; }
            .vendor-settings-compact > section,
            .vendor-settings-compact > details {
              padding-left: 10px !important;
              padding-right: 10px !important;
              margin-bottom: 8px !important;
            }
            .vendor-settings-compact > section > div,
            .vendor-settings-compact > details > summary {
              padding: 10px !important;
            }
            [data-vendorai-unified-assistant] {
              right: 10px !important;
              bottom: calc(10px + env(safe-area-inset-bottom, 0px)) !important;
            }
            [data-vendorai-unified-assistant] > button[aria-label="Abrir central de assistentes de IA"] {
              width: 42px !important;
              height: 42px !important;
              min-width: 42px !important;
              min-height: 42px !important;
              max-width: 42px !important;
              padding: 0 !important;
              border-radius: 9999px !important;
            }
            [data-vendorai-unified-assistant] > button[aria-label="Abrir central de assistentes de IA"] span,
            [data-vendorai-unified-assistant] > button[aria-label="Abrir central de assistentes de IA"] svg:last-child {
              display: none !important;
            }
          }
        ` + "`" + `;
        document.head.appendChild(style);
      }
    } catch (_) {}
    true;
  })();
`;

export default function VendorAIMobileShell() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState(false);

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

  if (loadError) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorTitle}>Não foi possível abrir o VendorAI</Text>
        <Text style={styles.errorText}>Verifique sua conexão e tente novamente.</Text>
        <Text style={styles.retry} onPress={() => setLoadError(false)}>Tentar novamente</Text>
      </View>
    );
  }

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: APP_URL }}
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
      textZoom={90}
      injectedJavaScriptBeforeContentLoaded={MOBILE_NORMALIZE_JS}
      injectedJavaScript={MOBILE_NORMALIZE_JS}
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
          <ActivityIndicator size="large" color="#D9673E" />
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
    backgroundColor: "#D9673E",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 22,
    overflow: "hidden",
    fontWeight: "700",
  },
});
