export type IntegratablePoint = {
  ts: number;
  power: number;
  energy?: number;
  deviceId?: string;
  id?: string;
};

/** Normalize power reading: Firebase may send kW (0.9) or watts (900). */
export function normalizePowerW(p: number): number {
  if (p > 0 && p < 50) return p * 1000;
  return p;
}

/** Fixed UTC+3 offset for East Africa Time (no DST). */
export const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

export function alignBucketStartEat(ts: number, bucketMs: number): number {
  return Math.floor((ts + EAT_OFFSET_MS) / bucketMs) * bucketMs - EAT_OFFSET_MS;
}

export function getEatHour(ts: number): number {
  return new Date(ts + EAT_OFFSET_MS).getUTCHours();
}

export function dedupeTelemetryPoints<T extends IntegratablePoint>(points: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const point of points) {
    const key = `${point.deviceId ?? ""}:${point.ts}`;
    byKey.set(key, point);
  }
  return Array.from(byKey.values()).sort((a, b) => a.ts - b.ts);
}

export function integrateKwhBetween(
  points: IntegratablePoint[],
  startMs: number,
  endMs: number,
): number {
  if (endMs <= startMs || points.length < 2) return 0;
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  let kwh = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const segStart = Math.max(a.ts, startMs);
    const segEnd = Math.min(b.ts, endMs);
    if (segEnd <= segStart) continue;
    const dt = b.ts - a.ts;
    if (dt <= 0) continue;
    const powerAtStart = a.power + ((b.power - a.power) * (segStart - a.ts)) / dt;
    const powerAtEnd = a.power + ((b.power - a.power) * (segEnd - a.ts)) / dt;
    const deltaHours = (segEnd - segStart) / (3600 * 1000);
    kwh += ((powerAtStart + powerAtEnd) / 2 / 1000) * deltaHours;
  }
  return Math.max(0, kwh);
}

/** kWh in [startMs, endMs] using backend cumulative/daily energy field (e). */
export function energyDeltaKwhBetween(
  points: Array<{ ts: number; energy?: number }>,
  startMs: number,
  endMs: number,
): number | null {
  const withEnergy = points
    .filter((p) => typeof p.energy === "number" && Number.isFinite(p.energy) && p.energy > 0)
    .sort((a, b) => a.ts - b.ts);
  if (!withEnergy.length) return null;

  const inWindow = withEnergy.filter((p) => p.ts >= startMs && p.ts <= endMs);
  const before = withEnergy.filter((p) => p.ts < startMs);
  const baseline = before.length ? before[before.length - 1].energy! : undefined;

  if (inWindow.length >= 2) {
    const startEnergy = baseline ?? inWindow[0].energy!;
    return Math.max(0, inWindow[inWindow.length - 1].energy! - startEnergy);
  }
  if (inWindow.length === 1) {
    const reading = inWindow[0].energy!;
    if (baseline !== undefined) return Math.max(0, reading - baseline);
    return reading;
  }
  return null;
}

/** Prefer backend energy (e) readings; fall back to power integration only when energy is missing. */
export function resolveKwhBetween(
  points: IntegratablePoint[],
  startMs: number,
  endMs: number,
): number {
  const energyKwh = energyDeltaKwhBetween(points, startMs, endMs);
  if (energyKwh !== null && energyKwh > 0) return energyKwh;
  const powerKwh = integrateKwhBetween(points, startMs, endMs);
  if (powerKwh > 0) return powerKwh;
  return 0;
}

export function bucketIntegratedKwh(
  points: IntegratablePoint[],
  bucketMs: number,
  startMs: number,
  endMs: number,
  alignEat = false,
): Array<{ bucketStart: number; kwh: number }> {
  const result: Array<{ bucketStart: number; kwh: number }> = [];
  const alignedStart = alignEat
    ? alignBucketStartEat(startMs, bucketMs)
    : Math.floor(startMs / bucketMs) * bucketMs;
  for (let t = alignedStart; t < endMs; t += bucketMs) {
    const bucketEnd = Math.min(t + bucketMs, endMs);
    result.push({ bucketStart: t, kwh: resolveKwhBetween(points, t, bucketEnd) });
  }
  return result;
}

export function pointKwhAtIndex(points: IntegratablePoint[], index: number): number {
  if (index < 0 || index >= points.length) return 0;
  const a = points[index];
  const b = points[index + 1];
  if (b) {
    if (typeof a.energy === "number" && typeof b.energy === "number" && b.energy >= a.energy) {
      return b.energy - a.energy;
    }
    const deltaHours = (b.ts - a.ts) / (3600 * 1000);
    if (deltaHours > 0) {
      const powerKwh = Math.max(0, ((a.power + b.power) / 2 / 1000) * deltaHours);
      if (powerKwh > 0) return powerKwh;
    }
  }
  if (typeof a.energy === "number" && a.energy > 0) return a.energy;
  return 0;
}

export function buildDeviceTelemetryIndex(
  points: IntegratablePoint[],
): Map<string, IntegratablePoint[]> {
  const map = new Map<string, IntegratablePoint[]>();
  for (const point of points) {
    const id = point.deviceId ?? "unknown";
    const list = map.get(id) ?? [];
    list.push(point);
    map.set(id, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.ts - b.ts);
  return map;
}

export function rowKwhFromDeviceIndex(
  deviceIndex: Map<string, IntegratablePoint[]>,
  point: IntegratablePoint & { energy?: number },
): number {
  const list = deviceIndex.get(point.deviceId ?? "unknown");
  if (!list?.length) {
    return typeof point.energy === "number" && point.energy > 0 ? point.energy : 0;
  }
  if (list.length < 2) {
    const match = list.find((p) => p.ts === point.ts);
    if (match && typeof match.energy === "number" && match.energy > 0) return match.energy;
    return typeof point.energy === "number" && point.energy > 0 ? point.energy : 0;
  }
  const idx = list.findIndex((p) => p.ts === point.ts && (p.id === point.id || !point.id));
  if (idx < 0) return typeof point.energy === "number" && point.energy > 0 ? point.energy : 0;
  return pointKwhAtIndex(list, idx);
}
