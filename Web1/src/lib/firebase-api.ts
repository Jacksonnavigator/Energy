import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { PlatformSettings } from './dashboard-data';

export async function sendRelayCommand(deviceId: string, turnOn: boolean): Promise<void> {
  if (!db) throw new Error('Firestore is not initialized');

  const cmd = turnOn ? 'ON' : 'OFF';
  await addDoc(collection(db, 'devices', deviceId, 'commands'), {
    cmd,
    status: 'pending',
    createdAtMs: Date.now(),
  });
  await setDoc(doc(db, 'devices', deviceId), { desiredRelayState: cmd }, { merge: true });
}

export async function savePlatformSettings(settings: PlatformSettings): Promise<void> {
  if (!db) throw new Error('Firestore is not initialized');
  await setDoc(doc(db, 'appConfig', 'platform'), settings, { merge: true });
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (value: string | number) => {
    const text = String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
