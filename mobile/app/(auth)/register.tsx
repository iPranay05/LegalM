import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Colors, Type, Radius } from "../../lib/theme";
import { register } from "../../lib/auth";

export default function RegisterScreen() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", district: "", state: "" });
  const [loading, setLoading] = useState(false);

  function update(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleRegister() {
    if (!form.name || !form.email || !form.password) {
      Alert.alert("Missing details", "Name, email and password are required.");
      return;
    }
    setLoading(true);
    try {
      await register({ ...form, role: "Inspector" });
      Alert.alert("Registered", "Account created. Please log in.", [
        { text: "Log In", onPress: () => router.replace("/(auth)/login") },
      ]);
    } catch (err: any) {
      Alert.alert("Registration Failed", err?.response?.data?.detail || "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { key: "name", label: "Full Name", placeholder: "Enter your full name" },
    { key: "email", label: "Official Email", placeholder: "name@lm.gov.in", keyboard: "email-address" as const },
    { key: "password", label: "Password", placeholder: "Min. 8 characters", secure: true },
    { key: "district", label: "District (Optional)", placeholder: "e.g. Pune" },
    { key: "state", label: "State (Optional)", placeholder: "e.g. Maharashtra" },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerText}>
            <Text style={styles.title}>Inspector Registration</Text>
            <Text style={styles.sub}>Legal Metrology Department · Ministry of Consumer Affairs</Text>
          </View>

          <View style={styles.card}>
            {fields.map((field) => (
              <View key={field.key}>
                <Text style={styles.label}>{field.label}</Text>
                <TextInput
                  style={styles.input}
                  value={form[field.key as keyof typeof form]}
                  onChangeText={(v) => update(field.key, v)}
                  placeholder={field.placeholder}
                  placeholderTextColor={Colors.onSurfaceMuted}
                  keyboardType={field.keyboard || "default"}
                  secureTextEntry={field.secure}
                  autoCapitalize={field.key === "email" ? "none" : "words"}
                />
              </View>
            ))}

            <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleRegister} disabled={loading}>
              {loading ? <ActivityIndicator color={Colors.onPrimary} /> : <Text style={styles.btnText}>Create Account</Text>}
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
  headerText: { paddingHorizontal: 20, paddingVertical: 20 },
  title: { ...Type.headlineLg, fontSize: 22, color: Colors.white },
  sub: { ...Type.bodyMd, color: "rgba(255,255,255,0.7)", marginTop: 4 },
  card: { backgroundColor: Colors.white, marginHorizontal: 16, borderRadius: Radius.lg, padding: 24 },
  label: { ...Type.labelCaps, color: Colors.onSurface, marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: Colors.borderSubtle, borderRadius: Radius.DEFAULT,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.onSurface,
    marginBottom: 16, backgroundColor: Colors.surfaceContainerLow,
  },
  btn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.DEFAULT, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: Colors.onPrimary, fontSize: 15, fontWeight: "700" },
});
