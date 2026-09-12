import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useColors } from "@/hooks/useColors";
import { typography } from "@/constants/typography";

type Props = {
  compact?: boolean;
  showTagline?: boolean;
};

export function VendorBrand({ compact = false, showTagline = true }: Props) {
  const colors = useColors();
  const markSize = compact ? 38 : 58;

  return (
    <View style={styles.row} accessibilityRole="image" accessibilityLabel="Vendor.ai">
      <View
        style={[
          styles.mark,
          {
            width: markSize,
            height: markSize,
            borderRadius: compact ? 10 : 14,
            backgroundColor: colors.primary,
          },
        ]}
      >
        <Svg width={markSize * 0.62} height={markSize * 0.62} viewBox="0 0 62 62">
          <Path
            d="M12 16 L31 49 L50 16"
            stroke="#FFFFFF"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>

      <View style={styles.copy}>
        <Text
          style={[
            styles.wordmark,
            {
              color: colors.foreground,
              fontSize: compact ? 20 : typography.size.pageTitle,
            },
          ]}
        >
          Vendor<Text style={{ color: colors.primary }}>.ai</Text>
        </Text>
        {showTagline ? (
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>INTELIGÊNCIA COMERCIAL</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mark: {
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    minWidth: 0,
  },
  wordmark: {
    fontFamily: typography.family.bold,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  tagline: {
    marginTop: 2,
    fontFamily: typography.family.medium,
    fontSize: 9,
    letterSpacing: 1.6,
  },
});
