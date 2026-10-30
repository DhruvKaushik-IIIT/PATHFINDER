// "PWD-MANDI-DEMO" → the synthetic login email behind it. Officials only ever type their Department ID;
// the .invalid domain can never receive mail, so nothing is ever sent to it.
export function deptEmail(deptId: string): string {
  return `${deptId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")}@officials.pathfinder.invalid`;
}

/** The judges' demo account (public on the login screen by design; created by `pnpm create-official`). */
export const DEMO_OFFICIAL = { dept: "PWD-MANDI-DEMO", name: "PWD Mandi (demo)", district: "Mandi", role: "official", password: "himachal-demo" } as const;
