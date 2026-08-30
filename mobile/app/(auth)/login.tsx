import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Colors, Type, Radius } from "../../lib/theme";
import { login } from "../../lib/auth";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing details", "Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)/dashboard");
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Login failed. Check your credentials.";
      Alert.alert("Login Failed", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoIcon}>⚖️</Text>
            </View>
            <Text style={styles.brand}>LegalM</Text>
            <Text style={styles.brandSub}>Metrology Compliance</Text>
            <View style={styles.divider} />
            <Text style={styles.ministry}>
              Ministry of Consumer Affairs, Food & Public Distribution
            </Text>
            <Text style={styles.appSub}>Legal Metrology (Packaged Commodities) Rules, 2011</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <Text style={styles.cardSub}>Authorised personnel only. Use your department credentials.</Text>

            <Text style={styles.label}>Email / User ID</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="inspector@lm.gov.in"
              placeholderTextColor={Colors.onSurfaceMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.onSurfaceMuted}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                <Text style={styles.eyeText}>{showPassword ? "🙈" : "👁"}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color={Colors.onPrimary} /> : <Text style={styles.loginBtnText}>Sign In</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
              <Text style={styles.registerLink}>
                New inspector? <Text style={styles.registerLinkBold}>Register here</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>© Department of Consumer Affairs · NIC</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primary },
  scroll: { flexGrow: 1, paddingBottom: 32 },
  header: { alignItems: "center", paddingTop: 28, paddingBottom: 28, paddingHorizontal: 24 },
  logoBadge: {
    width: 56, height: 56, borderRadius: Radius.lg, backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  logoIcon: { fontSize: 28 },
  brand: { ...Type.headlineLg, fontSize: 26, color: Colors.white },
  brandSub: { ...Type.labelCaps, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  divider: { width: 48, height: 2, backgroundColor: Colors.secondaryContainer, marginVertical: 16, borderRadius: 2 },
  ministry: {
    ...Type.bodyMd, color: "rgba(255,255,255,0.85)", textAlign: "center", fontWeight: "600", lineHeight: 19,
  },
  appSub: { ...Type.bodyMd, fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 6, textAlign: "center" },
  card: {
    backgroundColor: Colors.white, marginHorizontal: 16, borderRadius: Radius.lg, padding: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  cardTitle: { ...Type.headlineMd, color: Colors.onSurface },
  cardSub: { ...Type.bodyMd, color: Colors.onSurfaceVariant, marginTop: 4, marginBottom: 20, lineHeight: 18 },
  label: { ...Type.labelCaps, color: Colors.onSurface, marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: Colors.borderSubtle, borderRadius: Radius.DEFAULT,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.onSurface,
    marginBottom: 16, backgroundColor: Colors.surfaceContainerLow,
  },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
  eyeBtn: {
    padding: 10, borderWidth: 1.5, borderColor: Colors.borderSubtle,
    borderRadius: Radius.DEFAULT, backgroundColor: Colors.surfaceContainerLow,
  },
  eyeText: { fontSize: 18 },
  loginBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.DEFAULT, alignItems: "center", marginBottom: 16 },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: Colors.onPrimary, fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },
  registerLink: { textAlign: "center", fontSize: 13, color: Colors.onSurfaceVariant },
  registerLinkBold: { color: Colors.secondary, fontWeight: "700" },
  footer: { textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 24, paddingHorizontal: 20 },
});
