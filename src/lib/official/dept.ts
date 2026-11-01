// "PWD-MANDI-DEMO" → the synthetic login email behind it. Officials only ever type their Department ID;
// the .invalid domain can never receive mail, so nothing is ever sent to it.
export function deptEmail(deptId: string): string {
  return `${deptId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")}@officials.pathfinder.invalid`;
}

/** The judges' demo account (public on the login screen by design; created by `pnpm create-official`). */
export const DEMO_OFFICIAL = { dept: "PWD-MANDI-DEMO", name: "PWD Mandi (demo)", district: "Mandi", role: "official", password: "himachal-demo" } as const;

/**
 * The judges' demo CREW account (Option B): Neelam Thakur, a free on-duty supervisor near Kamand — the crew
 * builder picks her for the Kataula slide, so the demo shows the job arriving on her phone
 * (`pnpm seed-crews` + `pnpm create-official --crew-demo`).
 */
export const DEMO_CREW = { dept: "CREW-MANDI-DEMO", name: "Neelam Thakur", district: "Mandi", role: "crew", password: "himachal-crew", userId: "00000000-0000-4000-b000-000000000010" } as const;
