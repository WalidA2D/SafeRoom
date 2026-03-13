import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import WifiManager, { type WifiEntry } from "react-native-wifi-reborn";
import { BleManager, State, type Device as BleDevice } from "react-native-ble-plx";
import type { ScanSignal } from "./scans";

export type CapabilityState =
  | "available"
  | "unsupported_platform"
  | "native_module_unavailable"
  | "permission_denied"
  | "powered_off"
  | "scan_error"
  | "skipped";

export interface ProximityCapabilities {
  ble: CapabilityState;
  wifi: CapabilityState;
}

export interface ProximitySummary {
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

export interface ProximityScanResult {
  signals: ScanSignal[];
  summary: ProximitySummary;
}

interface ProximityScanOptions {
  durationMs?: number;
  radiusMeters?: number;
  onProgress?: (progress: number) => void;
}

const BLE_DURATION_MS = 5500;
const BLE_REFERENCE_RSSI = -59;
const WIFI_REFERENCE_RSSI = -45;
const DISTANCE_LIMIT_METERS = 10;

const TRACKER_KEYWORDS = ["airtag", "tile", "smarttag", "tracker", "find my", "findmy", "chipolo"];
const CAMERA_KEYWORDS = [
  "camera",
  "cam",
  "ipcam",
  "ipc",
  "hik",
  "hikvision",
  "dahua",
  "reolink",
  "ezviz",
  "arlo",
  "wyze",
  "imou",
  "tapo",
];
const IOT_KEYWORDS = [
  "smart",
  "iot",
  "plug",
  "switch",
  "sensor",
  "bulb",
  "nest",
  "echo",
  "alexa",
  "home",
  "chromecast",
  "robot",
  "vacuum",
  "ring",
];
const BENIGN_BLE_KEYWORDS = ["iphone", "ipad", "apple watch", "galaxy watch", "airpods", "buds", "pixel"];
const PHONE_HOTSPOT_KEYWORDS = ["iphone", "android", "pixel", "galaxy", "huawei", "hotspot"];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundDistance(value: number) {
  return Math.round(value * 10) / 10;
}

function hasKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function inferVendorFromText(value: string) {
  if (value.includes("hik") || value.includes("hikvision")) return "Hikvision";
  if (value.includes("dahua")) return "Dahua";
  if (value.includes("reolink")) return "Reolink";
  if (value.includes("arlo")) return "Arlo";
  if (value.includes("tapo")) return "TP-Link Tapo";
  if (value.includes("tile")) return "Tile";
  if (value.includes("airtag") || value.includes("apple")) return "Apple";
  if (value.includes("smarttag") || value.includes("galaxy")) return "Samsung";
  if (value.includes("nest")) return "Google Nest";
  if (value.includes("echo") || value.includes("alexa") || value.includes("ring")) return "Amazon";
  return "Unknown";
}

function estimateBleDistance(rssi: number, txPowerLevel?: number | null) {
  const reference = typeof txPowerLevel === "number" ? txPowerLevel : BLE_REFERENCE_RSSI;
  const distance = 10 ** ((reference - rssi) / (10 * 2.2));
  return roundDistance(clamp(distance, 0.3, 30));
}

function estimateWifiDistance(rssi: number, frequency?: number) {
  const exponent = typeof frequency === "number" && frequency >= 5000 ? 2.05 : 2.3;
  const distance = 10 ** ((WIFI_REFERENCE_RSSI - rssi) / (10 * exponent));
  return roundDistance(clamp(distance, 0.5, 35));
}

function normalizeName(value: string | null | undefined, fallback: string) {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function buildBleFingerprint(device: BleDevice) {
  return [
    device.name,
    device.localName,
    ...(device.serviceUUIDs || []),
    ...(device.solicitedServiceUUIDs || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function classifyBleDevice(device: BleDevice, distanceMeters: number) {
  const fingerprint = buildBleFingerprint(device);
  const vendor = inferVendorFromText(fingerprint);
  const reasons: string[] = [];
  let suspicionScore = 0;
  let deviceType = "unknown";

  if (hasKeyword(fingerprint, TRACKER_KEYWORDS)) {
    deviceType = "tracker";
    suspicionScore += 72;
    reasons.push("Nom ou profil BLE compatible avec un tracker.");
  } else if (hasKeyword(fingerprint, CAMERA_KEYWORDS)) {
    deviceType = "camera_compatible";
    suspicionScore += 58;
    reasons.push("Nom ou services BLE compatibles avec un appareil video connecte.");
  } else if (hasKeyword(fingerprint, IOT_KEYWORDS)) {
    deviceType = "iot_device";
    suspicionScore += 26;
    reasons.push("Profil BLE compatible avec un objet connecte.");
  }

  if (!device.localName && !device.name) {
    suspicionScore += distanceMeters <= 3 ? 18 : 10;
    reasons.push("Appareil BLE sans nom visible.");
  }
  if (device.manufacturerData && deviceType === "unknown") {
    suspicionScore += 6;
  }
  if (distanceMeters <= 2) {
    suspicionScore += 10;
    reasons.push("Signal BLE tres proche.");
  }
  if (hasKeyword(fingerprint, BENIGN_BLE_KEYWORDS)) {
    suspicionScore -= 18;
    if (deviceType === "unknown") {
      deviceType = "personal_device";
    }
  }

  suspicionScore = clamp(suspicionScore, 0, 100);
  let suspicionLevel = "low";
  if (suspicionScore >= 35 && suspicionScore < 65) suspicionLevel = "medium";
  if (suspicionScore >= 65) suspicionLevel = "high";

  if (reasons.length === 0) {
    reasons.push("Appareil BLE visible a proximite sans indice fort de surveillance.");
  }

  return {
    vendor,
    deviceType,
    suspicionScore,
    suspicionLevel,
    reason: reasons[0],
    reasons,
  };
}

function buildWifiFingerprint(entry: WifiEntry) {
  return [entry.SSID, entry.capabilities]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function classifyWifiEntry(entry: WifiEntry, distanceMeters: number) {
  const fingerprint = buildWifiFingerprint(entry);
  const vendor = inferVendorFromText(fingerprint);
  const reasons: string[] = [];
  let suspicionScore = 0;
  let deviceType = "wifi_access_point";
  const ssid = String(entry.SSID || "").trim();
  const isHidden = !ssid || ssid === "<unknown ssid>";

  if (hasKeyword(fingerprint, CAMERA_KEYWORDS)) {
    deviceType = "camera_compatible";
    suspicionScore += 58;
    reasons.push("SSID compatible avec une camera ou un appareil video connecte.");
  } else if (hasKeyword(fingerprint, IOT_KEYWORDS)) {
    deviceType = "iot_device";
    suspicionScore += 28;
    reasons.push("SSID compatible avec un objet connecte.");
  }

  if (isHidden) {
    suspicionScore += distanceMeters <= 5 ? 30 : 16;
    reasons.push("Reseau Wi-Fi cache detecte a proximite.");
  }
  if (distanceMeters <= 3) {
    suspicionScore += 8;
    reasons.push("Point d'acces ou appareil Wi-Fi tres proche.");
  }
  if (hasKeyword(fingerprint, PHONE_HOTSPOT_KEYWORDS)) {
    suspicionScore -= 18;
    if (deviceType === "wifi_access_point") {
      deviceType = "personal_hotspot";
    }
  }

  suspicionScore = clamp(suspicionScore, 0, 100);
  let suspicionLevel = "low";
  if (suspicionScore >= 35 && suspicionScore < 65) suspicionLevel = "medium";
  if (suspicionScore >= 65) suspicionLevel = "high";

  if (reasons.length === 0) {
    reasons.push("Reseau Wi-Fi voisin visible sans indice fort de surveillance.");
  }

  return {
    vendor,
    deviceType,
    suspicionScore,
    suspicionLevel,
    reason: reasons[0],
    reasons,
  };
}

function createCapabilityNotes(capabilities: ProximityCapabilities) {
  const notes: string[] = [];

  if (capabilities.ble === "native_module_unavailable") {
    notes.push("Le scan BLE necessite un dev build et ne fonctionne pas dans Expo Go.");
  }
  if (capabilities.wifi === "unsupported_platform") {
    notes.push("Le scan des reseaux Wi-Fi voisins est disponible sur Android uniquement.");
  }
  if (capabilities.wifi === "native_module_unavailable") {
    notes.push("Le module Wi-Fi voisin n'est pas disponible dans l'application actuelle.");
  }
  if (capabilities.ble === "permission_denied" || capabilities.wifi === "permission_denied") {
    notes.push("Certaines permissions radio ont ete refusees, le resultat peut etre incomplet.");
  }
  if (capabilities.ble === "powered_off") {
    notes.push("Le Bluetooth est desactive, aucun appareil BLE n'a pu etre analyse.");
  }
  if (capabilities.ble === "scan_error" || capabilities.wifi === "scan_error") {
    notes.push("Une erreur radio a limite une partie du scan de proximite.");
  }

  return notes;
}

async function requestAndroidPermissions() {
  if (Platform.OS !== "android") {
    return { bleGranted: true, wifiGranted: true };
  }

  const permissionList = [
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ];

  if (typeof PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN === "string") {
    permissionList.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
  }
  if (typeof PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT === "string") {
    permissionList.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  }
  if (typeof PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES === "string") {
    permissionList.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
  }

  const uniquePermissions = Array.from(new Set(permissionList));
  const result = await PermissionsAndroid.requestMultiple(uniquePermissions);
  const hasFineLocation =
    result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
  const bleGranted =
    hasFineLocation &&
    (!PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN ||
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED) &&
    (!PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT ||
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED);
  const wifiGranted =
    hasFineLocation &&
    (!PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES ||
      result[PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES] === PermissionsAndroid.RESULTS.GRANTED);

  return { bleGranted, wifiGranted };
}

async function waitForBlePoweredOn(manager: BleManager) {
  const state = await manager.state();
  if (state === State.PoweredOn) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const subscription = manager.onStateChange((nextState) => {
      if (nextState === State.PoweredOn) {
        subscription.remove();
        resolve(true);
      }
      if (
        nextState === State.PoweredOff ||
        nextState === State.Unauthorized ||
        nextState === State.Unsupported
      ) {
        subscription.remove();
        resolve(false);
      }
    }, true);

    setTimeout(() => {
      subscription.remove();
      resolve(false);
    }, 2500);
  });
}

async function scanBleDevices(durationMs: number, radiusMeters: number, onProgress?: (progress: number) => void) {
  const manager = new BleManager();
  const devices = new Map<string, BleDevice>();
  let capability: CapabilityState = "available";
  let scanFailed = false;

  try {
    const poweredOn = await waitForBlePoweredOn(manager);
    if (!poweredOn) {
      capability = "powered_off";
      return { capability, signals: [] as ScanSignal[] };
    }

    await manager.startDeviceScan(null, { allowDuplicates: false }, (error, scannedDevice) => {
      if (error) {
        scanFailed = true;
        return;
      }
      if (!scannedDevice?.id) return;

      const previous = devices.get(scannedDevice.id);
      const nextRssi = scannedDevice.rssi ?? -150;
      const previousRssi = previous?.rssi ?? -150;
      if (!previous || nextRssi > previousRssi) {
        devices.set(scannedDevice.id, scannedDevice);
      }
    });

    const steps = 8;
    for (let index = 0; index < steps; index += 1) {
      await sleep(durationMs / steps);
      onProgress?.(8 + ((index + 1) / steps) * 50);
      if (scanFailed) break;
    }

    await manager.stopDeviceScan();
  } catch {
    capability = "scan_error";
    scanFailed = true;
  } finally {
    try {
      await manager.stopDeviceScan();
    } catch {
      // ignore
    }
    await manager.destroy();
  }

  if (scanFailed) {
    capability = "scan_error";
  }

  if (capability !== "available") {
    return { capability, signals: [] as ScanSignal[] };
  }

  const signals = Array.from(devices.values())
    .filter((device) => typeof device.rssi === "number")
    .map((device) => {
      const distanceMeters = estimateBleDistance(device.rssi ?? -100, device.txPowerLevel);
      const classification = classifyBleDevice(device, distanceMeters);
      return {
        signalId: `ble_${device.id}`,
        type: "bluetooth",
        deviceName: normalizeName(device.localName || device.name, "Appareil BLE sans nom"),
        identifier: device.id,
        hostname: null,
        ipAddress: null,
        macAddress: device.id,
        vendor: classification.vendor,
        category: classification.deviceType,
        deviceType: classification.deviceType,
        hardwareHint: device.manufacturerData ? "manufacturer-data" : null,
        signalStrength: device.rssi ?? -100,
        suspicionScore: classification.suspicionScore,
        suspicionLevel: classification.suspicionLevel,
        reason: classification.reason,
        reasons: classification.reasons,
        openPorts: [],
        exposedServices: device.serviceUUIDs || [],
        estimatedDistanceMeters: distanceMeters,
        isTrusted: false,
        detectedAt: new Date().toISOString(),
      } satisfies ScanSignal;
    })
    .filter((signal) => (signal.estimatedDistanceMeters ?? radiusMeters + 1) <= radiusMeters)
    .sort((left, right) => {
      const suspicionDelta = (right.suspicionScore ?? 0) - (left.suspicionScore ?? 0);
      if (suspicionDelta !== 0) return suspicionDelta;
      return (left.estimatedDistanceMeters ?? 99) - (right.estimatedDistanceMeters ?? 99);
    });

  return { capability, signals };
}

async function scanWifiNetworks(radiusMeters: number) {
  if (Platform.OS !== "android") {
    return { capability: "unsupported_platform" as CapabilityState, signals: [] as ScanSignal[] };
  }

  try {
    const wifiEntries = await WifiManager.reScanAndLoadWifiList();
    const signals = wifiEntries
      .map((entry) => {
        const distanceMeters = estimateWifiDistance(entry.level, entry.frequency);
        const classification = classifyWifiEntry(entry, distanceMeters);
        const displayName = normalizeName(
          entry.SSID,
          `Reseau cache ${String(entry.BSSID || "unknown").slice(-5)}`
        );

        return {
          signalId: `wifi_${entry.BSSID}`,
          type: "wifi",
          deviceName: displayName,
          identifier: entry.BSSID,
          hostname: null,
          ipAddress: null,
          macAddress: entry.BSSID || null,
          vendor: classification.vendor,
          category: classification.deviceType,
          deviceType: classification.deviceType,
          hardwareHint: entry.capabilities || null,
          signalStrength: entry.level,
          suspicionScore: classification.suspicionScore,
          suspicionLevel: classification.suspicionLevel,
          reason: classification.reason,
          reasons: classification.reasons,
          openPorts: [],
          exposedServices: entry.capabilities ? [entry.capabilities] : [],
          estimatedDistanceMeters: distanceMeters,
          isTrusted: false,
          detectedAt: new Date().toISOString(),
        } satisfies ScanSignal;
      })
      .filter((signal) => (signal.estimatedDistanceMeters ?? radiusMeters + 1) <= radiusMeters)
      .sort((left, right) => {
        const suspicionDelta = (right.suspicionScore ?? 0) - (left.suspicionScore ?? 0);
        if (suspicionDelta !== 0) return suspicionDelta;
        return (left.estimatedDistanceMeters ?? 99) - (right.estimatedDistanceMeters ?? 99);
      });

    return { capability: "available" as CapabilityState, signals };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (message.includes("locationPermission") || message.includes("location")) {
      return { capability: "permission_denied" as CapabilityState, signals: [] as ScanSignal[] };
    }
    return { capability: "scan_error" as CapabilityState, signals: [] as ScanSignal[] };
  }
}

function buildSummary(signals: ScanSignal[], radiusMeters: number, capabilities: ProximityCapabilities) {
  const bluetoothSignals = signals.filter((signal) => signal.type === "bluetooth");
  const wifiSignals = signals.filter((signal) => signal.type === "wifi");
  const bluetoothSuspicious = bluetoothSignals.filter((signal) => signal.suspicionLevel !== "low").length;
  const wifiSuspicious = wifiSignals.filter((signal) => signal.suspicionLevel !== "low").length;
  const notes = createCapabilityNotes(capabilities);

  let summaryText = `${signals.length} appareil(s) radio detecte(s) dans un rayon estime de ${radiusMeters} m, dont ${
    bluetoothSuspicious + wifiSuspicious
  } a verifier.`;
  if (signals.length === 0) {
    summaryText = `Aucun appareil radio pertinent n'a ete retenu dans le rayon estime de ${radiusMeters} m.`;
  }

  return {
    totalDetected: signals.length,
    suspiciousDetected: bluetoothSuspicious + wifiSuspicious,
    bluetoothDetected: bluetoothSignals.length,
    bluetoothSuspicious,
    wifiDetected: wifiSignals.length,
    wifiSuspicious,
    radiusMeters,
    summaryText,
    notes,
    capabilities,
  } satisfies ProximitySummary;
}

function hasNativeBleModule() {
  return Platform.OS !== "web" && Boolean(NativeModules.BlePlx);
}

function hasNativeWifiModule() {
  return Platform.OS === "android" && Boolean(NativeModules.WifiManager);
}

export async function scanNearbyDevices(
  options: ProximityScanOptions = {}
): Promise<ProximityScanResult> {
  const durationMs = options.durationMs ?? BLE_DURATION_MS;
  const radiusMeters = options.radiusMeters ?? DISTANCE_LIMIT_METERS;
  const capabilities: ProximityCapabilities = {
    ble: hasNativeBleModule()
      ? "available"
      : Platform.OS === "web"
        ? "unsupported_platform"
        : "native_module_unavailable",
    wifi: Platform.OS !== "android"
      ? "unsupported_platform"
      : hasNativeWifiModule()
        ? "available"
        : "native_module_unavailable",
  };

  options.onProgress?.(4);

  const { bleGranted, wifiGranted } = await requestAndroidPermissions();
  if (!bleGranted && Platform.OS === "android") {
    capabilities.ble = "permission_denied";
  }
  if (!wifiGranted && Platform.OS === "android") {
    capabilities.wifi = "permission_denied";
  }

  options.onProgress?.(10);

  let bleSignals: ScanSignal[] = [];
  if (capabilities.ble === "available") {
    const bleResult = await scanBleDevices(durationMs, radiusMeters, options.onProgress);
    capabilities.ble = bleResult.capability;
    bleSignals = bleResult.signals;
  }

  options.onProgress?.(68);

  let wifiSignals: ScanSignal[] = [];
  if (capabilities.wifi === "available") {
    const wifiResult = await scanWifiNetworks(radiusMeters);
    capabilities.wifi = wifiResult.capability;
    wifiSignals = wifiResult.signals;
  }

  options.onProgress?.(88);

  const signals = [...bleSignals, ...wifiSignals].sort((left, right) => {
    const suspicionDelta = (right.suspicionScore ?? 0) - (left.suspicionScore ?? 0);
    if (suspicionDelta !== 0) return suspicionDelta;
    return (left.estimatedDistanceMeters ?? 99) - (right.estimatedDistanceMeters ?? 99);
  });
  const summary = buildSummary(signals, radiusMeters, capabilities);

  options.onProgress?.(100);

  return { signals, summary };
}
