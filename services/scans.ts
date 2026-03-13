import { apiFetch } from "./api";

export interface ScanModuleSummary {
  detectedDevices: number;
  suspiciousDevices: number;
  suspectedCameraLikeDevices?: number;
  suspectedIotDevices?: number;
  scannedHosts?: number;
  responsiveHosts?: number;
  networkRange?: string | null;
  gateway?: string | null;
  localAddress?: string | null;
  coverage?: "full" | "partial";
  summaryText?: string;
}

export interface VisualSummary {
  flags: number;
}

export interface ScanSignal {
  signalId: string;
  type: string;
  deviceName: string;
  identifier?: string;
  hostname?: string | null;
  ipAddress?: string | null;
  macAddress: string | null;
  vendor: string;
  category?: string;
  deviceType?: string;
  hardwareHint?: string | null;
  signalStrength: number;
  suspicionScore?: number;
  suspicionLevel: string;
  reason: string;
  reasons?: string[];
  openPorts?: number[];
  exposedServices?: string[];
  estimatedDistanceMeters?: number | null;
  isTrusted?: boolean;
  detectedAt: string;
}

export interface ProximityCapabilities {
  ble: string;
  wifi: string;
}

export interface ProximitySummaryPayload {
  totalDetected: number;
  suspiciousDetected: number;
  bluetoothDetected: number;
  bluetoothSuspicious: number;
  wifiDetected: number;
  wifiSuspicious: number;
  radiusMeters: number;
  summaryText: string;
  notes: string[];
  capabilities: ProximityCapabilities;
}

export interface ScanInspectionItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface ScanInspection {
  inspectionId: string;
  createdAt: string;
  notes: string;
  checklist: ScanInspectionItem[];
  imagePath: string | null;
  linkedScanId: string | null;
}

export interface ScanSummary {
  scanId: string;
  userId: string;
  createdAt: string;
  finishedAt?: string;
  location: {
    label: string;
    city: string;
    country: string;
  };
  networkSummary: ScanModuleSummary;
  bluetoothSummary: ScanModuleSummary;
  visualSummary: VisualSummary;
  signalsCount: number;
  riskScore: number;
  riskLevel: string;
  reasons: string[];
  recommendations: string[];
  reportLocked: boolean;
  inspection: ScanInspection | null;
  notes?: string;
}

export interface RunScanPayload {
  locationLabel: string;
  city: string;
  country: string;
  visualFlags?: number;
  notes?: string;
  proximitySignals?: ScanSignal[];
  proximitySummary?: ProximitySummaryPayload;
}

export interface RunScanResult {
  scan: ScanSummary;
  signals: ScanSignal[];
  savedToHistory: boolean;
  quota: {
    used: number;
    limit: number;
    remaining: number;
  };
}

export async function runRemoteScan(payload: RunScanPayload): Promise<RunScanResult | null> {
  const response = await apiFetch<RunScanResult>("/scans/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return response.ok ? response.data : null;
}

export async function fetchScanHistory(userId: string): Promise<ScanSummary[]> {
  const response = await apiFetch<{ scans: ScanSummary[] }>(`/users/${userId}/scans`, {
    method: "GET",
  });

  return response.ok ? response.data.scans ?? [] : [];
}

export async function fetchScanDetails(
  scanId: string
): Promise<{ scan: ScanSummary; signals: ScanSignal[] } | null> {
  const response = await apiFetch<{ scan: ScanSummary; signals: ScanSignal[] }>(`/scans/${scanId}`, {
    method: "GET",
  });

  return response.ok ? response.data : null;
}

export async function deleteScan(scanId: string): Promise<boolean> {
  const response = await apiFetch(`/scans/${scanId}`, {
    method: "DELETE",
  });

  return response.ok;
}

export async function clearHistory(scanIds: string[]): Promise<void> {
  await Promise.all(scanIds.map((scanId) => deleteScan(scanId)));
}

export async function saveInspection(
  userId: string,
  payload: {
    scanId?: string;
    notes: string;
    checklist: ScanInspectionItem[];
    photoBase64?: string | null;
    photoMimeType?: string;
  }
): Promise<ScanInspection | null> {
  const response = await apiFetch<{ inspection: ScanInspection }>(`/users/${userId}/inspections`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return response.ok ? response.data.inspection : null;
}

export async function fetchInspections(userId: string): Promise<ScanInspection[]> {
  const response = await apiFetch<{ inspections: ScanInspection[] }>(`/users/${userId}/inspections`, {
    method: "GET",
  });

  return response.ok ? response.data.inspections ?? [] : [];
}
