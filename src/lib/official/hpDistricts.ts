// Client-safe: Himachal Pradesh's 12 districts for the office sign-in picker. `key` matches the
// district stored on an official's account (lib/official/districts.ts names "Lahaul-Spiti").
export const HP_DISTRICTS = [
  { name: "Bilaspur", key: "Bilaspur" },
  { name: "Chamba", key: "Chamba" },
  { name: "Hamirpur", key: "Hamirpur" },
  { name: "Kangra", key: "Kangra" },
  { name: "Kinnaur", key: "Kinnaur" },
  { name: "Kullu", key: "Kullu" },
  { name: "Lahaul and Spiti", key: "Lahaul-Spiti" },
  { name: "Mandi", key: "Mandi" },
  { name: "Shimla", key: "Shimla" },
  { name: "Sirmaur", key: "Sirmaur" },
  { name: "Solan", key: "Solan" },
  { name: "Una", key: "Una" },
] as const;

export const sameDistrict = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").toLowerCase().replace(/[^a-z]/g, "").replace("and", "") === (b ?? "").toLowerCase().replace(/[^a-z]/g, "").replace("and", "");
