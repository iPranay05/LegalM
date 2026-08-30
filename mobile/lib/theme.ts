// ─────────────────────────────────────────────────────────────────────────────
// LegalM Design System — Mobile
// Ported 1:1 from the web app's design tokens (see legalm_design_system/DESIGN.md
// and web/app/globals.css) so the mobile app feels like the same product.
// Colors and spacing are copied verbatim; typography sizes/weights match the
// web scale. Font family falls back to the OS system font (San Francisco /
// Roboto) since Inter/JetBrains Mono aren't bundled — install
// `expo-font` + `@expo-google-fonts/inter` and wire it into app/_layout.tsx
// if pixel-perfect brand typography is required.
// ─────────────────────────────────────────────────────────────────────────────
import { Platform } from "react-native";

export const Colors = {
  // Core surfaces
  background: "#f8fafc", // bg-offset
  surface: "#f8f9ff",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#eff4ff",
  surfaceContainer: "#e5eeff",
  surfaceContainerHigh: "#dce9ff",
  surfaceContainerHighest: "#d3e4fe",

  // Text
  onSurface: "#0b1c30",
  onSurfaceVariant: "#44474e",
  onSurfaceMuted: "#74777f",

  // Brand
  primary: "#000a1e", // Deep Navy — headers, primary actions
  onPrimary: "#ffffff",
  primaryContainer: "#002147",
  secondary: "#115cb9", // Government Blue — active/interactive
  onSecondary: "#ffffff",
  secondaryContainer: "#659dfe",
  onSecondaryContainer: "#003370",

  // Semantic status
  statusPass: "#10b981",
  statusReview: "#f59e0b",
  statusFail: "#ef4444",

  // Neutrals / borders
  outline: "#74777f",
  outlineVariant: "#c4c6cf",
  borderSubtle: "#e2e8f0",
  white: "#ffffff",
};

// 10%-opacity "light fill" backgrounds for status badges, matching the web's
// bg-status-x/10 utility classes.
export const StatusTint = {
  pass: "rgba(16,185,129,0.12)",
  review: "rgba(245,158,11,0.14)",
  fail: "rgba(239,68,68,0.12)",
  neutral: "rgba(116,119,127,0.10)",
};

export const Radius = {
  sm: 4,
  DEFAULT: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Spacing = {
  unit: 4,
  sm: 8,
  md: 16,
  lg: 24,
  screenPadding: 16,
};

const systemFont = Platform.select({ ios: undefined, android: undefined, default: undefined });
const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export const Type = {
  headlineLg: { fontFamily: systemFont, fontSize: 24, fontWeight: "700" as const, lineHeight: 30 },
  headlineMd: { fontFamily: systemFont, fontSize: 20, fontWeight: "700" as const, lineHeight: 26 },
  headlineSm: { fontFamily: systemFont, fontSize: 16, fontWeight: "700" as const, lineHeight: 22 },
  bodyLg: { fontFamily: systemFont, fontSize: 16, fontWeight: "400" as const, lineHeight: 22 },
  bodyMd: { fontFamily: systemFont, fontSize: 14, fontWeight: "400" as const, lineHeight: 20 },
  labelCaps: { fontFamily: systemFont, fontSize: 11, fontWeight: "700" as const, lineHeight: 14, letterSpacing: 0.6 },
  dataMono: { fontFamily: monoFont, fontSize: 12, fontWeight: "500" as const, lineHeight: 16 },
};

export function statusColor(status: "pass" | "review" | "fail" | "neutral") {
  switch (status) {
    case "pass": return Colors.statusPass;
    case "review": return Colors.statusReview;
    case "fail": return Colors.statusFail;
    default: return Colors.onSurfaceMuted;
  }
}

export function scoreColor(score: number) {
  if (score >= 80) return Colors.statusPass;
  if (score >= 50) return Colors.statusReview;
  return Colors.statusFail;
}
