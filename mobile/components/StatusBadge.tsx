import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, StatusTint, Type, Radius } from "../lib/theme";

type Status = "pass" | "review" | "fail" | "pending" | "neutral";

interface Props {
  status: Status;
  label?: string;
  size?: "sm" | "md";
}

const CONFIG: Record<Status, { color: string; tint: string; icon: string; label: string }> = {
  pass: { color: Colors.statusPass, tint: StatusTint.pass, icon: "✓", label: "Compliant" },
  fail: { color: Colors.statusFail, tint: StatusTint.fail, icon: "✕", label: "Non-Compliant" },
  review: { color: Colors.statusReview, tint: StatusTint.review, icon: "!", label: "Needs Review" },
  pending: { color: Colors.secondary, tint: "rgba(17,92,185,0.10)", icon: "⟳", label: "Processing" },
  neutral: { color: Colors.onSurfaceMuted, tint: StatusTint.neutral, icon: "–", label: "—" },
};

export default function StatusBadge({ status, label, size = "md" }: Props) {
  const cfg = CONFIG[status];
  const small = size === "sm";
  return (
    <View style={[styles.badge, { backgroundColor: cfg.tint, borderColor: cfg.color }, small && styles.badgeSm]}>
      <Text style={[styles.icon, { color: cfg.color }, small && styles.iconSm]}>{cfg.icon}</Text>
      <Text style={[styles.label, { color: cfg.color }, small && styles.labelSm]}>
        {(label ?? cfg.label).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeSm: { paddingHorizontal: 8, paddingVertical: 3 },
  icon: { fontSize: 11, fontWeight: "800" },
  iconSm: { fontSize: 10 },
  label: { ...Type.labelCaps, fontSize: 10.5 },
  labelSm: { fontSize: 9.5 },
});
