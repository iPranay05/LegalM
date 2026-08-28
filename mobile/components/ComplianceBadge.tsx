import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "./Colors";

interface Props {
  isCompliant?: boolean;
  score?: number | null;
  headline?: "AllPass" | "HasFailures" | "NeedsManualReview";
  size?: "sm" | "lg";
}

export default function ComplianceBadge({ isCompliant, score, headline, size = "sm" }: Props) {
  const isLarge = size === "lg";
  const status = headline ?? (isCompliant === true ? "AllPass" : isCompliant === false ? "HasFailures" : "NeedsManualReview");
  const isPass = status === "AllPass";
  const needsReview = status === "NeedsManualReview";
  const label = isPass ? "COMPLIANT" : needsReview ? "NEEDS REVIEW" : "NON-COMPLIANT";
  const displayScore = typeof score === "number" && Number.isFinite(score) ? score : 0;

  return (
    <View style={[styles.container, isLarge && styles.containerLarge,
      isPass ? styles.pass : needsReview ? styles.review : styles.fail]}>
      <Text style={[styles.icon, isLarge && styles.iconLarge]}>
        {isPass ? "✓" : needsReview ? "!" : "✗"}
      </Text>
      <View>
        <Text style={[styles.status, isLarge && styles.statusLarge,
          isPass ? styles.passText : needsReview ? styles.reviewText : styles.failText]}>
          {label}
        </Text>
        <Text style={[styles.score, isLarge && styles.scoreLarge,
          isPass ? styles.passText : needsReview ? styles.reviewText : styles.failText]}>
          Score: {displayScore.toFixed(1)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 8,
  },
  containerLarge: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 12,
  },
  pass: { backgroundColor: Colors.successLight },
  fail: { backgroundColor: Colors.dangerLight },
  review: { backgroundColor: "#fff3cd" },
  icon: { fontSize: 16, fontWeight: "bold" },
  iconLarge: { fontSize: 28 },
  status: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  statusLarge: { fontSize: 16, letterSpacing: 0.8 },
  score: { fontSize: 10, fontWeight: "500" },
  scoreLarge: { fontSize: 13 },
  passText: { color: Colors.success },
  failText: { color: Colors.danger },
  reviewText: { color: "#b45309" },
});
