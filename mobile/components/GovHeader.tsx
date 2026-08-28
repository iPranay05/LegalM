import React from "react";
import { View, Text, StyleSheet, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "./Colors";

interface Props {
  title: string;
  subtitle?: string;
}

export default function GovHeader({ title, subtitle }: Props) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <View style={styles.container}>
        <View style={styles.emblemRow}>
          <View style={styles.emblemPlaceholder}>
            <Text style={styles.emblemText}>🇮🇳</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.ministry}>
              Ministry of Consumer Affairs, Food & Public Distribution
            </Text>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        <View style={styles.stripe} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: Colors.primary },
  container: { backgroundColor: Colors.primary },
  emblemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  emblemPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  emblemText: { fontSize: 24 },
  titleBlock: { flex: 1 },
  ministry: {
    fontSize: 9,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.white,
    letterSpacing: 0.2,
  },
  subtitle: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 1 },
  stripe: { height: 3, backgroundColor: Colors.accent },
});
