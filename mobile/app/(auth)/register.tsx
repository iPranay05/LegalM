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
import { register } from "../../lib/auth";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu & Kashmir", "Ladakh",
];

export default function RegisterScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    district: "",
    state: "",
  });
  const [loading, setLoading] = useState(false);

  function update(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleRegister() {
    if (!form.name || !form.email || !form.password) {
      Alert.alert("Error", "Name, email and password are required.");
      return;
    }
    setLoading(true);
    try {
      await register({ ...form, role: "inspector" });
      Alert.alert(
        "Registered!",
        "Account created. Please log in.",
        [{ text: "Login", onPress: () => router.replace("/(auth)/login") }]
      );
    } catch (err: any) {
      Alert.alert("Registration Failed", err?.response?.data?.detail || "Try again.");
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
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerText}>
            <Text style={styles.title}>Inspector Registration</Text>
            <Text style={styles.sub}>
              Legal Metrology Department | Ministry of Consumer Affairs
            </Text>
          </View>

          <View style={styles.card}>
            {[
              { key: "name", label: "Full Name", placeholder: "Enter your full name" },
              { key: "email", label: "Official Email", placeholder: "name@lm.gov.in", keyboard: "email-address" as any },
              { key: "password", label: "Password", placeholder: "Min. 8 characters", secure: true },
              { key: "district", label: "District (Optional)", placeholder: "e.g. Pune" },
              { key: "state", label: "State (Optional)", placeholder: "e.g. Maharashtra" },
            ].map((field) => (
              <View key={field.key}>
                <Text style={styles.label}>{field.label}</Text>
                <TextInput
                  style={styles.input}
                  value={form[field.key as keyof typeof form]}
                  onChangeText={(v) => update(field.key, v)}
                  placeholder={field.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  keyboardType={field.keyboard || "default"}
                  secureTextEntry={field.secure}
                  autoCapitalize={field.key === "email" ? "none" : "words"}
                />
              </View>
            ))}

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.btnText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primary },
  scroll: { flexGrow: 1, paddingBottom: 32 },
  topBar: { paddingHorizontal: 16, paddingTop: 16 },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: Colors.white, fontSize: 15, fontWeight: "600" },
  headerText: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  title: { fontSize: 24, fontWeight: "800", color: Colors.white },
  sub: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 },
  card: {
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
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
  btn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: Colors.white, fontSize: 15, fontWeight: "700" },
});
