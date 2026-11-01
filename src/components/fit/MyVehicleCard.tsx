"use client";

// "My vehicle" on /me: see, change or remove the vehicle saved on this phone (localStorage, no account).
// Route rows show "Your Alto: fits / tight / won't fit" for it.
import { Car } from "lucide-react";
import { useEffect, useState } from "react";
import { clearSavedVehicle, loadSavedVehicle, saveVehicle, type SavedVehicle } from "@/lib/fit/saved";
import { CATEGORIES, VEHICLES, categoryById, vehicleById, vehicleName } from "@/lib/fit/vehicles";

/** "v:alto-k10" / "c:suv" → a SavedVehicle (null when unknown). */
export function toSaved(pick: string, roofLoad: boolean): SavedVehicle | null {
  if (pick.startsWith("v:")) {
    const v = vehicleById(pick.slice(2));
    return v ? { vehicleId: v.id, category: v.category, roofLoad, name: vehicleName(v) } : null;
  }
  const c = categoryById(pick.slice(2));
  return c ? { vehicleId: null, category: c.id, roofLoad, name: c.label } : null;
}
export const pickOf = (s: SavedVehicle) => (s.vehicleId ? `v:${s.vehicleId}` : `c:${s.category}`);

export function VehicleSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-[44px] w-full rounded-[10px] bg-white/80 px-2 text-[16px] text-ink">
      <option value="">Choose…</option>
      {CATEGORIES.map((c) => (
        <optgroup key={c.id} label={c.label}>
          {VEHICLES.filter((v) => v.category === c.id).map((v) => (
            <option key={v.id} value={`v:${v.id}`}>
              {vehicleName(v)}
            </option>
          ))}
          <option value={`c:${c.id}`}>Other {c.label.toLowerCase()} (typical size)</option>
        </optgroup>
      ))}
    </select>
  );
}

export default function MyVehicleCard() {
  const [saved, setSaved] = useState<SavedVehicle | null>(null);
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState("");
  const [roof, setRoof] = useState(false);
  useEffect(() => setSaved(loadSavedVehicle()), []);

  function startEdit() {
    setPick(saved ? pickOf(saved) : "");
    setRoof(saved?.roofLoad ?? false);
    setEditing(true);
  }
  function commit() {
    const v = toSaved(pick, roof);
    if (v && saveVehicle(v)) setSaved(v);
    setEditing(false);
  }
  function remove() {
    clearSavedVehicle();
    setSaved(null);
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-white/84 px-[14px] py-3">
      <div className="flex items-center gap-3">
        <Car size={20} strokeWidth={2} className="shrink-0 text-accent" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px]">My vehicle</span>
          <span className="truncate text-[12px] text-ink-2">
            {saved ? `${saved.name}${saved.roofLoad ? " · roof load" : ""} · route rows show if it fits` : "Not set · save one to see if it fits on each route"}
          </span>
        </span>
        {!editing && (
          <button type="button" onClick={startEdit} className="-my-2 h-11 shrink-0 px-1 text-[14px] font-semibold text-link">
            {saved ? "Change" : "Set"}
          </button>
        )}
      </div>
      {editing && (
        <div className="flex flex-col gap-2">
          <label className="sr-only" htmlFor="my-vehicle">
            Vehicle
          </label>
          <VehicleSelect id="my-vehicle" value={pick} onChange={setPick} />
          <label className="flex min-h-[44px] items-center justify-between gap-3 text-[15px]">
            Luggage or carrier on the roof
            <input type="checkbox" role="switch" checked={roof} onChange={(e) => setRoof(e.target.checked)} className="size-6 accent-[#0071E3]" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={!pick} onClick={commit} className="h-11 flex-1 rounded-[12px] bg-accent text-[15px] font-semibold text-white disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-11 flex-1 rounded-[12px] bg-accent-tint text-[15px] font-semibold text-accent-tint-ink">
              Cancel
            </button>
          </div>
          {saved && (
            <button type="button" onClick={remove} className="h-11 self-start px-1 text-[14px] font-semibold text-closed-ink">
              Remove my vehicle
            </button>
          )}
        </div>
      )}
    </div>
  );
}
