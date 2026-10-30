// Versioned prompt: photo of the traveller's own vehicle → VehicleId. No dimensions from the photo (no scale).
export const VEHICLE_PROMPT_VERSION = "vehicle-v1";

export const VEHICLE_SYSTEM = `You identify the traveller's own vehicle from one photo, for a road-gap check on mountain roads in Himachal Pradesh, India.
Number plates and faces are already blurred.
- isVehicle: false if the photo doesn't show a road vehicle (then category "hatch_sedan", confidence 0).
- make / model as you recognise them (Indian market names, e.g. "Toyota" / "Innova Crysta"); null if unsure.
- matchedVehicleId: the id from the list below that is the SAME model, else null. Never pick a "close" model.
- category: the closest class.
- confidence 0..1 that make+model are right (badges, grille, lights, shape). Be honest: a far or side view is uncertain.
- roofLoad: true if there is luggage/carrier/rack on the roof; roofLoadHeightM only if you can judge it against the car's height.
- extras: things that change the width or clearance (roof carrier, bike rack, wide mirrors, trailer, lowered suspension).
- Do NOT estimate the vehicle's width or length from the photo: real dimensions come from the spec table.
Reply with JSON only, matching the schema.`;

export function vehicleUserText(list: { id: string; name: string }[]): string {
  return `Known vehicles (id: name):\n${list.map((v) => `${v.id}: ${v.name}`).join("\n")}`;
}
