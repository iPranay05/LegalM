import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import api from "../../lib/api";
import { getStoredUser, logout } from "../../lib/auth";
import { Colors, Type, Radius } from "../../lib/theme";
import { User } from "../../lib/types";

const isAdminRole = (role?: string) => role === "Controller" || role === "Analyst";

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [adminCounts, setAdminCounts] = useState<{ rules: number; users: number } | null>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);

  useFocusEffect(useCallback(() => {
    getStoredUser().then(setUser);
  }, []));

  useFocusEffect(useCallback(() => {
    if (!isAdminRole(user?.role)) return;
    setLoadingAdmin(true);
    Promise.all([
      api.get("/admin/rules").catch(() => ({ data: [] })),
      api.get("/admin/users").catch(() => ({ data: [] })),
    ]).then(([rulesRes, usersRes]) => {
      setAdminCounts({ rules: rulesRes.data.length, users: usersRes.data.length });
    }).finally(() => setLoadingAdmin(false));
  }, [user?.role]));

  function handleLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out", style: "destructive",
        onPress: async () => { await logout(); router.replace("/(auth)/login"); },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.headerSafe}>
        <Text style={styles.headerTitle}>Profile</Text>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}><Text style={styles.avatarInitial}>{(user?.name || "U").charAt(0).toUpperCase()}</Text></View>
          <Text style={styles.name}>{user?.name || "—"}</Text>
          <Text style={styles.email}>{user?.email || ""}</Text>
          <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{user?.role || "Inspector"}</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Account Details</Text>
        <Card style={{ marginBottom: 20 }}>
          <InfoRow label="Full Name" value={user?.name || "—"} />
          <InfoRow label="Email" value={user?.email || "—"} />
          <InfoRow label="Role" value={user?.role || "—"} />
          {user?.district ? <InfoRow label="District" value={user.district} /> : null}
          {user?.state ? <InfoRow label="State" value={user.state} last /> : null}
        </Card>

        {isAdminRole(user?.role) && (
          <>
            <Text style={styles.sectionTitle}>Admin</Text>
            <Card style={{ marginBottom: 20 }}>
              {loadingAdmin ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <>
                  <InfoRow label="Compliance Rules Configured" value={String(adminCounts?.rules ?? "—")} />
                  <InfoRow label="Registered Users" value={String(adminCounts?.users ?? "—")} last />
                  <Text style={styles.adminNote}>
                    Full rule editing, relaxation orders and user management are data-heavy desktop workflows —
                    use the LegalM web console (same backend, same data) for those.
                  </Text>
                </>
              )}
            </Card>
          </>
        )}

        <Text style={styles.sectionTitle}>App</Text>
        <Card padded={false} style={{ marginBottom: 24, overflow: "hidden" }}>
          <MenuRow label="About LegalM" icon="ℹ️" onPress={() => Alert.alert("LegalM", "Legal Metrology Compliance Portal\nMinistry of Consumer Affairs, Food & Public Distribution")} />
          <MenuRow label="Data & Backend Status" icon="🛰" onPress={() => Alert.alert("Backend", "Connected to the shared LegalM API — same backend, OCR/ML pipeline and database as the web app.")} last />
        </Card>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function MenuRow({ label, icon, onPress, last }: { label: string; icon: string; onPress: () => void; last?: boolean }) {
  return (
    <TouchableOpacity style={[styles.menuRow, !last && styles.infoRowBorder]} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerSafe: { backgroundColor: Colors.background },
  headerTitle: { ...Type.headlineLg, color: Colors.onSurface, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  scroll: { padding: 16, paddingBottom: 40 },
  avatarSection: { alignItems: "center", paddingVertical: 20 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  avatarInitial: { color: Colors.onPrimary, fontSize: 30, fontWeight: "700" },
  name: { ...Type.headlineMd, color: Colors.onSurface },
  email: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  roleBadge: { backgroundColor: Colors.surfaceContainerHigh, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5, marginTop: 10 },
  roleBadgeText: { fontSize: 11, fontWeight: "700", color: Colors.onSurface },
  sectionTitle: { ...Type.labelCaps, fontSize: 11, color: Colors.onSurfaceVariant, marginBottom: 10, marginTop: 4 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 11 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  infoLabel: { fontSize: 13, color: Colors.onSurfaceVariant },
  infoValue: { fontSize: 13, color: Colors.onSurface, fontWeight: "600" },
  adminNote: { fontSize: 11.5, color: Colors.onSurfaceMuted, lineHeight: 16, marginTop: 12 },
  menuRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  menuIcon: { fontSize: 16 },
  menuLabel: { flex: 1, fontSize: 14, color: Colors.onSurface, fontWeight: "600" },
  menuArrow: { fontSize: 18, color: Colors.onSurfaceMuted },
  logoutBtn: { borderWidth: 1.5, borderColor: Colors.statusFail, borderRadius: Radius.md, paddingVertical: 14, alignItems: "center" },
  logoutText: { color: Colors.statusFail, fontWeight: "700", fontSize: 14 },
});
