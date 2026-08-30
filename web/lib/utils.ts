import { format, parseISO } from "date-fns";
import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(iso: string, fmt = "dd MMM yyyy, hh:mm a") {
  try {
    // API timestamps are UTC but legacy records are serialized without a zone.
    // Explicitly treat those as UTC so the browser converts them to local time.
    const normalized = iso && !/[zZ]|[+-]\d\d:?\d\d$/.test(iso) && iso.includes("T") ? `${iso}Z` : iso;
    return format(parseISO(normalized), fmt);
  } catch {
    return iso;
  }
}

export function scoreColor(score: number): string {
  if (score >= 80) return "text-green-700";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
}

export function scoreBg(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 50) return "bg-yellow-400";
  return "bg-red-500";
}

export function complianceBadgeClass(isCompliant: boolean | undefined): string {
  if (isCompliant === true) return "bg-green-100 text-green-800 border border-green-300";
  if (isCompliant === false) return "bg-red-100 text-red-800 border border-red-300";
  return "bg-gray-100 text-gray-600 border border-gray-300";
}
