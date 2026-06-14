import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface ChurnBadgeProps {
  risk: number;
  size?: "sm" | "md";
}

export function ChurnBadge({ risk, size = "md" }: ChurnBadgeProps) {
  const colors = useColors();

  const getColor = () => {
    if (risk >= 70) return "#ef4444";
    if (risk >= 40) return "#f59e0b";
    return "#22c55e";
  };

  const getLabel = () => {
    if (risk >= 70) return "Alto";
    if (risk >= 40) return "Médio";
    return "Baixo";
  };

  const color = getColor();
  const isSmall = size === "sm";

  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color + "44" }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color, fontSize: isSmall ? 10 : 12 }]}>
        {getLabel()} {risk}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontFamily: "Inter_600SemiBold",
  },
});
