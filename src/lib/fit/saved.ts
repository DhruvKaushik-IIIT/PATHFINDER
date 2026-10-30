// Client-only: "Save my vehicle" (Phase 6C) lives in localStorage on this device — no account, no schema change.
// The vehicle PHOTO is never saved anywhere; only which vehicle it is.
const KEY = "pf:vehicle";

export interface SavedVehicle {
  vehicleId: string | null;
  category: string | null;
  roofLoad: boolean;
  name: string;
}

export function loadSavedVehicle(): SavedVehicle | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedVehicle) : null;
  } catch {
    return null;
  }
}

export function saveVehicle(v: SavedVehicle): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedVehicle(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage blocked: nothing to clear
  }
}
