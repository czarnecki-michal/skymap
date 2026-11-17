import { exifToUtc, type ExifDate } from "./exif";
import { polygonToSky, skyToPolygon, type Poly } from "./obstructions";
import type { WindowGeometry } from "./projection";
import type { CardData } from "./scene";
import { solveGeometry, type Match } from "./solver";

export type Step = "photo" | "method" | "stars" | "compass" | "obstructions" | "preview";

export interface WizardPhoto {
  blob?: Blob; // new file chosen in this session
  blobUrl?: string; // preview URL (new or existing photo)
  aspect?: number;
  time?: Date;
  needsTime: boolean;
  deleted: boolean;
}

export interface WizardState {
  step: Step;
  photo: WizardPhoto;
  method?: "stars" | "compass";
  geometry: WindowGeometry;
  matches: Match[];
  polys: Poly[]; // obstructions in normalised frame coordinates
  opacity: number;
  error: string;
}

export function initWizard(data: CardData, existingPhotoUrl: string): WizardState {
  return {
    step: "photo",
    photo: { blobUrl: existingPhotoUrl || undefined, needsTime: false, deleted: false },
    geometry: { ...data.geometry },
    matches: [],
    polys: data.obstructions.map((p) => skyToPolygon(data.geometry, p)).filter((p) => p.length >= 3),
    opacity: data.photo_opacity ?? 0.6,
    error: "",
  };
}

export function setPhoto(
  s: WizardState,
  p: { blob: Blob; blobUrl: string; aspect: number; exif: ExifDate | null; timeZone: string },
): WizardState {
  const time = p.exif ? exifToUtc(p.exif, p.timeZone) : undefined;
  return {
    ...s,
    photo: { blob: p.blob, blobUrl: p.blobUrl, aspect: p.aspect, time, needsTime: !time, deleted: false },
    geometry: { ...s.geometry, aspect: p.aspect },
    matches: [],
    error: "",
  };
}

export function setPhotoTime(s: WizardState, time: Date): WizardState {
  return { ...s, photo: { ...s.photo, time, needsTime: false } };
}

export function skipPhoto(s: WizardState): WizardState {
  return { ...s, photo: { needsTime: false, deleted: s.photo.deleted || !!s.photo.blobUrl, blobUrl: undefined } };
}

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;

/** Error message for a file the integration would reject, or null when it is fine. */
export function validatePhotoFile(f: { type: string; size: number }): string | null {
  if (!PHOTO_TYPES.includes(f.type)) return "Ten format nie jest obsługiwany (np. HEIC) – zapisz zdjęcie jako JPEG, PNG lub WebP.";
  if (f.size > PHOTO_MAX_BYTES) return "Zdjęcie jest za duże (maks. 15 MB).";
  return null;
}

/** "YYYY-MM-DDTHH:MM" typed by the user, read in the HA time zone. */
export function parseLocalInput(v: string, timeZone: string): Date {
  const [d, t] = v.split("T");
  return exifToUtc({ local: `${d.replaceAll("-", ":")} ${t.slice(0, 5)}:00`, offset: null }, timeZone);
}

export function formatLocalInput(d: Date, timeZone: string): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export const hasPhoto = (s: WizardState) => !!s.photo.blobUrl && !s.photo.deleted;

export function canNext(s: WizardState): boolean {
  if (s.step === "photo") return !(hasPhoto(s) && s.photo.blob && s.photo.needsTime);
  if (s.step === "stars") return s.matches.length > 0 && !s.error;
  return s.step !== "preview";
}

const ORDER: Record<Step, (s: WizardState) => Step> = {
  photo: (s) => (hasPhoto(s) ? "method" : "compass"),
  method: (s) => (s.method === "stars" ? "stars" : "compass"),
  stars: () => "obstructions",
  compass: () => "obstructions",
  obstructions: () => "preview",
  preview: () => "preview",
};

export function next(s: WizardState): WizardState {
  if (!canNext(s)) return s;
  const step = ORDER[s.step](s);
  return { ...s, step, method: step === "compass" ? "compass" : s.method, error: "" };
}

export function back(s: WizardState): WizardState {
  const prev: Record<Step, Step> = {
    photo: "photo",
    method: "photo",
    stars: "method",
    compass: hasPhoto(s) ? "method" : "photo",
    obstructions: s.method === "stars" ? "stars" : "compass",
    preview: "obstructions",
  };
  return { ...s, step: prev[s.step], error: "" };
}

export function chooseMethod(s: WizardState, method: "stars" | "compass"): WizardState {
  if (method === "stars" && !s.photo.time) {
    return { ...s, error: "Do kalibracji po gwiazdach podaj godzinę zrobienia zdjęcia (krok Zdjęcie)." };
  }
  return next({ ...s, method });
}

/** Add a clicked object (max 2 – a third replaces the oldest) and re-solve. */
export function addMatch(s: WizardState, m: Match): WizardState {
  const matches = [...s.matches, m].slice(-2);
  const r = solveGeometry(s.geometry, matches);
  if ("fail" in r) return { ...s, error: r.fail };
  return { ...s, matches, geometry: r.geometry, error: "" };
}

export function clearMatches(s: WizardState): WizardState {
  return { ...s, matches: [], error: "" };
}

/** Frame altitude that puts the horizon at normalised height y (roll ignored). */
export function horizonToAlt(g: WindowGeometry, y: number): number {
  const th = Math.tan((g.hfov * Math.PI) / 360);
  return (Math.atan(((y - 0.5) * 2 * th) / g.aspect) * 180) / Math.PI;
}

export function altToHorizon(g: WindowGeometry): number {
  const th = Math.tan((g.hfov * Math.PI) / 360);
  return 0.5 + (Math.tan((g.alt_center * Math.PI) / 180) * g.aspect) / (2 * th);
}

export function savePayload(s: WizardState) {
  return {
    geometry: s.geometry,
    obstructions: s.polys.filter((p) => p.length >= 3).map((p) => polygonToSky(s.geometry, p, 1)),
    photo_opacity: s.opacity,
  };
}
