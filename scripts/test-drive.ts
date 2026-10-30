// pnpm test:drive — Phase 6A pure-code checks (no network, no AI): route projection, Google/Apple
// hand-off waypoints + encoding, hazard thresholds, Road Watch diff, EN/HI messages.
import assert from "node:assert/strict";
import { googleMapsUrl, appleMapsUrl, pickWaypoints } from "../src/lib/drive/handoff.ts";
import { cumulative, pointAt, project, type Coord } from "../src/lib/drive/line.ts";
import { changeMessage, diffEvents, dueAnnouncements, hazardMessage, type DriveEvent } from "../src/lib/drive/hazards.ts";

let n = 0;
const ok = (name: string) => console.log(`✓ ${++n}. ${name}`);

// A straight "default" road north from Mandi and a "safe" route that bulges ~8 km east in the middle.
const line = (pts: Coord[], perSeg = 20): Coord[] =>
  pts.slice(1).flatMap((b, i) => {
    const a = pts[i]!;
    return Array.from({ length: perSeg }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / perSeg, a[1] + ((b[1] - a[1]) * k) / perSeg] as Coord);
  }).concat([pts[pts.length - 1]!]);
const straight = line([[76.93, 31.7], [76.93, 32.2]]);
const detour = line([[76.93, 31.7], [76.93, 31.85], [77.01, 31.95], [76.93, 32.05], [76.93, 32.2]]);

{
  const cum = cumulative(straight);
  const total = cum[cum.length - 1]!;
  assert.ok(Math.abs(total - 55.6) < 0.5, `length ${total}`);
  const p = project(straight, cum, [76.94, 31.95]);
  assert.ok(Math.abs(p.alongKm - 27.8) < 0.3 && Math.abs(p.offKm - 0.95) < 0.05, JSON.stringify(p));
  const mid = pointAt(straight, cum, total / 2);
  assert.ok(Math.abs(mid[1] - 31.95) < 0.001);
  ok(`projection: 55.6 km line, point 0.95 km off at km ${p.alongKm.toFixed(1)}`);
}

{
  const wps = pickWaypoints(detour, [straight]);
  assert.equal(wps.length, 1);
  assert.ok(Math.abs(wps[0]!.lat - 31.95) < 0.02 && wps[0]!.lng > 77.0, JSON.stringify(wps));
  ok(`one waypoint at the detour's far point (${wps[0]!.lat.toFixed(3)}, ${wps[0]!.lng.toFixed(3)}), stretch ${wps[0]!.stretchKm.toFixed(1)} km`);

  assert.deepEqual(pickWaypoints(straight, [straight]), []);
  assert.deepEqual(pickWaypoints(straight, []), []);
  ok("same road or no alternatives → no waypoints");

  // Two separate detours vs one alternative + a third alternative → still ≤ 3, in route order.
  const twoBulges = line([[76.93, 31.7], [77.0, 31.8], [76.93, 31.9], [76.93, 32.0], [77.0, 32.1], [76.93, 32.2]]);
  const w2 = pickWaypoints(twoBulges, [straight, line([[76.86, 31.7], [76.86, 32.2]])]);
  assert.ok(w2.length >= 2 && w2.length <= 3);
  assert.ok(w2.every((w, i) => i === 0 || w.km > w2[i - 1]!.km));
  ok(`two detours → ${w2.length} waypoints in route order (cap 3)`);

  const url = googleMapsUrl({ lat: 31.708, lng: 76.932 }, { lat: 32.243, lng: 77.189 }, wps);
  assert.ok(url.startsWith("https://www.google.com/maps/dir/?api=1&origin=31.70800%2C76.93200&destination=32.24300%2C77.18900"));
  assert.ok(url.includes("travelmode=driving") && url.includes("waypoints=31.9") && !url.includes("|") && !/waypoints=[^&]*,/.test(url));
  const url2 = googleMapsUrl({ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, w2);
  assert.ok(url2.includes("%7C"));
  ok("Google URL: comma → %2C, pipe → %7C");
  assert.equal(appleMapsUrl({ lat: 1, lng: 2 }, { lat: 3, lng: 4 }), "https://maps.apple.com/?saddr=1.00000%2C2.00000&daddr=3.00000%2C4.00000&dirflg=d");
  ok("Apple URL");
}

{
  const ev: DriveEvent[] = [
    { id: "aut", type: "landslide", status: "one_lane", placeName: "Aut", alongKm: 40 },
    { id: "pandoh", type: "traffic", status: "slow", placeName: "Pandoh", alongKm: 20 },
  ];
  const done = new Set<string>();
  assert.deepEqual(dueAnnouncements(ev, 10, done), []);
  const a = dueAnnouncements(ev, 15.2, done);
  assert.equal(a.length, 1);
  assert.equal(a[0]!.thresholdKm, 5);
  assert.deepEqual(dueAnnouncements(ev, 15.5, done), []);
  assert.equal(dueAnnouncements(ev, 19.2, done)[0]?.thresholdKm, 1);
  assert.deepEqual(dueAnnouncements(ev, 19.5, done), []);
  ok("5 km then 1 km, never repeated");
  // Jump straight inside 1 km (GPS gap) → only the 1 km alert, the 5 km one is skipped for good.
  const b = dueAnnouncements(ev, 39.5, done);
  assert.deepEqual(b.map((d) => d.thresholdKm), [1]);
  assert.deepEqual(dueAnnouncements(ev, 39.6, done), []);
  assert.deepEqual(dueAnnouncements(ev, 45, new Set()), [], "passed events are silent");
  ok("GPS gap inside 1 km → one alert; passed events silent");

  assert.equal(hazardMessage(ev[0]!, 4.2, "en"), "Landslide debris, one lane open, 4 kilometres ahead near Aut.");
  assert.equal(hazardMessage(ev[0]!, 0.8, "en"), "Landslide debris, one lane open, 800 metres ahead near Aut.");
  assert.equal(hazardMessage(ev[0]!, 1.1, "hi"), "आगे 1 किलोमीटर पर Aut के पास भूस्खलन, एक लेन खुली है।");
  ok(`messages: "${hazardMessage(ev[0]!, 4.2, "en")}" / "${hazardMessage(ev[0]!, 4.2, "hi")}"`);

  const prev = new Map(ev.map((e) => [e.id, e]));
  const next: DriveEvent[] = [
    { ...ev[0]!, status: "closed" },
    { id: "bajaura", type: "landslide", status: "closed", placeName: "Bajaura", alongKm: 60 },
  ];
  const ch = diffEvents(prev, next);
  assert.deepEqual(ch.map((c) => c.kind).sort(), ["cleared", "new", "status"]);
  const st = ch.find((c) => c.kind === "status")!;
  assert.equal(changeMessage(st, 12, "en"), "Road Watch: changed. Landslide debris, road closed, 12 kilometres ahead near Aut. It was one lane open.");
  ok(`Road Watch diff: new / status / cleared → "${changeMessage(ch.find((c) => c.kind === "new")!, 30, "en")}"`);
}

console.log(`\nAll ${n} drive checks passed.`);
