import { collection, collectionGroup, doc, limit, onSnapshot, orderBy, query, where, type Unsubscribe } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import { auth, db } from './firebase';

export type DeviceStatus = 'online' | 'offline' | 'fault' | 'stale';
export type CommandState = 'idle' | 'pending' | 'confirmed' | 'failed';

export type TelemetryPoint = {
  id: string;
  ts: number; // milliseconds
  power: number; // watts
  voltage?: number;
  current?: number;
  energy?: number;
  pf?: number;
  deviceId?: string;
  deviceName?: string;
};

export type Device = {
  id: string;
  name: string;
  site: string;
  status: DeviceStatus;
  relay: boolean;
  load: number;
  voltage: number;
  current: number;
  power_factor: number;
  todayKwh: number;
  lastSeen: string;
  command: CommandState;
  telemetry?: TelemetryPoint[];
};

export type Alert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  device: string;
  time: string;
  acknowledged: boolean;
};

export type Recommendation = {
  id: string;
  title: string;
  detail: string;
  device: string;
  savingKwh: number;
  savingTzs: number;
  co2SavedKg: number;
  priority: 'high' | 'medium' | 'low';
  category: string;
};

export type Incident = {
  id: string;
  title: string;
  device: string;
  severity: 'critical' | 'warning' | 'info';
  detected: string;
  duration: string;
  rootCause: string;
};

export type TouPeriod = 'peak' | 'standard' | 'offpeak';

export type PlatformSettings = {
  timezone: string;
  currency: 'TZS';
  tariffPerKwh: number;
  maxPower: number;
  maxDailyCost: number;
  maxDailyEnergy: number;
};

export const TARIFF_TZS_PER_KWH = 0;
export const TIMEZONE = 'Africa/Dar_es_Salaam (UTC+3)';
export const GRID_EMISSION_FACTOR_KGCO2_PER_KWH = 0.43;

const defaultPlatformSettings: PlatformSettings = {
  timezone: TIMEZONE,
  currency: 'TZS',
  tariffPerKwh: TARIFF_TZS_PER_KWH,
  maxPower: 10000,
  maxDailyCost: 50000,
  maxDailyEnergy: 200,
};

function normalizePlatformSettings(raw: Record<string, unknown> | null): PlatformSettings {
  return {
    timezone: String(raw?.timezone ?? defaultPlatformSettings.timezone),
    currency: 'TZS',
    tariffPerKwh: Number(raw?.tariffPerKwh ?? defaultPlatformSettings.tariffPerKwh),
    maxPower: Number(raw?.maxPower ?? defaultPlatformSettings.maxPower),
    maxDailyCost: Number(raw?.maxDailyCost ?? defaultPlatformSettings.maxDailyCost),
    maxDailyEnergy: Number(raw?.maxDailyEnergy ?? defaultPlatformSettings.maxDailyEnergy),
  };
}

export type TimeRange = 'hour' | 'day' | 'week' | 'month';

function getTimeRangeHours(range: TimeRange): number {
  switch (range) {
    case 'hour': return 1;
    case 'day': return 24;
    case 'week': return 7 * 24;
    case 'month': return 30 * 24;
  }
}

// Time-of-use tariff bands
export const touBands: { id: TouPeriod; label: string; window: string; multiplier: number }[] = [
  { id: 'peak', label: 'Peak', window: '18:00 – 22:00', multiplier: 1.35 },
  { id: 'standard', label: 'Standard', window: '06:00 – 18:00', multiplier: 1.0 },
  { id: 'offpeak', label: 'Off-peak', window: '22:00 – 06:00', multiplier: 0.72 },
];

export const periodOf = (hour: number): TouPeriod =>
  hour >= 18 && hour < 22 ? 'peak' : hour >= 6 && hour < 18 ? 'standard' : 'offpeak';

export const currency = (n: number) =>
  new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);

const STALE_MS = 5 * 60 * 1000;

function normalizeTimestamp(value: unknown): Date | null {
  if (!value) return null;
  const v = value as { toDate?: () => Date; seconds?: number };
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
  if (value instanceof Date) return value;
  return null;
}

function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.max(1, Math.round(diffMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function normalizeDevice(id: string, raw: Record<string, unknown>): Device {
  const telemetry = (raw.lastTelemetry || raw.telemetry || {}) as Record<string, unknown>;
  const updatedAt = normalizeTimestamp(telemetry.ts) || normalizeTimestamp(raw.updatedAt) || null;
  const stale = !!updatedAt && Date.now() - updatedAt.getTime() > STALE_MS;
  const isOnline = Boolean(raw.isOnline) && !stale;
  const desiredRelay = raw.desiredRelayState ? String(raw.desiredRelayState).toUpperCase() : null;
  const relayState = raw.relayState ? String(raw.relayState).toUpperCase() : null;
  const relay = relayState ? relayState === 'ON' : desiredRelay ? desiredRelay === 'ON' : Boolean(raw.isOn);
  const power = Number(telemetry.p ?? telemetry.power ?? raw.currentPower ?? 0);
  const voltage = Number(telemetry.v ?? telemetry.voltage ?? 0);
  const current = Number(telemetry.i ?? telemetry.current ?? 0);
  const energy = Number(telemetry.e ?? telemetry.energy ?? raw.energyToday ?? 0);
  const site = typeof raw.site === 'string' ? raw.site : 'Primary site';
  const status: DeviceStatus = !isOnline ? 'offline' : stale ? 'stale' : current > 0 && !relay ? 'fault' : 'online';

  return {
    id,
    name: String(raw.name ?? id),
    site,
    status,
    relay,
    load: Number((power / 1000).toFixed(1)),
    voltage,
    current,
    power_factor: Number(telemetry.pf ?? telemetry.powerFactor ?? 0.95),
    todayKwh: energy,
    lastSeen: updatedAt ? formatRelativeTime(updatedAt) : 'No telemetry',
    command: 'idle',
  };
}

function deriveCommandState(status?: string): CommandState {
  const value = String(status ?? 'idle').toLowerCase();
  if (value === 'pending') return 'pending';
  if (value === 'confirmed' || value === 'done' || value === 'success') return 'confirmed';
  if (value === 'failed') return 'failed';
  return 'idle';
}

function deriveAlerts(devices: Device[], commands: { deviceId: string; status: string }[]): Alert[] {
  const generated: Alert[] = [];

  devices.forEach((device) => {
    if (device.status === 'fault') {
      generated.push({ id: `${device.id}-fault`, severity: 'critical', title: 'Fault condition detected', device: `${device.id} · ${device.name}`, time: device.lastSeen, acknowledged: false });
    }
    if (device.status === 'stale') {
      generated.push({ id: `${device.id}-stale`, severity: 'warning', title: 'Telemetry stale', device: `${device.id} · ${device.name}`, time: device.lastSeen, acknowledged: false });
    }
    if (device.status === 'offline') {
      generated.push({ id: `${device.id}-offline`, severity: 'critical', title: 'Device unreachable', device: `${device.id} · ${device.name}`, time: device.lastSeen, acknowledged: false });
    }
  });

  commands.filter((cmd) => cmd.status === 'pending').forEach((cmd) => {
    generated.push({ id: `cmd-${cmd.deviceId}`, severity: 'info', title: 'Relay command pending confirmation', device: cmd.deviceId, time: 'Now', acknowledged: false });
  });

  return generated.length ? generated.slice(0, 8) : [];
}

export function useHydranetDashboardData() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [commands, setCommands] = useState<Array<{ deviceId: string; cmd: string; status: string; createdAtMs: number }>>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(defaultPlatformSettings);
  const [telemetryMap, setTelemetryMap] = useState<Map<string, TelemetryPoint[]>>(new Map());
  const commandsRef = useRef(commands);
  const devicesRef = useRef(devices);
  const telemetryMapRef = useRef(telemetryMap);
  const telemetryUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  useEffect(() => {
    commandsRef.current = commands;
    devicesRef.current = devices;
    telemetryMapRef.current = telemetryMap;
  }, [commands, devices, telemetryMap]);

  useEffect(() => {
    if (!db) {
      setDevices([]);
      setCommands([]);
      setPlatformSettings(defaultPlatformSettings);
      return undefined;
    }

    let unsubDevices: Unsubscribe | undefined;
    let unsubCommands: Unsubscribe | undefined;
    let unsubPlatform: Unsubscribe | undefined;
    let unsubscribeAuth: (() => void) | undefined;

    const attachTelemetryListener = (deviceId: string) => {
      const existing = telemetryUnsubsRef.current.get(deviceId);
      existing?.();

      const unsub = onSnapshot(
        query(collection(db, 'devices', deviceId, 'telemetry'), orderBy('ts', 'desc'), limit(72)),
        (snapshot) => {
          const deviceName = devicesRef.current.find((d) => d.id === deviceId)?.name ?? deviceId;
          const points = snapshot.docs
            .map((docSnap) => {
              const raw = docSnap.data() as Record<string, unknown>;
              const ts = normalizeTimestamp(raw.ts) ?? new Date();
              return {
                id: docSnap.id,
                ts: ts.getTime(),
                power: Number(raw.p ?? raw.power ?? 0),
                voltage: Number(raw.v ?? raw.voltage ?? 0),
                current: Number(raw.i ?? raw.current ?? 0),
                energy: Number(raw.e ?? raw.energy ?? 0),
                pf: Number(raw.pf ?? raw.powerFactor ?? 0.95),
                deviceId,
                deviceName,
              };
            })
            .sort((a, b) => a.ts - b.ts);

          setTelemetryMap((prev) => {
            const next = new Map(prev);
            next.set(deviceId, points);
            return next;
          });
        },
        (error) => {
          console.warn(`Unable to load telemetry for ${deviceId}:`, error);
          setTelemetryMap((prev) => {
            const next = new Map(prev);
            next.set(deviceId, []);
            return next;
          });
        },
      );
      telemetryUnsubsRef.current.set(deviceId, unsub);
    };

    const attachDeviceListener = () => {
      unsubDevices?.();

      unsubDevices = onSnapshot(
        collection(db, 'devices'),
        (snapshot) => {
          const commandMap = new Map(commandsRef.current.map((command) => [command.deviceId, command]));
          const next = snapshot.docs.map((docSnap) => {
            const raw = docSnap.data() as Record<string, unknown>;
            const normalized = normalizeDevice(docSnap.id, raw);
            const latest = commandMap.get(docSnap.id);
            if (latest) normalized.command = deriveCommandState(latest.status);
            normalized.telemetry = telemetryMapRef.current.get(docSnap.id) || [];
            return normalized;
          });

          setDevices(next);
          snapshot.docs.forEach((doc) => {
            attachTelemetryListener(doc.id);
          });
        },
        (error) => {
          console.warn('Unable to load devices from Firestore:', error);
          setDevices([]);
        },
      );
    };

    if (auth) {
      unsubscribeAuth = onAuthStateChanged(auth, () => {
        attachDeviceListener();
      });
    } else {
      attachDeviceListener();
    }

    unsubCommands = onSnapshot(
      query(collectionGroup(db, 'commands'), orderBy('createdAtMs', 'desc'), limit(100)),
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          const parent = docSnap.ref.parent.parent;
          return {
            deviceId: String(parent?.id ?? 'UNKNOWN'),
            cmd: String(raw.cmd ?? '').toUpperCase(),
            status: String(raw.status ?? 'pending').toLowerCase(),
            createdAtMs: Number(raw.createdAtMs ?? Date.now()),
          };
        });
        setCommands(rows);
      },
      (error) => {
        console.warn('Unable to load command history:', error);
        setCommands([]);
      },
    );

    unsubPlatform = onSnapshot(
      doc(db, 'appConfig', 'platform'),
      (snapshot) => {
        setPlatformSettings(normalizePlatformSettings(snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null));
      },
      (error) => {
        console.warn('Unable to load platform settings:', error);
        setPlatformSettings(defaultPlatformSettings);
      },
    );

    return () => {
      unsubscribeAuth?.();
      unsubDevices?.();
      unsubCommands?.();
      unsubPlatform?.();
      telemetryUnsubsRef.current.forEach((unsub) => unsub());
      telemetryUnsubsRef.current.clear();
    };
  }, [auth]);

  const alerts = useMemo(() => deriveAlerts(devices, commands.map(({ deviceId, status }) => ({ deviceId, status }))), [devices, commands]);

  const tariffPerKwh = platformSettings.tariffPerKwh || TARIFF_TZS_PER_KWH;

  const allTelemetry = useMemo(
    () => Array.from(telemetryMap.values()).flat().sort((a, b) => a.ts - b.ts),
    [telemetryMap],
  );

  const consumptionSeries = useMemo(() => {
    if (!allTelemetry.length) return [];

    const grouped = new Map<number, number>();
    allTelemetry.forEach((point) => {
      const date = new Date(point.ts);
      const hour = date.getHours();
      grouped.set(hour, (grouped.get(hour) ?? 0) + point.power / 1000);
    });

    return Array.from({ length: 24 }, (_, hour) => {
      const kw = grouped.get(hour) ?? 0;
      const kwh = kw * 0.25;
      return {
        t: `${String(hour).padStart(2, '0')}:00`,
        kwh: Number(Math.max(0, kwh).toFixed(1)),
        cost: Number((kwh * tariffPerKwh).toFixed(1)),
      };
    });
  }, [allTelemetry, tariffPerKwh]);

  const siteBreakdown = useMemo(() => {
    if (!devices.length) return [];
    const grouped = new Map<string, { site: string; kwh: number; cost: number }>();
    devices.forEach((device) => {
      const existing = grouped.get(device.site) ?? { site: device.site, kwh: 0, cost: 0 };
      existing.kwh += device.todayKwh;
      existing.cost += device.todayKwh * tariffPerKwh;
      grouped.set(device.site, existing);
    });
    return Array.from(grouped.values()).sort((a, b) => b.kwh - a.kwh);
  }, [devices, tariffPerKwh]);

  const costTrend = useMemo(() => {
    // Only render cost trend if we have real telemetry data
    if (!allTelemetry.length) return [];

    const bucketed = new Map<string, number>();
    allTelemetry.forEach((point) => {
      const date = new Date(point.ts);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      bucketed.set(key, (bucketed.get(key) ?? 0) + (point.power / 1000 * 0.25)); // Convert to kWh
    });

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    return months.map((m, index) => {
      const date = new Date(now.getFullYear(), index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const kwh = bucketed.get(key) ?? 0;
      return { m, cost: Number((kwh * tariffPerKwh).toFixed(0)), budget: Number(((kwh || 1) * tariffPerKwh * 1.1).toFixed(0)) };
    }).slice(Math.max(0, now.getMonth() - 5));
  }, [allTelemetry, tariffPerKwh]);

  const renewableMix = useMemo(() => {
    // Only render renewable mix if we have real telemetry data
    if (!allTelemetry.length) {
      return [
        { source: 'Hydro', pct: 0, color: 'var(--chart-3)' },
        { source: 'Solar PV', pct: 0, color: 'var(--chart-1)' },
        { source: 'Thermal (gas/diesel)', pct: 0, color: 'var(--chart-2)' },
        { source: 'Biogas', pct: 0, color: 'var(--chart-4)' },
      ];
    }

    // Real renewable mix data should come from Firestore appConfig/platform or device records
    // For now, return default mix since we don't have real renewable source tracking
    return [
      { source: 'Hydro', pct: 0, color: 'var(--chart-3)' },
      { source: 'Solar PV', pct: 0, color: 'var(--chart-1)' },
      { source: 'Thermal (gas/diesel)', pct: 100, color: 'var(--chart-2)' },
      { source: 'Biogas', pct: 0, color: 'var(--chart-4)' },
    ];
  }, [allTelemetry]);

  const emissionsTrend = useMemo(() => {
    // Only render emissions trend if we have real telemetry data
    if (!allTelemetry.length) {
      return [];
    }

    // Group telemetry by month to show real emissions trend
    const byMonth = new Map<string, number>();
    allTelemetry.forEach((point) => {
      const date = new Date(point.ts);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + point.power / 1000 * 0.25); // Convert to kWh
    });

    // If we only have data from one month, return empty (need multiple months for trend)
    if (byMonth.size < 2) {
      return [];
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    
    // Use last 6 months of real data
    return Array.from(byMonth.entries())
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .slice(-6)
      .map(([monthKey, kwh]) => {
        const [year, month] = monthKey.split('-');
        const monthIndex = Number(month) - 1;
        const monthName = months[monthIndex];
        const co2 = Math.round(kwh * GRID_EMISSION_FACTOR_KGCO2_PER_KWH);
        // Baseline is just what we consumed * 1.15 (15% more if we didn't optimize)
        const baseline = Math.round(co2 * 1.15);
        const avoided = Math.max(0, baseline - co2);
        return { m: monthName, co2, baseline, avoided };
      });
  }, [allTelemetry, GRID_EMISSION_FACTOR_KGCO2_PER_KWH]);

  const recommendations = useMemo(() => {
    if (!devices.length) return [] as Recommendation[];

    const generated: Recommendation[] = [];

    devices.forEach((device) => {
      if (device.status === 'fault' || device.status === 'offline') {
        generated.push({
          id: `rec-${device.id}`,
          title: device.status === 'fault' ? 'Correct power quality at site' : 'Restore telemetry connectivity',
          detail: `${device.name} is ${device.status}. Review the relay and communications path to restore stable operation.`,
          device: `${device.id} · ${device.name}`,
          savingKwh: 0,
          savingTzs: 0,
          co2SavedKg: 0,
          priority: 'high',
          category: device.status === 'fault' ? 'Power quality' : 'Reliability',
        });
      }

      if (device.status === 'stale' && device.todayKwh > 0) {
        generated.push({
          id: `rec-${device.id}-schedule`,
          title: 'Reschedule idle overnight load',
          detail: `${device.name} has stale telemetry and some overnight draw. Confirm the schedule and avoid unnecessary off-hours consumption.`,
          device: `${device.id} · ${device.name}`,
          savingKwh: Math.max(25, Math.round(device.todayKwh * 0.08)),
          savingTzs: Math.max(15000, Math.round(device.todayKwh * 0.08 * platformSettings.tariffPerKwh || 0)),
          co2SavedKg: Math.max(0, Math.round(Math.max(25, Math.round(device.todayKwh * 0.08)) * GRID_EMISSION_FACTOR_KGCO2_PER_KWH)),
          priority: 'medium',
          category: 'Scheduling',
        });
      }
    });

    return generated.length ? generated.slice(0, 4) : [] as Recommendation[];
  }, [devices, GRID_EMISSION_FACTOR_KGCO2_PER_KWH, platformSettings.tariffPerKwh]);

  const incidentHistory = useMemo(() => {
    // Only show incidents based on real device status from Firestore
    if (!devices.length) return [] as Incident[];

    const items: Incident[] = devices
      .filter((device) => device.status === 'fault' || device.status === 'offline' || device.status === 'stale')
      .map((device) => ({
        id: `INC-${device.id}`,
        title: device.status === 'fault' ? 'Reactive or protection alert' : device.status === 'offline' ? 'Device unreachable' : 'Telemetry stale',
        device: `${device.id} · ${device.name}`,
        severity: device.status === 'fault' ? 'critical' : device.status === 'offline' ? 'critical' : 'warning',
        detected: 'Recent', // Without real incident timestamps from Firestore, just show recent
        duration: '—', // Without real incident duration, omit
        rootCause: device.status === 'fault' ? 'Load protection threshold exceeded' : device.status === 'offline' ? 'Gateway or network interruption' : 'Polling timeout',
      }));

    return items;
  }, [devices]);

  const safetyStatus = useMemo(() => ({
    relaySafelyControlled: devices.filter((device) => device.relay).length,
    faultProtectionArmed: devices.filter((device) => device.status !== 'fault').length,
    overloadProtected: devices.filter((device) => device.load && device.load < 100).length,
    groundFaults: devices.filter((device) => device.status === 'fault').length,
    lastSafetyAudit: platformSettings.timezone || 'Unknown',
  }), [devices, platformSettings.timezone]);

  const uptimeBySite = useMemo(() => {
    if (!devices.length) return [] as Array<{ site: string; uptime: number; sla: number }>;
    const grouped = new Map<string, { site: string; uptime: number; sla: number }>();
    devices.forEach((device) => {
      const entry = grouped.get(device.site) ?? { site: device.site, uptime: 100, sla: 99.5 };
      entry.uptime = device.status === 'offline' ? Math.min(entry.uptime, 99.0) : entry.uptime;
      grouped.set(device.site, entry);
    });
    return Array.from(grouped.values());
  }, [devices]);

  const hourlyProfile = useMemo(() => {
    if (!allTelemetry.length) return [];

    const grouped = new Map<number, number>();
    allTelemetry.forEach((point) => {
      const date = new Date(point.ts);
      const hour = date.getHours();
      grouped.set(hour, (grouped.get(hour) ?? 0) + point.power / 1000);
    });

    return Array.from({ length: 24 }, (_, hour) => {
      const kw = grouped.get(hour) ?? 0;
      const kwh = kw * 0.25;
      const period = periodOf(hour);
      const multiplier = touBands.find((band) => band.id === period)?.multiplier ?? 1;
      const cost = kwh * tariffPerKwh * multiplier;
      return {
        hour,
        t: `${String(hour).padStart(2, '0')}:00`,
        kwh: Number(Math.max(0, kwh).toFixed(1)),
        cost: Number(cost.toFixed(0)),
        period,
      };
    });
  }, [allTelemetry, tariffPerKwh]);

  return {
    devices,
    alerts,
    commands,
    consumptionSeries,
    siteBreakdown,
    costTrend,
    renewableMix,
    emissionsTrend,
    sustainabilityEquivalents: {
      trees: Math.max(0, Math.round(devices.reduce((sum, device) => sum + Math.max(0, device.todayKwh), 0) * 0.22)),
      kmAvoided: Math.max(0, Math.round(devices.reduce((sum, device) => sum + Math.max(0, device.todayKwh), 0) * 4.8)),
      homesPowered: Math.max(0, Math.round(devices.reduce((sum, device) => sum + Math.max(0, device.todayKwh), 0) / 220)),
      phonesCharged: Math.max(0, Math.round(devices.reduce((sum, device) => sum + Math.max(0, device.todayKwh), 0) * 420)),
    },
    recommendations,
    reliabilityMetrics: {
      uptime: devices.length ? Number(((devices.filter((device) => device.status === 'online').length / devices.length) * 100).toFixed(2)) : 0,
      mttr: devices.filter((device) => device.status === 'offline' || device.status === 'fault').length > 0 ? '—' : 'N/A',
      incidents30d: incidentHistory.length,
      avgResponse: devices.filter((device) => device.status === 'offline' || device.status === 'fault').length > 0 ? '—' : 'N/A',
      slaTarget: 99.5,
      compliance: devices.length ? (devices.filter((device) => device.status === 'online').length / devices.length) >= 0.995 : false,
    },
    uptimeBySite,
    incidentHistory,
    incidents: incidentHistory,
    safetyStatus,
    exportsHistory: [],
    recentActivity: [] as Array<{ id: string; action: string; target: string; actor: string; time: string; state: string }>,
    hourlyProfile,
    telemetryByDevice: telemetryMap,
    allTelemetry,
    platformSettings,
    tariffPerKwh,
    TARIFF_TZS_PER_KWH,
    TIMEZONE,
    GRID_EMISSION_FACTOR_KGCO2_PER_KWH,
    currency,
    touBands,
    periodOf,
    getTimeRangeHours,
  };
}
