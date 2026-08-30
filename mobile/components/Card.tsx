import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { Colors, Radius } from "../lib/theme";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
}

// The mobile equivalent of the web's `.lm-card` utility class: white surface,
// 1px subtle border, rounded-xl, soft shadow.
export default function Card({ children, style, padded = true }: Props) {
  return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: "#0b1c30",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  padded: { padding: 16 },
});
