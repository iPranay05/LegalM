import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import GovHeader from "../../components/GovHeader";
import { Colors } from "../../components/Colors";
import { getStoredUser, logout, User } from "../../lib/auth";

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    getStoredUser().then(setUser);
  }, []);

  async function handleLogout() {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  const infoRows = [
    { label: "Name", value: user?.name || "—" },
    { label: "Email", value: user?.email || "—" },
    { label: "Role", value: user?.role === "admin" ? "Administrator" : "Field Inspector" },
    { label: "District", value: user?.district || "Not set" },
    { label: "State", value: user?.state || "Not set" },
  ];

  return (
    <View style={styles.container}>
      <GovHeader title="Inspector Profile" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0)?.toUpperCase() || "?"}
            </Text>
          </View>
          <Text style={styles.avatarName}>{user?.name || "Inspector"}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {user?.role === "admin" ? "⭐ Admin" : "🔍 Field Inspector"}
            </Text>
          </View>
        </View>

        {/* Info card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Details</Text>
          {infoRows.map((row) => (
            <View key={row.label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Department info */}
        <View style={styles.deptCard}>
          <Text style={styles.deptTitle}>Department</Text>
          <Text style={styles.deptText}>
            Legal Metrology Division{"\n"}
            Ministry of Consumer Affairs,{"\n"}
            Food & Public Distribution{"\n"}
            Government of India
          </Text>
        </View>

        {/* Legal reference */}
        <View style={styles.legalCard}>
          <Text style={styles.legalTitle}>Reference Legislation</Text>
          <Text style={styles.legalItem}>• Legal Metrology Act, 2009</Text>
          <Text style={styles.legalItem}>• Legal Metrology (Packaged Commodities) Rules, 2011</Text>
          <Text style={styles.legalItem}>• Consumer Protection Act, 2019</Text>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>🚪  Logout</Text>
        </TouchableOpacity>

        <Text style={styles.version}>LM Compliance App v1.0.0 · SIH 2026</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 16, paddingBottom: 40 },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  avatarText: { fontSize: 32, color: Colors.white, fontWeight: "800" },
  avatarName: { fontSize: 20, fontWeight: "700", color: Colors.text },
  roleBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  roleBadgeText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: { fontSize: 13, color: Colors.textSecondary },
  infoValue: { fontSize: 13, fontWeight: "600", color: Colors.text },
  deptCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  deptTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  deptText: { fontSize: 13, color: Colors.text, lineHeight: 22 },
  legalCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 4,
  },
  legalTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  legalItem: { fontSize: 12, color: Colors.text, lineHeight: 20 },
  logoutBtn: {
    borderWidth: 2,
    borderColor: Colors.danger,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  logoutText: { fontSize: 15, fontWeight: "700", color: Colors.danger },
  version: { textAlign: "center", fontSize: 11, color: Colors.textMuted },
});
