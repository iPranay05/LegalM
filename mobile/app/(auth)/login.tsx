import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../components/Colors";
import { login } from "../../lib/auth";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)/scan");
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || "Login failed. Check credentials.";
      Alert.alert("Login Failed", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header Banner */}
          <View style={styles.header}>
            <Text style={styles.emblem}>🇮🇳</Text>
            <Text style={styles.gov}>Government of India</Text>
            <Text style={styles.ministry}>
              Ministry of Consumer Affairs,{"\n"}Food & Public Distribution
            </Text>
            <View style={styles.divider} />
            <Text style={styles.appName}>Legal Metrology{"\n"}Compliance Inspector</Text>
            <Text style={styles.appSub}>Packaged Commodities Rules, 2011</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Inspector Login</Text>
            <Text style={styles.cardSub}>
              Authorised personnel only. Use your department credentials.
            </Text>

            <Text style={styles.label}>Email / User ID</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="inspector@lm.gov.in"
              placeholderTextColor={Colors.textMuted}
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
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
              >
                <Text style={styles.eyeText}>{showPassword ? "🙈" : "👁"}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.loginBtnText}>Login</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
              <Text style={styles.registerLink}>
                New inspector? <Text style={styles.registerLinkBold}>Register here</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            © Department of Consumer Affairs | NIC
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primary },
  scroll: { flexGrow: 1, paddingBottom: 32 },
  header: {
    backgroundColor: Colors.primary,
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  emblem: { fontSize: 48, marginBottom: 8 },
  gov: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  ministry: {
    fontSize: 13,
    color: Colors.white,
    textAlign: "center",
    fontWeight: "600",
    marginTop: 4,
    lineHeight: 20,
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: Colors.accent,
    marginVertical: 14,
    borderRadius: 2,
  },
  appName: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.white,
    textAlign: "center",
    lineHeight: 28,
  },
  appSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    marginTop: 4,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 24,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 17,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 16,
    backgroundColor: Colors.offWhite,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  eyeBtn: {
    padding: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.offWhite,
  },
  eyeText: { fontSize: 18 },
  loginBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  registerLink: {
    textAlign: "center",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  registerLinkBold: { color: Colors.primary, fontWeight: "700" },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    marginTop: 24,
    paddingHorizontal: 20,
  },
});
