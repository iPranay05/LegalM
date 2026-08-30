import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import EmptyState from "../../components/EmptyState";
import TopBar from "../../components/TopBar";
import api from "../../lib/api";
import { Colors, Type, Radius } from "../../lib/theme";
import { Product } from "../../lib/types";
import { formatDate } from "../../lib/format";

// Mirrors web/app/products/page.tsx — same /products/ endpoint, same data.
export default function ProductsScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get<Product[]>("/products/", { params: { limit: 200 } });
      setProducts(res.data);
      setError("");
    } catch (e: any) {
      if (e?.response?.status === 401) router.replace("/(auth)/login");
      else setError("Failed to load products.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = search.trim()
    ? products.filter((p) => {
        const q = search.trim().toLowerCase();
        return p.name.toLowerCase().includes(q) || p.brand_name?.toLowerCase().includes(q) || p.manufacturer?.name.toLowerCase().includes(q);
      })
    : products;

  return (
    <View style={styles.container}>
      <TopBar title="Products" subtitle={`${products.length} registered`} onSearchPress={() => setSearchOpen((v) => !v)} />

      {searchOpen && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search product, brand, manufacturer…"
            placeholderTextColor={Colors.onSurfaceMuted}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : error ? (
        <EmptyState icon="⚠️" title="Couldn't load products" subtitle={error} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
          ListEmptyComponent={<EmptyState icon="📦" title="No products found" subtitle="Products get added to this repository automatically as scans are processed." />}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.8} onPress={() => router.push({ pathname: "/product/[productId]", params: { productId: String(item.id) } })}>
              <Card style={styles.productCard}>
                <View style={styles.productCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                    {item.brand_name ? <Text style={styles.productBrand}>{item.brand_name}</Text> : null}
                  </View>
                  {item.is_compliant != null && (
                    <StatusBadge status={item.is_compliant ? "pass" : "fail"} size="sm" />
                  )}
                </View>
                <Text style={styles.productManufacturer} numberOfLines={1}>
                  🏭 {item.manufacturer?.name || "Manufacturer unknown"}
                </Text>
                <View style={styles.productFooter}>
                  {item.last_compliance_score != null && (
                    <Text style={styles.productScore}>Last score: {item.last_compliance_score}%</Text>
                  )}
                  <Text style={styles.productDate}>
                    {item.last_scan_id ? `Scanned ${formatDate(item.created_at, { withTime: false })}` : "Not yet scanned"}
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: { padding: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  searchInput: { borderWidth: 1.5, borderColor: Colors.borderSubtle, borderRadius: Radius.DEFAULT, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: Colors.onSurface, backgroundColor: Colors.surfaceContainerLow },
  productCard: { marginBottom: 12 },
  productCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  productName: { ...Type.bodyLg, fontWeight: "700", color: Colors.onSurface },
  productBrand: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 1 },
  productManufacturer: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginBottom: 8 },
  productFooter: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: Colors.borderSubtle, paddingTop: 8 },
  productScore: { fontSize: 11.5, fontWeight: "700", color: Colors.onSurface },
  productDate: { fontSize: 11.5, color: Colors.onSurfaceMuted },
});
