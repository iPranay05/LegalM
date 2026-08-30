/**
 * GPS Service
 *
 * Requests foreground location permission, gets the device's current
 * coordinates, and reverse-geocodes them to a human-readable address
 * using the Nominatim (OpenStreetMap) API — no API key required.
 *
 * The result is normalised to match the backend's scan fields:
 *   location  → "City, District" free-text  (→ Scan.location)
 *   state     → state name                  (→ Scan.state)
 *   district  → district / county name      (→ Scan.district)
 */
import * as Location from "expo-location";

export interface GpsResult {
  latitude: number;
  longitude: number;
  /** Human-readable "City, District" string for the scan location field */
  location: string;
  /** State name (e.g. "Maharashtra") */
  state: string;
  /** District / county (e.g. "Pune") */
  district: string;
  /** City or town name */
  city: string;
}

export type GpsError =
  | "permission_denied"
  | "location_unavailable"
  | "geocode_failed"
  | "timeout";

export interface GpsResponse {
  ok: true;
  data: GpsResult;
}
export interface GpsFailure {
  ok: false;
  error: GpsError;
  message: string;
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

/** Returns true if the app already has foreground location permission. */
export async function hasLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

/** Requests foreground location permission. Returns true if granted. */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

// ---------------------------------------------------------------------------
// Reverse geocoding via Nominatim
// ---------------------------------------------------------------------------

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  county?: string;
  state_district?: string;
  state?: string;
  country?: string;
}

async function reverseGeocode(
  lat: number,
  lon: number
): Promise<NominatimAddress | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        // Nominatim usage policy requires a descriptive User-Agent
        "User-Agent": "LegalM-Compliance-App/1.0 (in.gov.lmcompliance)",
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.address as NominatimAddress) ?? null;
  } catch {
    return null;
  }
}

function extractAddress(addr: NominatimAddress): {
  city: string;
  district: string;
  state: string;
} {
  const city =
    addr.city || addr.town || addr.village || addr.suburb || "";
  const district =
    addr.county || addr.state_district || city || "";
  const state = addr.state || "";
  return { city, district, state };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

const GPS_TIMEOUT_MS = 12_000;

/**
 * Get the inspector's current location as GPS coordinates + address fields.
 *
 * Flow:
 *   1. Check / request permission
 *   2. Get current position (high accuracy, 12s timeout)
 *   3. Reverse geocode via Nominatim
 *   4. Return normalised GpsResult
 */
export async function getCurrentLocation(): Promise<GpsResponse | GpsFailure> {
  // 1. Permission
  const granted = await requestLocationPermission();
  if (!granted) {
    return {
      ok: false,
      error: "permission_denied",
      message:
        "Location permission was denied. You can enter the location manually.",
    };
  }

  // 2. Position
  let coords: { latitude: number; longitude: number };
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), GPS_TIMEOUT_MS)
      ),
    ]);
    coords = (pos as Location.LocationObject).coords;
  } catch (err: any) {
    const isTimeout = err?.message === "timeout";
    return {
      ok: false,
      error: isTimeout ? "timeout" : "location_unavailable",
      message: isTimeout
        ? "Location timed out. You can enter it manually."
        : "Could not get your location. Try again or enter it manually.",
    };
  }

  const { latitude, longitude } = coords;

  // 3. Reverse geocode
  const addr = await reverseGeocode(latitude, longitude);
  if (!addr) {
    // Geocode failed but we still have coordinates — return them with an
    // empty address so the caller can show coords and let the inspector
    // fill in the text fields.
    return {
      ok: true,
      data: {
        latitude,
        longitude,
        location: "",
        state: "",
        district: "",
        city: "",
      },
    };
  }

  const { city, district, state } = extractAddress(addr);
  const locationString = [city, district].filter(Boolean).join(", ");

  return {
    ok: true,
    data: {
      latitude,
      longitude,
      location: locationString,
      state,
      district,
      city,
    },
  };
}
