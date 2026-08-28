import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "./Colors";

interface Props {
  label: string;
  present: boolean;
  extractedValue?: string;
  required?: boolean;
}

export default function FieldRow({ label, present, extractedValue, required = true }: Props) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, present ? styles.dotPass : styles.dotFail]} />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.label}>{label}</Text>
          {required && !present && (
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>Required</Text>
            </View>
          )}
        </View>
        {extractedValue ? (
          <Text style={styles.value}>{extractedValue}</Text>
        ) : (
          <Text style={[styles.value, styles.missing]}>
            {present ? "Detected" : "Not found on label"}
          </Text>
        )}
      </View>
      <Text style={[styles.check, present ? styles.checkPass : styles.checkFail]}>
        {present ? "✓" : "✗"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  dotPass: { backgroundColor: Colors.success },
  dotFail: { backgroundColor: Colors.danger },
  content: { flex: 1 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.text },
  requiredBadge: {
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  requiredText: { fontSize: 9, color: Colors.danger, fontWeight: "700" },
  value: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  missing: { color: Colors.danger, fontStyle: "italic" },
  check: { fontSize: 16, fontWeight: "700", marginTop: 2 },
  checkPass: { color: Colors.success },
  checkFail: { color: Colors.danger },
});
