import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Colors, Type } from "../lib/theme";

interface Props {
  title: string;
  subtitle?: string;
  /** Optional right-side action, e.g. a search icon. Omit rather than render a dead button. */
  onSearchPress?: () => void;
  showBack?: boolean;
}

// Mobile top bar. Deliberately does NOT carry over the web's notification bell
// or settings gear — there's no notifications backend and Settings is just the
// Profile tab, so those would be dead buttons on mobile. Search (when wired)
// hands off to History's real backend-filtered search, same as web.
export default function TopBar({ title, subtitle, onSearchPress, showBack }: Props) {
  const router = useRouter();
  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.row}>
        <View style={styles.left}>
          {showBack && (
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
        </View>
        {onSearchPress && (
          <TouchableOpacity onPress={onSearchPress} hitSlop={10} style={styles.iconBtn}>
            <Text style={styles.icon}>🔍</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: Colors.surface },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  backBtn: { padding: 2 },
  backIcon: { fontSize: 20, color: Colors.onSurface },
  title: { ...Type.headlineSm, color: Colors.onSurface },
  subtitle: { ...Type.bodyMd, fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 1 },
  iconBtn: { padding: 6 },
  icon: { fontSize: 18 },
});
