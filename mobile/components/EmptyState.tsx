import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Type } from "../lib/theme";

interface Props {
  icon?: string;
  title: string;
  subtitle?: string;
}

export default function EmptyState({ icon = "📭", title, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 24 },
  icon: { fontSize: 40, marginBottom: 10 },
  title: { ...Type.headlineSm, color: Colors.onSurface, textAlign: "center" },
  subtitle: { ...Type.bodyMd, color: Colors.onSurfaceVariant, textAlign: "center", marginTop: 6, lineHeight: 19 },
});
