import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { PlatformSettings } from "./dashboard-data";

export async function sendRelayCommand(deviceId: string, turnOn: boolean): Promise<void> {
  if (!db) throw new Error("Firestore is not initialized");

  const cmd = turnOn ? "ON" : "OFF";
  await addDoc(collection(db, "devices", deviceId, "commands"), {
    cmd,
    status: "pending",
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    requestedByEmail: auth?.currentUser?.email ?? null,
    requestedByUid: auth?.currentUser?.uid ?? null,
  });
  await setDoc(doc(db, "devices", deviceId), { desiredRelayState: cmd }, { merge: true });
}

export async function savePlatformSettings(settings: PlatformSettings): Promise<void> {
  if (!db) throw new Error("Firestore is not initialized");
  await setDoc(doc(db, "appConfig", "platform"), settings, { merge: true });
}

export async function recordExport(event: {
  name: string;
  format: string;
  sizeBytes: number;
  rowCount: number;
  status?: string;
}): Promise<void> {
  if (!db) throw new Error("Firestore is not initialized");

  await addDoc(collection(db, "exports"), {
    ...event,
    status: event.status ?? "Ready",
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    actorEmail: auth?.currentUser?.email ?? null,
    actorUid: auth?.currentUser?.uid ?? null,
  });
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): number {
  const escape = (value: string | number) => {
    const text = String(value);
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  };

  const lines = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  void recordExport({
    name: filename.replace(/\.[^.]+$/, ""),
    format: "CSV",
    sizeBytes: blob.size,
    rowCount: rows.length,
  }).catch((error) => {
    console.warn("Unable to record export history:", error);
  });
  return blob.size;
}
