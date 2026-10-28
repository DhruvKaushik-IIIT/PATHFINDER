// "PWD-MANDI-DEMO" → the synthetic login email behind it. Officials only ever type their Department ID;
// the .invalid domain can never receive mail, so nothing is ever sent to it.
export function deptEmail(deptId: string): string {
  return `${deptId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")}@officials.pathfinder.invalid`;
}
