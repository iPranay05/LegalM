import React from "react";
import { Tabs } from "expo-router";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Colors, Type } from "../../lib/theme";

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <Text style={[styles.tabIcon, { opacity: focused ? 1 : 0.55 }]}>{icon}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{label}</Text>
    </View>
  );
}

// Scan is the primary action on a field-inspection app, so it gets a raised,
// high-contrast center button instead of blending in with the other four tabs.
function ScanTabButton({ children, onPress, accessibilityState }: any) {
  const focused = accessibilityState?.selected;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.scanBtnWrap}
    >
      <View style={[styles.scanBtn, focused && styles.scanBtnFocused]}>
        <Text style={styles.scanBtnIcon}>📷</Text>
      </View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused, { marginTop: 4 }]}>Scan</Text>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.onSurfaceMuted,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🏠" label="Dashboard" focused={focused} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="📋" label="History" focused={focused} /> }}
      />
      <Tabs.Screen
        name="scan"
        options={{ tabBarButton: (props) => <ScanTabButton {...props} /> }}
      />
      <Tabs.Screen
        name="products"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="📦" label="Products" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="👤" label="Profile" focused={focused} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    borderTopColor: Colors.borderSubtle,
    borderTopWidth: 1,
    height: 78,
    paddingBottom: 14,
    paddingTop: 8,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  tabItem: { alignItems: "center", justifyContent: "center", gap: 3, minWidth: 56 },
  tabIcon: { fontSize: 20 },
  tabLabel: { ...Type.labelCaps, fontSize: 10, color: Colors.onSurfaceMuted, fontWeight: "600" },
  tabLabelFocused: { color: Colors.primary, fontWeight: "800" },
  scanBtnWrap: { flex: 1, alignItems: "center", justifyContent: "center", top: -18 },
  scanBtn: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
    borderWidth: 3, borderColor: Colors.white,
  },
  scanBtnFocused: { backgroundColor: Colors.secondary },
  scanBtnIcon: { fontSize: 22 },
});
