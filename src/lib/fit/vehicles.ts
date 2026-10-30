// Client-safe: the vehicle spec table (data/vehicles.json, Phase 6C) as typed helpers.
// Real dimensions come from here — never from a photo (a photo has no scale).
import data from "../../../data/vehicles.json" with { type: "json" };
import type { Range } from "./types.ts";

export type VehicleCategory = "bike" | "small_car" | "hatch_sedan" | "suv" | "mpv" | "van" | "pickup" | "bus" | "truck";

export interface VehicleSpec {
  id: string;
  make: string;
  model: string;
  category: VehicleCategory;
  widthMm: number;
  lengthMm: number;
  clearanceMm: number | null;
  fourByFour: boolean;
  sources: string[];
}

export interface CategorySpec {
  id: VehicleCategory;
  label: string;
  widthM: Range;
  lengthM: Range;
  clearanceMm: Range;
}

export const VEHICLES = data.vehicles as VehicleSpec[];
export const CATEGORIES = data.categories as CategorySpec[];
export const MIRRORS_M = data.mirrorAllowanceM as Record<VehicleCategory, number>;
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [VehicleCategory, ...VehicleCategory[]];

export const vehicleById = (id: string | null | undefined) => VEHICLES.find((v) => v.id === id) ?? null;
export const categoryById = (id: string | null | undefined) => CATEGORIES.find((c) => c.id === id) ?? null;
export const vehicleName = (v: VehicleSpec) => `${v.make} ${v.model}`;
