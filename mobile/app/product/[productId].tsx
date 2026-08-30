import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import EmptyState from "../../components/EmptyState";
import api from "../../lib/api";
import { Colors, Type, Radius } from "../../lib/theme";
import { Product, Scan } from "../../lib/types";
import { formatDate, scanStatus } from "../../lib/format";

export default function ProductDetailScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productRes, scansRes] = await Promise.all([
        api.get<Product>(`/products/${productId}`),
        api.get<Scan[]>("/scan/", { params: { product_id: productId, limit: 50 } }),
      ]);
      setProduct(productRes.data);
      setScans(scansRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load product.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.topBarSafe}>
        <View style={styles.topBarRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ marginRight: 10 }}>
            <Text style={styles.topBarBack}>←</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle} numberOfLines={1}>{product?.name || "Product"}</Text>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : error || !product ? (
        <EmptyState icon="⚠️" title="Couldn't load product" subtitle={error} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.productName}>{product.name}</Text>
          {product.brand_name ? <Text style={styles.brand}>{product.brand_name}</Text> : null}

          <Card style={{ marginTop: 14, marginBottom: 16 }}>
            <InfoRow label="Category" value={product.category || "—"} />
            <InfoRow label="SKU" value={product.sku || "—"} />
            <InfoRow label="Barcode" value={product.barcode || "—"} mono />
            <InfoRow label="Compliance" value={product.is_compliant == null ? "Not yet scanned" : product.is_compliant ? "Compliant" : "Non-Compliant"} />
            {product.last_compliance_score != null && <InfoRow label="Last Score" value={`${product.last_compliance_score}%`} />}
            <InfoRow label="Registered" value={formatDate(product.created_at, { withTime: false })} last />
          </Card>

          {product.manufacturer && (
            <>
              <Text style={styles.sectionTitle}>Manufacturer</Text>
              <Card style={{ marginBottom: 16 }}>
                <Text style={styles.mfrName}>{product.manufacturer.name}</Text>
                {product.manufacturer.address ? <Text style={styles.mfrDetail}>{product.manufacturer.address}</Text> : null}
                <Text style={styles.mfrDetail}>
                  {[product.manufacturer.city, product.manufacturer.state, product.manufacturer.pincode].filter(Boolean).join(", ")}
                </Text>
                {product.manufacturer.registration_number && (
                  <Text style={styles.mfrDetail}>Reg. No: {product.manufacturer.registration_number}</Text>
                )}
                {product.manufacturer.is_importer && <Text style={styles.mfrDetail}>Origin: {product.manufacturer.country_of_origin || "Imported"}</Text>}
              </Card>
            </>
          )}

          <Text style={styles.sectionTitle}>Scan History ({scans.length})</Text>
          {scans.length === 0 ? (
            <Card><EmptyState icon="📷" title="No scans yet" subtitle="This product hasn't been scanned in the field." /></Card>
          ) : (
            <Card padded={false} style={{ overflow: "hidden" }}>
              {scans.map((scan, i) => (
                <TouchableOpacity
                  key={scan.scan_id}
                  style={[styles.scanRow, i > 0 && styles.scanRowBorder]}
                  onPress={() => router.push({ pathname: "/result", params: { scan_id: scan.scan_id } })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scanId}>{scan.scan_id}</Text>
                    <Text style={styles.scanDate}>{formatDate(scan.created_at)}</Text>
                  </View>
                  <StatusBadge status={scanStatus(scan)} size="sm" />
                </TouchableOpacity>
              ))}
            </Card>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function InfoRow({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.mono]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBarSafe: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  topBarRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  topBarBack: { fontSize: 20, color: Colors.onSurface },
  topBarTitle: { ...Type.headlineSm, color: Colors.onSurface, flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  productName: { ...Type.headlineLg, color: Colors.onSurface },
  brand: { ...Type.bodyLg, color: Colors.onSurfaceVariant, marginTop: 2 },
  sectionTitle: { ...Type.headlineSm, color: Colors.onSurface, marginBottom: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  infoLabel: { fontSize: 12.5, color: Colors.onSurfaceVariant },
  infoValue: { fontSize: 12.5, color: Colors.onSurface, fontWeight: "600" },
  mono: { fontFamily: "monospace" },
  mfrName: { fontSize: 14.5, fontWeight: "700", color: Colors.onSurface, marginBottom: 4 },
  mfrDetail: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
  scanRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  scanRowBorder: { borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  scanId: { fontSize: 13, fontWeight: "700", color: Colors.secondary, fontFamily: "monospace" },
  scanDate: { fontSize: 11.5, color: Colors.onSurfaceMuted, marginTop: 2 },
});
