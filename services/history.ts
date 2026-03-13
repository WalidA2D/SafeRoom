import AsyncStorage from "@react-native-async-storage/async-storage";

export type ScanSummary = {
  id: string;
  createdAt: string; // ISO
  riskScore: number;
  riskLevel: string;
  network: { detected: number; suspicious: number };
  bluetooth: { detected: number; suspicious: number };
  visual: { flags: number };
};

const STORAGE_KEY = "@saferoom/scan_history";

export async function loadHistory(): Promise<ScanSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScanSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export async function saveHistory(history: ScanSummary[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (_error) {
    // ignore
  }
}

export async function addScanToHistory(scan: ScanSummary): Promise<void> {
  const history = await loadHistory();
  const next = [scan, ...history].slice(0, 50); // conserver un maximum de 50 entrées
  await saveHistory(next);
}

export async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // ignore
  }
}
