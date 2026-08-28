import React, { useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, TextInput, Modal, FlatList, Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import GovHeader from "../../components/GovHeader";
import { Colors } from "../../components/Colors";
import api from "../../lib/api";
import { PRODUCT_CATEGORIES } from "../../lib/types";

const MAX_IMAGES = 6;
const PANEL_LABELS = ["Front", "Back", "Side 1", "Side 2", "Nutritional Info", "Other"];

type Mode = "label" | "barcode";

export default function ScanScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("label");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("general");
  const [shopName, setShopName] = useState("");
  const [location, setLocation] = useState("");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [barcodeScanning, setBarcodeScanning] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const barcodeScanned = useRef(false);

  const selectedCategory = PRODUCT_CATEGORIES.find((c) => c.value === category);
  const canAddMore = images.length < MAX_IMAGES;

  // ── Image helpers ──────────────────────────────────────────────────────────

  async function addFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission Denied", "Camera roll access is needed."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
    });
    if (!result.canceled)
      setImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, MAX_IMAGES));
  }

  async function addFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission Denied", "Camera access is needed."); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: true });
    if (!result.canceled) {
      setImages(prev => [...prev, result.assets[0].uri].slice(0, MAX_IMAGES));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  function removeImage(index: number) {
    setImages(prev => prev.filter((_, i) => i !== index));
  }

  // ── Barcode scanner ────────────────────────────────────────────────────────

  async function startBarcodeScanner() {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) { Alert.alert("Permission Denied", "Camera access is needed to scan barcodes."); return; }
    }
    barcodeScanned.current = false;
    setScannedBarcode(null);
    setBarcodeScanning(true);
  }

  async function onBarcodeScanned(result: { type: string; data: string }) {
    if (barcodeScanned.current) return;
    barcodeScanned.current = true;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setBarcodeScanning(false);
    setScannedBarcode(result.data);
    Alert.alert(
      "Barcode Detected ✓",
      `Type: ${result.type}\nCode: ${result.data}\n\nNow switch to Label Photos and photograph the label for a full compliance check.`,
      [{ text: "Got it" }]
    );
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function submitScan() {
    if (images.length === 0) {
      Alert.alert("No Images", "Add at least one photo of the product label.");
      return;
    }
    setLoading(true);
    try {
      const endpoint = images.length > 1 ? "/scan/upload-multi" : "/scan/upload";
      const fieldName = images.length > 1 ? "files" : "file";
      const formData = new FormData();

      images.forEach((uri, i) => {
        const filename = uri.split("/").pop() || `label_${i}.jpg`;
        const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
        formData.append(fieldName, {
          uri, name: filename,
          type: ext === "png" ? "image/png" : "image/jpeg",
        } as any);
      });

      formData.append("category", category);
      if (shopName) formData.append("shop_name", shopName);
      if (location) formData.append("location", location);

      const res = await api.post(endpoint, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: "/result", params: { scan_id: res.data.scan_id, data: JSON.stringify(res.data) } });
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.detail || err?.message || "Scan failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Live barcode scanner overlay ───────────────────────────────────────────

  if (barcodeScanning) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "qr", "code128", "code39", "datamatrix"],
          }}
          onBarcodeScanned={onBarcodeScanned}
        />
        {/* Viewfinder overlay */}
        <View style={styles.scanOverlay} pointerEvents="none">
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.scanHint}>Point at barcode or QR code</Text>
        </View>
        <TouchableOpacity style={styles.scanCancelBtn} onPress={() => setBarcodeScanning(false)}>
          <Text style={styles.scanCancelText}>✕  Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main screen ────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <GovHeader title="Scan Product Label" subtitle="Legal Metrology (PC) Rules, 2011" />

      {/* Mode switcher tabs */}
      <View style={styles.modeTabs}>
        {(["label", "barcode"] as Mode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeTab, mode === m && styles.modeTabActive]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>
              {m === "label" ? "📷  Label Photos" : "📊  Barcode Scanner"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── BARCODE TAB ── */}
        {mode === "barcode" && (
          <View style={styles.barcodeSection}>
            <Text style={styles.barcodeSectionTitle}>Scan Barcode / QR Code</Text>
            <Text style={styles.barcodeSectionSub}>
              Barcodes often contain FSSAI licence numbers, product details and manufacturer info from the Open Food Facts database.
            </Text>

            {scannedBarcode ? (
              <View style={styles.barcodeResultCard}>
                <View style={styles.barcodeResultHeader}>
                  <Text style={styles.barcodeResultIcon}>✅</Text>
                  <Text style={styles.barcodeResultTitle}>Barcode Captured</Text>
                </View>
                <Text style={styles.barcodeResultValue} selectable>{scannedBarcode}</Text>
                <Text style={styles.barcodeResultNote}>
                  This code will be decoded and looked up automatically when you submit the scan. Switch to Label Photos to add label images.
                </Text>
                <TouchableOpacity style={styles.barcodeClearBtn} onPress={() => { setScannedBarcode(null); barcodeScanned.current = false; }}>
                  <Text style={styles.barcodeClearText}>✕  Clear & Re-scan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.barcodeScanBtn} onPress={startBarcodeScanner} activeOpacity={0.85}>
                <Text style={styles.barcodeScanBtnIcon}>📊</Text>
                <Text style={styles.barcodeScanBtnText}>Open Barcode Scanner</Text>
              </TouchableOpacity>
            )}

            <View style={styles.barcodeTip}>
              <Text style={styles.barcodeTipText}>
                💡 After scanning the barcode, switch to "Label Photos" to photograph the label for a complete compliance check.
              </Text>
            </View>
          </View>
        )}

        {/* ── LABEL PHOTOS TAB ── */}
        {mode === "label" && (
          <>
            {/* Barcode pill — visible when a barcode has been scanned */}
            {scannedBarcode && (
              <View style={styles.barcodePill}>
                <Text style={styles.barcodePillIcon}>📊</Text>
                <Text style={styles.barcodePillText} numberOfLines={1}>
                  {scannedBarcode.substring(0, 24)}{scannedBarcode.length > 24 ? "…" : ""}
                </Text>
                <TouchableOpacity onPress={() => { setScannedBarcode(null); barcodeScanned.current = false; }}>
                  <Text style={styles.barcodePillClear}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Image grid or placeholder */}
            {images.length === 0 ? (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderIcon}>📦</Text>
                <Text style={styles.placeholderTitle}>Add Label Photos</Text>
                <Text style={styles.placeholderSub}>
                  Capture front, back and side panels for best accuracy. Up to {MAX_IMAGES} photos.
                </Text>
              </View>
            ) : (
              <View>
                <Text style={styles.gridLabel}>
                  {images.length} photo{images.length > 1 ? "s" : ""} added
                  {images.length < MAX_IMAGES ? ` · up to ${MAX_IMAGES - images.length} more` : " · max reached"}
                </Text>
                <View style={styles.imageGrid}>
                  {images.map((uri, index) => (
                    <View key={index} style={styles.thumb}>
                      <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
                      <View style={styles.thumbLabel}>
                        <Text style={styles.thumbLabelText}>{PANEL_LABELS[index] || `Photo ${index + 1}`}</Text>
                      </View>
                      <TouchableOpacity style={styles.thumbRemove} onPress={() => removeImage(index)}>
                        <Text style={styles.thumbRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {canAddMore && (
                    <TouchableOpacity style={styles.addMoreThumb} onPress={addFromCamera}>
                      <Text style={styles.addMoreIcon}>+</Text>
                      <Text style={styles.addMoreText}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* Capture buttons */}
            <View style={styles.captureRow}>
              <TouchableOpacity
                style={[styles.captureBtn, !canAddMore && styles.captureBtnDisabled]}
                onPress={addFromCamera} disabled={!canAddMore} activeOpacity={0.8}>
                <Text style={styles.captureBtnIcon}>📷</Text>
                <Text style={styles.captureBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.captureBtn, styles.captureBtnSecondary, !canAddMore && styles.captureBtnDisabled]}
                onPress={addFromGallery} disabled={!canAddMore} activeOpacity={0.8}>
                <Text style={styles.captureBtnIcon}>🖼</Text>
                <Text style={[styles.captureBtnText, styles.captureBtnTextSecondary]}>Gallery</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tipsStrip}>
              <Text style={styles.tipsText}>
                💡 Tip: photograph each panel separately for better OCR accuracy
              </Text>
            </View>
          </>
        )}

        {/* Metadata — always visible */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scan Details</Text>

          <Text style={styles.fieldLabel}>Product Category</Text>
          <TouchableOpacity style={styles.select} onPress={() => setShowCategoryModal(true)} activeOpacity={0.8}>
            <Text style={styles.selectText}>{selectedCategory?.label || "General"}</Text>
            <Text style={styles.selectArrow}>▼</Text>
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>Shop / Establishment Name</Text>
          <TextInput style={styles.input} value={shopName} onChangeText={setShopName}
            placeholder="e.g. Ram General Store" placeholderTextColor={Colors.textMuted} />

          <Text style={styles.fieldLabel}>Location / Area</Text>
          <TextInput style={styles.input} value={location} onChangeText={setLocation}
            placeholder="e.g. Gandhi Nagar, Pune" placeholderTextColor={Colors.textMuted} />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (images.length === 0 || loading) && styles.submitBtnDisabled]}
          onPress={submitScan} disabled={images.length === 0 || loading} activeOpacity={0.85}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.white} size="small" />
              <Text style={styles.submitBtnText}>
                {"  "}Analysing {images.length} photo{images.length > 1 ? "s" : ""}…
              </Text>
            </View>
          ) : (
            <Text style={styles.submitBtnText}>
              🔍{"  "}Check Compliance{images.length > 1 ? ` (${images.length} photos)` : ""}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.note}>
          {images.length === 0
            ? "ⓘ Add label photos to check compliance."
            : "ⓘ OCR analysis may take 5–20 seconds depending on the number of images."}
        </Text>
      </ScrollView>

      {/* Category modal */}
      <Modal visible={showCategoryModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <FlatList
              data={PRODUCT_CATEGORIES}
              keyExtractor={(i) => i.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalOption, item.value === category && styles.modalOptionActive]}
                  onPress={() => { setCategory(item.value); setShowCategoryModal(false); }}
                >
                  <Text style={[styles.modalOptionText, item.value === category && styles.modalOptionTextActive]}>
                    {item.label}
                  </Text>
                  {item.value === category && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 16, paddingBottom: 32 },

  // Mode tabs
  modeTabs: {
    flexDirection: "row",
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modeTab: {
    flex: 1, paddingVertical: 12, alignItems: "center",
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  modeTabActive: { borderBottomColor: Colors.primary },
  modeTabText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  modeTabTextActive: { color: Colors.primary },

  // Barcode section
  barcodeSection: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 20,
    marginBottom: 16, borderWidth: 1, borderColor: Colors.border,
  },
  barcodeSectionTitle: { fontSize: 16, fontWeight: "700", color: Colors.text, marginBottom: 6 },
  barcodeSectionSub: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 20 },
  barcodeScanBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 18, alignItems: "center", gap: 8,
  },
  barcodeScanBtnIcon: { fontSize: 32 },
  barcodeScanBtnText: { color: Colors.white, fontSize: 16, fontWeight: "700" },
  barcodeResultCard: {
    backgroundColor: Colors.successLight, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: "#a8d5b5",
  },
  barcodeResultHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  barcodeResultIcon: { fontSize: 20 },
  barcodeResultTitle: { fontSize: 14, fontWeight: "700", color: Colors.success },
  barcodeResultValue: {
    fontSize: 15, fontFamily: "monospace", fontWeight: "700",
    color: Colors.text, marginBottom: 8, letterSpacing: 0.5,
  },
  barcodeResultNote: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 12 },
  barcodeClearBtn: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 8,
    paddingVertical: 8, alignItems: "center",
  },
  barcodeClearText: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600" },
  barcodeTip: {
    backgroundColor: "#fffbe6", borderRadius: 8, padding: 10,
    marginTop: 16, borderWidth: 1, borderColor: "#ffe58f",
  },
  barcodeTipText: { fontSize: 12, color: "#7c5500", lineHeight: 17 },

  // Barcode pill (visible in label tab when a barcode is already scanned)
  barcodePill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.primaryLight, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    marginBottom: 12, borderWidth: 1, borderColor: "#c3d9ff",
  },
  barcodePillIcon: { fontSize: 14 },
  barcodePillText: { flex: 1, fontSize: 12, fontWeight: "600", color: Colors.primary, fontFamily: "monospace" },
  barcodePillClear: { fontSize: 14, color: Colors.textMuted, fontWeight: "700" },

  // Camera scanner overlay
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
  },
  scanFrame: {
    width: 240, height: 160, position: "relative",
  },
  corner: {
    position: "absolute", width: 24, height: 24,
    borderColor: Colors.accent, borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scanHint: {
    color: Colors.white, fontSize: 13, fontWeight: "600",
    marginTop: 20, textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  scanCancelBtn: {
    position: "absolute", bottom: 48, alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 24,
    paddingVertical: 12, borderRadius: 24,
  },
  scanCancelText: { color: Colors.white, fontSize: 15, fontWeight: "700" },

  // Placeholder
  placeholder: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 2, borderColor: Colors.border, borderStyle: "dashed",
    alignItems: "center", padding: 32, marginBottom: 16,
  },
  placeholderIcon: { fontSize: 52, marginBottom: 12 },
  placeholderTitle: { fontSize: 16, fontWeight: "700", color: Colors.text, marginBottom: 6 },
  placeholderSub: { fontSize: 12, color: Colors.textSecondary, textAlign: "center", lineHeight: 18 },

  // Image grid
  gridLabel: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary, marginBottom: 8 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  thumb: { width: "30%", aspectRatio: 1, borderRadius: 10, overflow: "hidden", position: "relative", backgroundColor: Colors.border },
  thumbImg: { width: "100%", height: "100%" },
  thumbLabel: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 3, alignItems: "center" },
  thumbLabelText: { color: Colors.white, fontSize: 10, fontWeight: "700" },
  thumbRemove: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.55)", width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  thumbRemoveText: { color: Colors.white, fontSize: 11, fontWeight: "700", lineHeight: 14 },
  addMoreThumb: { width: "30%", aspectRatio: 1, borderRadius: 10, borderWidth: 2, borderColor: Colors.primary, borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: Colors.primaryLight },
  addMoreIcon: { fontSize: 24, color: Colors.primary, fontWeight: "700" },
  addMoreText: { fontSize: 11, color: Colors.primary, fontWeight: "600", marginTop: 2 },

  // Capture buttons
  captureRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  captureBtn: { flex: 1, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  captureBtnSecondary: { backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.primary },
  captureBtnDisabled: { opacity: 0.35 },
  captureBtnIcon: { fontSize: 20 },
  captureBtnText: { fontSize: 14, fontWeight: "700", color: Colors.white },
  captureBtnTextSecondary: { color: Colors.primary },

  // Tips strip
  tipsStrip: { backgroundColor: "#fffbe6", borderRadius: 8, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: "#ffe58f" },
  tipsText: { fontSize: 12, color: "#7c5500", lineHeight: 17 },

  // Form section
  section: { backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 20, elevation: 1 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: Colors.text, marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldLabel: { fontSize: 11, fontWeight: "600", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  select: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1.5, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Colors.offWhite, marginBottom: 14 },
  selectText: { fontSize: 14, color: Colors.text },
  selectArrow: { fontSize: 10, color: Colors.textMuted },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: Colors.text, backgroundColor: Colors.offWhite, marginBottom: 14 },

  // Submit
  submitBtn: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", marginBottom: 12, elevation: 2 },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: Colors.white, fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  loadingRow: { flexDirection: "row", alignItems: "center" },
  note: { fontSize: 11, color: Colors.textMuted, textAlign: "center", lineHeight: 16, marginBottom: 8 },

  // Category modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "60%" },
  modalTitle: { fontSize: 16, fontWeight: "700", color: Colors.text, marginBottom: 16, textAlign: "center" },
  modalOption: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4 },
  modalOptionActive: { backgroundColor: Colors.primaryLight },
  modalOptionText: { fontSize: 15, color: Colors.text },
  modalOptionTextActive: { color: Colors.primary, fontWeight: "700" },
  checkmark: { color: Colors.primary, fontWeight: "700", fontSize: 16 },
});
