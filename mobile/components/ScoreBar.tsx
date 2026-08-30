import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Type, Radius, scoreColor } from "../lib/theme";

interface Props {
  score: number;
  showLabel?: boolean;
  height?: number;
}

export default function ScoreBar({ score, showLabel = true, height = 8 }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = scoreColor(clamped);
  return (
    <View style={styles.row}>
      <View style={[styles.track, { height, borderRadius: height / 2 }]}>
        <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: color, borderRadius: height / 2 }]} />
      </View>
      {showLabel && <Text style={[styles.label, { color }]}>{clamped.toFixed(0)}%</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%" },
  track: { flex: 1, backgroundColor: Colors.surfaceContainerHigh, overflow: "hidden" },
  fill: { height: "100%" },
  label: { ...Type.labelCaps, width: 38, textAlign: "right" },
});
