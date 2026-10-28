// Client-safe shapes for GET /api/route (Phase 2). Times are ISO strings; format on the client (IST).
import type { LineString } from "geojson";
import type { MapEvent } from "@/lib/events/types";

export type Verdict = "go" | "go_with_care" | "delay" | "avoid";

export interface RouteEvent extends MapEvent {
  order: number;
  alongKm: number;
  /** When you'd reach it, including delays from earlier events on the route. */
  etaAt: string;
  delayMin: number;
  blocks: boolean;
}

export interface RouteLeg {
  insideHp: boolean;
  distanceKm: number;
  durationMin: number;
  fromName: string | null;
  toName: string | null;
}

export interface CodeVerdict {
  verdict: Verdict;
  /** Short pill text: "All clear", "One lane at Aut", "Himachal stretch: closed at Kataula". */
  pill: string;
  /** "Arrive ~6:40 PM" style headline (time filled in on the client from arriveAt). */
  headline: string;
  detail: string;
}

export interface RouteOption {
  id: string;
  distanceKm: number;
  /** Drive time without event delays (OSRM + hill-road correction inside HP). */
  driveMin: number;
  delayMin: number;
  totalMin: number;
  arriveAt: string;
  viaRoads: string[];
  viaTowns: string[];
  geometry: LineString;
  legs: RouteLeg[];
  hp: { insideKm: number; outsideKm: number; entry: string | null };
  events: RouteEvent[];
  blocked: boolean;
  recommended: boolean;
  verdict: CodeVerdict;
}

export interface RoutePlan {
  from: { name: string; lat: number; lng: number };
  to: { name: string; lat: number; lng: number };
  departAt: string;
  checkedAt: string;
  routes: RouteOption[];
  /** e.g. "Pathfinder checks roads in Himachal Pradesh only" */
  note: string | null;
  timeModel: string;
}
