const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { analyzeLocalLan } = require("./lanAnalyzer");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const API_PREFIX = "/api/v1";
const PORT = Number(process.env.PORT || 4000);
const USERS_COLLECTION = "users";
const ADS_CONFIG_DOC = "adsConfig/config";
const SCAN_STATS_DOC = "scanStats/global";
const DEFAULT_SERVICE_ACCOUNT = path.resolve(__dirname, "../scripts/serviceAccountKey.json");
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : DEFAULT_SERVICE_ACCOUNT;

const DEFAULT_ADS_CONFIG = {
  enabled: true,
  provider: "firebase-demo",
  banner: true,
  interstitial: false,
  premiumNoAds: true,
};

const DEFAULT_SCAN_STATS = {
  totalScans: 0,
  suspiciousScans: 0,
  lastUpdated: null,
};

const DEFAULT_THREAT_SIGNATURES = [
  {
    signatureId: "sig_cam_wifi_01",
    deviceType: "ip_camera",
    vendor: "Hikvision",
    keywords: ["CAMERA", "IPCAM", "HIKVISION"],
    riskLevel: "high",
    description: "Signature proche d'une camera IP.",
  },
  {
    signatureId: "sig_router_01",
    deviceType: "router",
    vendor: "Cisco",
    keywords: ["CISCO", "ROUTER", "WRT"],
    riskLevel: "medium",
    description: "Routeur ou point d'acces visible.",
  },
  {
    signatureId: "sig_voice_01",
    deviceType: "smart_speaker",
    vendor: "Amazon",
    keywords: ["ALEXA", "ECHO", "AMAZON"],
    riskLevel: "medium",
    description: "Assistant vocal detecte.",
  },
  {
    signatureId: "sig_camera_other_01",
    deviceType: "ip_camera",
    vendor: "Unknown",
    keywords: ["CAMERA", "WEB", "IP"],
    riskLevel: "high",
    description: "Appareil video non identifie.",
  },
];

const DEFAULT_VENDOR_DATABASE = [
  { oui: "A4:12:F4", vendorName: "Apple Inc.", deviceCategory: "smartphone" },
  { oui: "00:1A:11", vendorName: "Cisco Systems", deviceCategory: "router" },
  { oui: "3C:5A:B4", vendorName: "Hikvision", deviceCategory: "ip_camera" },
  { oui: "F4:5C:89", vendorName: "Xiaomi", deviceCategory: "smartphone" },
  { oui: "BC:AE:C5", vendorName: "Samsung Electronics", deviceCategory: "smartphone" },
  { oui: "FC:FB:FB", vendorName: "Nest Labs", deviceCategory: "smarthome" },
  { oui: "3C:7A:64", vendorName: "Belkin", deviceCategory: "smarthome" },
];

const DEMO_PASSWORD = "Test1234!";
const DEMO_USER_TEMPLATES = [
  { email: "visitor@test.com", displayName: "Visitor User", accountType: "visitor" },
  { email: "free@test.com", displayName: "Free User", accountType: "free" },
  { email: "premium@test.com", displayName: "Premium User", accountType: "premium" },
  { email: "user4@test.com", displayName: "User 4", accountType: "free" },
  { email: "user5@test.com", displayName: "User 5", accountType: "premium" },
  { email: "user6@test.com", displayName: "User 6", accountType: "visitor" },
  { email: "user7@test.com", displayName: "User 7", accountType: "free" },
  { email: "user8@test.com", displayName: "User 8", accountType: "premium" },
  { email: "user9@test.com", displayName: "User 9", accountType: "free" },
  { email: "user10@test.com", displayName: "User 10", accountType: "visitor" },
  { email: "user11@test.com", displayName: "User 11", accountType: "premium" },
  { email: "user12@test.com", displayName: "User 12", accountType: "free" },
];

const VISUAL_CHECKLIST = [
  "Verifier les detecteurs de fumee et reveils.",
  "Controler les prises, chargeurs et boitiers USB.",
  "Observer les objets orientes vers le lit ou la salle de bain.",
  "Chercher les reflets inhabituels sur miroirs et surfaces sombres.",
];

function initFirebase() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  try {
    const serviceAccount = require(serviceAccountPath);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
    });
  } catch (error) {
    console.error("[server] Impossible de charger les credentials Firebase Admin.", error);
    process.exit(1);
  }
}

initFirebase();

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return nowIso().slice(0, 10);
}

function makeId(prefix) {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function planQuota(plan) {
  if (plan === "visitor") return 1;
  if (plan === "free") return 5;
  return 999;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeMacAddress(macAddress) {
  return String(macAddress || "")
    .trim()
    .replace(/-/g, ":")
    .toUpperCase();
}

function sendError(res, status, message, details) {
  return res.status(status).json({
    ok: false,
    message,
    ...(details ? { details } : {}),
  });
}

function mapAuthError(error, fallbackMessage = "Authentication error") {
  const code = error?.code || "";
  const message = error?.message || fallbackMessage;

  if (code === "auth/email-already-exists") {
    return { status: 409, message: "Un compte existe deja avec cet email." };
  }
  if (code === "auth/invalid-password" || code === "auth/weak-password") {
    return { status: 400, message: "Le mot de passe doit contenir au moins 6 caracteres." };
  }
  if (code === "auth/invalid-email") {
    return { status: 400, message: "Adresse email invalide." };
  }
  if (message.includes("EMAIL_EXISTS")) {
    return { status: 409, message: "Un compte existe deja avec cet email." };
  }
  if (
    message.includes("INVALID_LOGIN_CREDENTIALS") ||
    message.includes("INVALID_PASSWORD") ||
    message.includes("EMAIL_NOT_FOUND")
  ) {
    return { status: 401, message: "Email ou mot de passe incorrect." };
  }

  return { status: 400, message };
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? "User",
    accountType: user.accountType ?? (user.isPremium ? "premium" : "free"),
    createdAt: user.createdAt ?? nowIso(),
    lastLogin: user.lastLogin ?? nowIso(),
    lastQuotaResetDate: user.lastQuotaResetDate ?? todayIso(),
    scanQuotaPerDay: typeof user.scanQuotaPerDay === "number" ? user.scanQuotaPerDay : planQuota(user.accountType),
    scansUsedToday: typeof user.scansUsedToday === "number" ? user.scansUsedToday : 0,
    isPremium: Boolean(user.isPremium),
    premiumExpiresAt: user.premiumExpiresAt ?? null,
    preferences: {
      notifications: user.preferences?.notifications ?? true,
      allowBluetoothScan: user.preferences?.allowBluetoothScan ?? true,
      allowNetworkScan: user.preferences?.allowNetworkScan ?? true,
      allowCameraInspection: user.preferences?.allowCameraInspection ?? Boolean(user.isPremium),
    },
    consent: {
      analytics: user.consent?.analytics ?? true,
      privacyAccepted: user.consent?.privacyAccepted ?? true,
    },
  };
}

async function signInWithPassword(email, password) {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing EXPO_PUBLIC_FIREBASE_API_KEY");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Authentication failed");
  }

  return data;
}

async function signInAnonymously() {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing EXPO_PUBLIC_FIREBASE_API_KEY");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Anonymous authentication failed");
  }

  return data;
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, 401, "Missing Authorization header");
  }

  const idToken = authHeader.replace("Bearer ", "").trim();
  try {
    const decoded = await auth.verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (error) {
    return sendError(res, 401, "Invalid or expired token");
  }
}

async function ensureStaticCollections() {
  await db.doc(ADS_CONFIG_DOC).set(DEFAULT_ADS_CONFIG, { merge: true });
  await db.doc(SCAN_STATS_DOC).set(DEFAULT_SCAN_STATS, { merge: true });

  const vendorBatch = db.batch();
  DEFAULT_VENDOR_DATABASE.forEach((vendor) => {
    vendorBatch.set(db.collection("vendorDatabase").doc(vendor.oui), vendor, { merge: true });
  });
  await vendorBatch.commit();

  const signatureBatch = db.batch();
  DEFAULT_THREAT_SIGNATURES.forEach((signature) => {
    signatureBatch.set(db.collection("threatSignatures").doc(signature.signatureId), signature, {
      merge: true,
    });
  });
  await signatureBatch.commit();
}

function makeBaseUserProfile(uid, email, displayName, accountType) {
  const isPremium = accountType === "premium";
  return sanitizeUser({
    uid,
    email,
    displayName,
    accountType,
    createdAt: nowIso(),
    lastLogin: nowIso(),
    lastQuotaResetDate: todayIso(),
    scanQuotaPerDay: planQuota(accountType),
    scansUsedToday: 0,
    isPremium,
    premiumExpiresAt: isPremium
      ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
      : null,
    preferences: {
      notifications: true,
      allowBluetoothScan: true,
      allowNetworkScan: true,
      allowCameraInspection: isPremium,
    },
    consent: {
      analytics: true,
      privacyAccepted: true,
    },
  });
}

async function getUserProfile(uid) {
  const snapshot = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!snapshot.exists) return null;
  return sanitizeUser(snapshot.data());
}

async function ensureUserProfileFromRecord(userRecord, accountType = "free") {
  const userRef = db.collection(USERS_COLLECTION).doc(userRecord.uid);
  const snapshot = await userRef.get();
  if (snapshot.exists) {
    return sanitizeUser(snapshot.data());
  }

  const profile = makeBaseUserProfile(
    userRecord.uid,
    userRecord.email ?? null,
    userRecord.displayName ?? userRecord.email ?? "User",
    accountType
  );
  await userRef.set(profile, { merge: true });
  return profile;
}

async function getHydratedProfile(uid) {
  const profile = await getUserProfile(uid);
  if (!profile) {
    const userRecord = await auth.getUser(uid);
    return ensureUserProfileFromRecord(userRecord, "free");
  }

  if (profile.lastQuotaResetDate !== todayIso()) {
    const updated = {
      scansUsedToday: 0,
      lastQuotaResetDate: todayIso(),
      scanQuotaPerDay: planQuota(profile.accountType),
      lastLogin: nowIso(),
    };
    await db.collection(USERS_COLLECTION).doc(uid).set(updated, { merge: true });
    return sanitizeUser({ ...profile, ...updated });
  }

  return profile;
}

async function ensureDemoUsersSeeded() {
  for (const template of DEMO_USER_TEMPLATES) {
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(template.email);
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        throw error;
      }
      userRecord = await auth.createUser({
        email: template.email,
        password: DEMO_PASSWORD,
        displayName: template.displayName,
      });
    }

    await ensureUserProfileFromRecord(userRecord, template.accountType);
  }
}

async function loadTrustedDevices(uid) {
  const snapshot = await db.collection(USERS_COLLECTION).doc(uid).collection("trustedDevices").get();
  return new Set(
    snapshot.docs.map((doc) => normalizeMacAddress(doc.data().macAddress)).filter(Boolean)
  );
}

async function loadVendorDatabase() {
  const snapshot = await db.collection("vendorDatabase").get();
  if (snapshot.empty) {
    return Object.fromEntries(DEFAULT_VENDOR_DATABASE.map((vendor) => [vendor.oui, vendor]));
  }
  return Object.fromEntries(snapshot.docs.map((doc) => [doc.id, doc.data()]));
}

async function loadThreatSignatures() {
  const snapshot = await db.collection("threatSignatures").get();
  if (snapshot.empty) {
    return DEFAULT_THREAT_SIGNATURES;
  }
  return snapshot.docs.map((doc) => doc.data());
}

function buildVendorInfo(vendorDatabase, macAddress) {
  const prefix = normalizeMacAddress(macAddress)
    .split(":")
    .slice(0, 3)
    .join(":")
    .toUpperCase();
  return (
    vendorDatabase[prefix] || {
      oui: prefix,
      vendorName: "Unknown",
      deviceCategory: "unknown",
    }
  );
}

function buildRisk(input) {
  const { network, bluetooth, visual } = input;
  let score = 0;
  score += network.suspicious * 12;
  score += bluetooth.suspicious * 14;
  score += visual.flags * 10;

  if (network.detected > 8) score += 6;
  if (bluetooth.detected > 6) score += 5;
  if (network.suspicious >= 2) score += 8;
  if (bluetooth.suspicious >= 2) score += 10;

  score = Math.max(0, Math.min(100, score));

  let riskLevel = "secure";
  if (score > 20 && score <= 40) riskLevel = "low";
  else if (score > 40 && score <= 60) riskLevel = "moderate";
  else if (score > 60 && score <= 80) riskLevel = "high";
  else if (score > 80) riskLevel = "critical";

  const reasons = [];
  if (network.suspicious > 0) reasons.push("Des equipements reseau inhabituels ont ete reperes.");
  if (bluetooth.suspicious > 0) reasons.push("Des signaux Bluetooth puissants ou inconnus ont ete detectes.");
  if (visual.flags > 0) reasons.push("Des points de controle visuels meritent une verification manuelle.");
  if (reasons.length === 0) reasons.push("Aucune menace evidente n'a ete observee pendant ce passage.");

  const recommendations = [
    "Utilisez ce score comme un indicateur d'inspection et non comme une preuve absolue.",
  ];
  if (riskLevel === "moderate") {
    recommendations.push("Refaites un controle cible des objets connectes et des prises visibles.");
  }
  if (riskLevel === "high" || riskLevel === "critical") {
    recommendations.push("Inspectez la piece plus en detail et contactez l'hote si un doute persiste.");
    recommendations.push("Comparez les appareils detectes avec vos equipements de confiance.");
  }
  if (visual.flags > 0) {
    recommendations.push("Prenez des photos et ajoutez des notes pour garder une trace des anomalies.");
  }

  return { riskScore: score, riskLevel, reasons, recommendations };
}

function normalizeSuspicionLevel(level) {
  if (level === "high" || level === "critical") return "high";
  if (level === "medium" || level === "moderate") return "medium";
  return "low";
}

function normalizeIncomingSignal(signal, trustedDevices) {
  if (!signal || typeof signal !== "object") return null;

  const identifier = String(signal.identifier || signal.signalId || "").trim();
  const type = String(signal.type || "").trim().toLowerCase();
  const deviceName = String(signal.deviceName || signal.hostname || signal.ipAddress || "").trim();
  const normalizedMacAddress = signal.macAddress ? normalizeMacAddress(signal.macAddress) : null;
  const isTrusted = normalizedMacAddress ? trustedDevices.has(normalizedMacAddress) : false;
  const detectedAt = String(signal.detectedAt || nowIso());
  const suspicionLevel = isTrusted ? "low" : normalizeSuspicionLevel(signal.suspicionLevel);
  const suspicionScore = isTrusted
    ? 0
    : Math.max(0, Math.min(100, Number.isFinite(signal.suspicionScore) ? signal.suspicionScore : 0));
  const estimatedDistanceMeters =
    Number.isFinite(signal.estimatedDistanceMeters) && signal.estimatedDistanceMeters >= 0
      ? Number(signal.estimatedDistanceMeters)
      : null;

  if (!type || !deviceName) {
    return null;
  }

  return {
    signalId: String(signal.signalId || makeId("signal")),
    type,
    deviceName,
    identifier: identifier || normalizedMacAddress || null,
    hostname: signal.hostname ? String(signal.hostname) : null,
    ipAddress: signal.ipAddress ? String(signal.ipAddress) : null,
    macAddress: normalizedMacAddress,
    vendor: signal.vendor ? String(signal.vendor) : "Unknown",
    category: signal.category ? String(signal.category) : signal.deviceType ? String(signal.deviceType) : "unknown",
    deviceType: signal.deviceType ? String(signal.deviceType) : signal.category ? String(signal.category) : "unknown",
    hardwareHint: signal.hardwareHint ? String(signal.hardwareHint) : null,
    signalStrength: Number.isFinite(signal.signalStrength) ? Number(signal.signalStrength) : 0,
    suspicionScore,
    suspicionLevel,
    reason: isTrusted
      ? "Appareil ajoute a votre liste de confiance."
      : String(signal.reason || "Signal radio detecte a proximite."),
    reasons: Array.isArray(signal.reasons)
      ? signal.reasons.map((reason) => String(reason)).filter(Boolean)
      : [String(signal.reason || "Signal radio detecte a proximite.")],
    openPorts: Array.isArray(signal.openPorts)
      ? signal.openPorts.filter((port) => Number.isInteger(port)).map((port) => Number(port))
      : [],
    exposedServices: Array.isArray(signal.exposedServices)
      ? signal.exposedServices.map((service) => String(service)).filter(Boolean)
      : [],
    estimatedDistanceMeters,
    isTrusted,
    detectedAt,
  };
}

function summarizeSignals(signals, summaryText, extra = {}) {
  return {
    detectedDevices: signals.length,
    suspiciousDevices: signals.filter((signal) => signal.suspicionLevel !== "low").length,
    ...extra,
    ...(summaryText ? { summaryText } : {}),
  };
}

function buildProximityHighlights(proximitySummary, bluetoothSignals, wifiSignals) {
  const highlights = [];
  const recommendations = [];
  const notes = Array.isArray(proximitySummary?.notes) ? proximitySummary.notes : [];

  if (bluetoothSignals.length > 0) {
    highlights.push(`${bluetoothSignals.length} appareil(s) Bluetooth Low Energy visibles a proximite.`);
  }
  if (wifiSignals.length > 0) {
    highlights.push(`${wifiSignals.length} reseau(x) Wi-Fi ou point(s) d'acces proches detectes.`);
  }
  if (bluetoothSignals.some((signal) => signal.suspicionLevel !== "low")) {
    highlights.push("Certains signaux Bluetooth presentent un profil compatible avec un tracker ou un objet connecte.");
  }
  if (wifiSignals.some((signal) => signal.suspicionLevel !== "low")) {
    highlights.push("Certains reseaux Wi-Fi proches meritent une verification manuelle.");
  }
  const topSignals = [...bluetoothSignals, ...wifiSignals]
    .filter((signal) => signal.suspicionLevel !== "low")
    .sort((left, right) => (right.suspicionScore || 0) - (left.suspicionScore || 0))
    .slice(0, 3);
  topSignals.forEach((signal) => {
    highlights.push(`${signal.deviceName}: ${signal.reason}`);
  });

  if (notes.length > 0) {
    recommendations.push(...notes);
  }
  if (proximitySummary?.suspiciousDetected > 0) {
    recommendations.push("Recontrolez les appareils tres proches ou inconnus signales par le scan radio.");
  }

  return {
    highlights: Array.from(new Set(highlights)).filter(Boolean),
    recommendations: Array.from(new Set(recommendations)).filter(Boolean),
  };
}

async function createScanAnalysis(profile, payload = {}) {
  const [vendorDatabase, trustedDevices, threatSignatures] = await Promise.all([
    loadVendorDatabase(),
    loadTrustedDevices(profile.uid),
    loadThreatSignatures(),
  ]);
  const networkAnalysis = await analyzeLocalLan({
    vendorDatabase,
    trustedDevices,
    threatSignatures,
  });

  const lanSignals = networkAnalysis.devices.map((device) => ({
    signalId: makeId("signal"),
    type: "network",
    deviceName: device.deviceName,
    identifier: device.macAddress || device.ipAddress,
    hostname: device.hostname,
    ipAddress: device.ipAddress,
    macAddress: device.macAddress,
    vendor: device.vendor,
    category: device.deviceType,
    deviceType: device.deviceType,
    hardwareHint: device.hardwareHint,
    signalStrength: 0,
    suspicionScore: device.suspicionScore,
    suspicionLevel: device.suspicionLevel,
    reason: device.reason,
    reasons: device.reasons,
    openPorts: device.openPorts,
    exposedServices: device.exposedServices,
    estimatedDistanceMeters: null,
    isTrusted: device.isTrusted,
    detectedAt: nowIso(),
  }));

  const proximitySignals = Array.isArray(payload.proximitySignals)
    ? payload.proximitySignals
        .map((signal) => normalizeIncomingSignal(signal, trustedDevices))
        .filter(Boolean)
    : [];
  const bluetoothSignals = proximitySignals.filter((signal) => signal.type === "bluetooth");
  const wifiSignals = proximitySignals.filter((signal) => signal.type === "wifi");
  const signals = [...bluetoothSignals, ...wifiSignals, ...lanSignals];
  const proximitySummary = payload.proximitySummary && typeof payload.proximitySummary === "object"
    ? payload.proximitySummary
    : null;
  const proximityHighlights = buildProximityHighlights(proximitySummary, bluetoothSignals, wifiSignals);
  const cameraLikeCount =
    networkAnalysis.summary.suspectedCameraLikeDevices +
    wifiSignals.filter((signal) => signal.deviceType === "camera_compatible").length +
    bluetoothSignals.filter((signal) => signal.deviceType === "camera_compatible").length;
  const iotLikeCount =
    networkAnalysis.summary.suspectedIotDevices +
    wifiSignals.filter((signal) => signal.deviceType === "iot_device").length +
    bluetoothSignals.filter((signal) => signal.deviceType === "iot_device").length +
    bluetoothSignals.filter((signal) => signal.deviceType === "tracker").length;
  const networkSummaryText = [proximitySummary?.summaryText, networkAnalysis.summary.summaryText]
    .filter(Boolean)
    .join(" ");

  const networkSummary = summarizeSignals(wifiSignals.concat(lanSignals), networkSummaryText, {
    suspectedCameraLikeDevices: cameraLikeCount,
    suspectedIotDevices: iotLikeCount,
    scannedHosts: networkAnalysis.summary.scannedHosts,
    responsiveHosts: networkAnalysis.summary.responsiveHosts,
    networkRange: networkAnalysis.summary.networkRange,
    gateway: networkAnalysis.summary.gateway,
    localAddress: networkAnalysis.summary.localAddress,
    coverage: networkAnalysis.summary.coverage,
  });
  const bluetoothSummary = summarizeSignals(
    bluetoothSignals,
    proximitySummary?.notes?.length
      ? proximitySummary.notes.join(" ")
      : bluetoothSignals.length > 0
        ? "Signaux BLE detectes a proximite."
        : "Aucun signal BLE retenu sur ce passage."
  );
  const visualFlags =
    Number.isFinite(payload.visualFlags) && payload.visualFlags >= 0
      ? Math.floor(payload.visualFlags)
      : 0;
  const visualSummary = { flags: Math.max(0, Math.min(4, visualFlags)) };
  const threat = buildRisk({
    network: { detected: networkSummary.detectedDevices, suspicious: networkSummary.suspiciousDevices },
    bluetooth: { detected: bluetoothSummary.detectedDevices, suspicious: bluetoothSummary.suspiciousDevices },
    visual: { flags: visualSummary.flags },
  });
  const reasons = Array.from(
    new Set([...threat.reasons, ...networkAnalysis.highlights, ...proximityHighlights.highlights])
  ).filter(Boolean);
  const recommendations = Array.from(
    new Set([
      ...threat.recommendations,
      ...networkAnalysis.recommendations,
      ...proximityHighlights.recommendations,
    ])
  ).filter(Boolean);

  return {
    scan: {
      scanId: makeId("scan"),
      userId: profile.uid,
      createdAt: nowIso(),
      finishedAt: nowIso(),
      location: {
        label: String(payload.locationLabel || "Analyse mobile SafeRoom"),
        city: String(payload.city || "Local"),
        country: String(payload.country || "Session"),
      },
      networkSummary,
      bluetoothSummary,
      visualSummary,
      signalsCount: signals.length,
      riskScore: threat.riskScore,
      riskLevel: threat.riskLevel,
      reasons,
      recommendations,
      reportLocked: profile.accountType !== "premium",
      inspection: null,
      notes: payload.notes ? String(payload.notes) : "",
    },
    signals,
  };
}

async function saveInspectionImage(uid, inspectionId, photoBase64, photoMimeType) {
  if (!photoBase64) return null;

  const bucket = storage.bucket();
  if (!bucket?.name) return null;

  const ext = photoMimeType === "image/png" ? "png" : "jpg";
  const filePath = `inspections/${uid}/${inspectionId}.${ext}`;
  const file = bucket.file(filePath);
  await file.save(Buffer.from(String(photoBase64).replace(/^data:.*;base64,/, ""), "base64"), {
    metadata: { contentType: photoMimeType || "image/jpeg" },
    resumable: false,
  });

  return {
    bucket: bucket.name,
    path: filePath,
    gsUrl: `gs://${bucket.name}/${filePath}`,
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get(`${API_PREFIX}/health`, (_req, res) =>
  res.json({
    ok: true,
    storage: "firebase",
    timestamp: nowIso(),
  })
);

app.post(`${API_PREFIX}/auth/register`, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const displayName = String(req.body.displayName || email).trim();

  if (!email || !password || !displayName) {
    return sendError(res, 400, "email, password and displayName are required");
  }

  if (password.length < 6) {
    return sendError(res, 400, "Le mot de passe doit contenir au moins 6 caracteres.");
  }

  try {
    const userRecord = await auth.createUser({ email, password, displayName });
    const profile = await ensureUserProfileFromRecord(userRecord, "free");
    const authData = await signInWithPassword(email, password);

    return res.json({
      ok: true,
      uid: userRecord.uid,
      idToken: authData.idToken,
      refreshToken: authData.refreshToken,
      profile,
    });
  } catch (error) {
    const mapped = mapAuthError(error, "Failed to create user");
    return sendError(res, mapped.status, mapped.message);
  }
});

app.post(`${API_PREFIX}/auth/login`, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  if (!email || !password) {
    return sendError(res, 400, "email and password are required");
  }

  try {
    const authData = await signInWithPassword(email, password);
    const userRecord = await auth.getUser(authData.localId);
    const profile = await ensureUserProfileFromRecord(userRecord, "free");
    await db.collection(USERS_COLLECTION).doc(userRecord.uid).set({ lastLogin: nowIso() }, { merge: true });

    return res.json({
      ok: true,
      uid: userRecord.uid,
      idToken: authData.idToken,
      refreshToken: authData.refreshToken,
      plan: profile.accountType,
      profile,
    });
  } catch (error) {
    const mapped = mapAuthError(error, "Invalid email or password");
    return sendError(res, mapped.status, mapped.message);
  }
});

app.post(`${API_PREFIX}/auth/anonymous`, async (_req, res) => {
  try {
    const authData = await signInAnonymously();
    const userRecord = await auth.getUser(authData.localId);
    const profile = await ensureUserProfileFromRecord(userRecord, "visitor");
    return res.json({
      ok: true,
      uid: userRecord.uid,
      idToken: authData.idToken,
      refreshToken: authData.refreshToken,
      profile,
    });
  } catch (error) {
    return sendError(res, 400, error.message || "Anonymous authentication failed");
  }
});

app.post(`${API_PREFIX}/auth/logout`, verifyToken, async (_req, res) => res.json({ ok: true }));

app.get(`${API_PREFIX}/auth/me`, verifyToken, async (req, res) => {
  try {
    const profile = await getHydratedProfile(req.user.uid);
    return res.json({ ok: true, profile });
  } catch (error) {
    return sendError(res, 500, "Unable to load user profile");
  }
});

app.get(`${API_PREFIX}/users/:userId`, verifyToken, async (req, res) => {
  if (req.user.uid !== req.params.userId) return sendError(res, 403, "Forbidden");
  const profile = await getHydratedProfile(req.user.uid);
  return res.json({ ok: true, user: profile });
});

app.patch(`${API_PREFIX}/users/:userId`, verifyToken, async (req, res) => {
  if (req.user.uid !== req.params.userId) return sendError(res, 403, "Forbidden");

  const update = {};
  if (typeof req.body.displayName === "string" && req.body.displayName.trim()) {
    update.displayName = req.body.displayName.trim();
  }
  if (req.body.preferences && typeof req.body.preferences === "object") {
    update.preferences = req.body.preferences;
  }
  if (req.body.consent && typeof req.body.consent === "object") {
    update.consent = req.body.consent;
  }

  await db.collection(USERS_COLLECTION).doc(req.user.uid).set({ ...update, lastLogin: nowIso() }, { merge: true });
  const profile = await getHydratedProfile(req.user.uid);
  return res.json({ ok: true, user: profile });
});

app.delete(`${API_PREFIX}/users/:userId`, verifyToken, async (req, res) => {
  if (req.user.uid !== req.params.userId) return sendError(res, 403, "Forbidden");
  await db.recursiveDelete(db.collection(USERS_COLLECTION).doc(req.user.uid));
  await auth.deleteUser(req.user.uid);
  return res.json({ ok: true });
});

app.get(`${API_PREFIX}/users/:userId/trusted-devices`, verifyToken, async (req, res) => {
  if (req.user.uid !== req.params.userId) return sendError(res, 403, "Forbidden");
  const snapshot = await db.collection(USERS_COLLECTION).doc(req.user.uid).collection("trustedDevices").get();
  return res.json({ ok: true, devices: snapshot.docs.map((doc) => doc.data()) });
});

app.post(`${API_PREFIX}/users/:userId/trusted-devices`, verifyToken, async (req, res) => {
  if (req.user.uid !== req.params.userId) return sendError(res, 403, "Forbidden");
  const deviceName = String(req.body.deviceName || "").trim();
  const macAddress = normalizeMacAddress(req.body.macAddress);
  if (!deviceName || !macAddress) {
    return sendError(res, 400, "deviceName and macAddress are required");
  }

  const vendor = buildVendorInfo(await loadVendorDatabase(), macAddress);
  const device = {
    deviceId: makeId("device"),
    deviceName,
    macAddress,
    vendor: vendor.vendorName,
    category: vendor.deviceCategory,
    addedAt: nowIso(),
  };

  await db
    .collection(USERS_COLLECTION)
    .doc(req.user.uid)
    .collection("trustedDevices")
    .doc(device.deviceId)
    .set(device);

  return res.json({ ok: true, device });
});

app.delete(`${API_PREFIX}/users/:userId/trusted-devices/:deviceId`, verifyToken, async (req, res) => {
  if (req.user.uid !== req.params.userId) return sendError(res, 403, "Forbidden");
  await db
    .collection(USERS_COLLECTION)
    .doc(req.user.uid)
    .collection("trustedDevices")
    .doc(req.params.deviceId)
    .delete();
  return res.json({ ok: true });
});

app.get(`${API_PREFIX}/threat-signatures`, async (_req, res) => {
  const snapshot = await db.collection("threatSignatures").get();
  return res.json({ ok: true, signatures: snapshot.docs.map((doc) => doc.data()) });
});

app.post(`${API_PREFIX}/threat-signatures`, verifyToken, async (req, res) => {
  if (!req.body?.signatureId) return sendError(res, 400, "signatureId is required");
  await db.collection("threatSignatures").doc(req.body.signatureId).set(req.body, { merge: true });
  return res.json({ ok: true, signature: req.body });
});

app.get(`${API_PREFIX}/vendors/:macPrefix`, async (req, res) => {
  const snapshot = await db.collection("vendorDatabase").doc(String(req.params.macPrefix).toUpperCase()).get();
  if (!snapshot.exists) return sendError(res, 404, "Vendor not found");
  return res.json({ ok: true, vendor: snapshot.data() });
});

app.get(`${API_PREFIX}/premium/status`, verifyToken, async (req, res) => {
  const profile = await getHydratedProfile(req.user.uid);
  return res.json({
    ok: true,
    accountType: profile.accountType,
    isPremium: profile.isPremium,
    premiumExpiresAt: profile.premiumExpiresAt,
  });
});

app.post(`${API_PREFIX}/premium/activate`, verifyToken, async (req, res) => {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await db.collection(USERS_COLLECTION).doc(req.user.uid).set(
    {
      accountType: "premium",
      isPremium: true,
      premiumExpiresAt: expiresAt,
      scanQuotaPerDay: 999,
      preferences: { allowCameraInspection: true },
      lastLogin: nowIso(),
    },
    { merge: true }
  );
  const profile = await getHydratedProfile(req.user.uid);
  return res.json({ ok: true, premiumExpiresAt: expiresAt, profile });
});

app.post(`${API_PREFIX}/premium/cancel`, verifyToken, async (req, res) => {
  await db.collection(USERS_COLLECTION).doc(req.user.uid).set(
    {
      accountType: "free",
      isPremium: false,
      premiumExpiresAt: null,
      scanQuotaPerDay: 5,
      preferences: { allowCameraInspection: false },
      lastLogin: nowIso(),
    },
    { merge: true }
  );
  const profile = await getHydratedProfile(req.user.uid);
  return res.json({ ok: true, profile });
});

app.get(`${API_PREFIX}/ads/config`, async (_req, res) => {
  const snapshot = await db.doc(ADS_CONFIG_DOC).get();
  return res.json({ ok: true, config: snapshot.exists ? snapshot.data() : DEFAULT_ADS_CONFIG });
});

app.get(`${API_PREFIX}/stats/global`, async (_req, res) => {
  const snapshot = await db.doc(SCAN_STATS_DOC).get();
  return res.json({ ok: true, stats: snapshot.exists ? snapshot.data() : DEFAULT_SCAN_STATS });
});

app.get(`${API_PREFIX}/stats/user/:userId`, verifyToken, async (req, res) => {
  if (req.user.uid !== req.params.userId) return sendError(res, 403, "Forbidden");
  const scansSnapshot = await db.collection(USERS_COLLECTION).doc(req.user.uid).collection("scans").get();
  const scans = scansSnapshot.docs.map((doc) => doc.data());
  return res.json({
    ok: true,
    stats: {
      totalScans: scans.length,
      suspiciousScans: scans.filter((scan) => ["moderate", "high", "critical"].includes(scan.riskLevel)).length,
      user: await getHydratedProfile(req.user.uid),
    },
  });
});

app.post(`${API_PREFIX}/scans/run`, verifyToken, async (req, res) => {
  try {
    const userRef = db.collection(USERS_COLLECTION).doc(req.user.uid);
    const updatedProfile = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(userRef);
      const current = sanitizeUser(snapshot.exists ? snapshot.data() : null);
      if (!current) {
        throw new Error("PROFILE_NOT_FOUND");
      }

      const profile =
        current.lastQuotaResetDate === todayIso()
          ? current
          : sanitizeUser({
              ...current,
              scansUsedToday: 0,
              lastQuotaResetDate: todayIso(),
              scanQuotaPerDay: planQuota(current.accountType),
            });

      if (profile.scansUsedToday >= profile.scanQuotaPerDay) {
        throw new Error("QUOTA_REACHED");
      }

      const nextUsed = profile.scansUsedToday + 1;
      transaction.set(
        userRef,
        {
          scansUsedToday: nextUsed,
          lastQuotaResetDate: profile.lastQuotaResetDate,
          scanQuotaPerDay: profile.scanQuotaPerDay,
          lastLogin: nowIso(),
        },
        { merge: true }
      );

      return sanitizeUser({ ...profile, scansUsedToday: nextUsed });
    });

    const { scan, signals } = await createScanAnalysis(updatedProfile, req.body);
    const savedToHistory = updatedProfile.accountType === "premium";

    if (savedToHistory) {
      const scanRef = db.collection(USERS_COLLECTION).doc(req.user.uid).collection("scans").doc(scan.scanId);
      await scanRef.set(scan);
      const signalBatch = db.batch();
      signals.forEach((signal) => {
        signalBatch.set(scanRef.collection("signals").doc(signal.signalId), signal);
      });
      await signalBatch.commit();
    }

    await db.doc(SCAN_STATS_DOC).set(
      {
        totalScans: admin.firestore.FieldValue.increment(1),
        suspiciousScans: ["moderate", "high", "critical"].includes(scan.riskLevel)
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),
        lastUpdated: nowIso(),
      },
      { merge: true }
    );

    return res.json({
      ok: true,
      scan,
      signals,
      savedToHistory,
      quota: {
        used: updatedProfile.scansUsedToday,
        limit: updatedProfile.scanQuotaPerDay,
        remaining: Math.max(0, updatedProfile.scanQuotaPerDay - updatedProfile.scansUsedToday),
      },
    });
  } catch (error) {
    if (error.message === "QUOTA_REACHED") {
      return sendError(res, 403, "Daily scan quota reached");
    }
    if (error.message === "PROFILE_NOT_FOUND") {
      return sendError(res, 404, "User profile not found");
    }
    return sendError(res, 500, error.message || "Unable to run scan");
  }
});

app.get(`${API_PREFIX}/users/:userId/scans`, verifyToken, async (req, res) => {
  if (req.user.uid !== req.params.userId) return sendError(res, 403, "Forbidden");
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .doc(req.user.uid)
    .collection("scans")
    .orderBy("createdAt", "desc")
    .get();
  return res.json({ ok: true, scans: snapshot.docs.map((doc) => doc.data()) });
});

app.get(`${API_PREFIX}/scans/:scanId`, verifyToken, async (req, res) => {
  const scanRef = db.collection(USERS_COLLECTION).doc(req.user.uid).collection("scans").doc(req.params.scanId);
  const scanSnapshot = await scanRef.get();
  if (!scanSnapshot.exists) return sendError(res, 404, "Scan not found");
  const signalsSnapshot = await scanRef.collection("signals").get();
  return res.json({
    ok: true,
    scan: scanSnapshot.data(),
    signals: signalsSnapshot.docs.map((doc) => doc.data()),
  });
});

app.get(`${API_PREFIX}/scans/:scanId/signals`, verifyToken, async (req, res) => {
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .doc(req.user.uid)
    .collection("scans")
    .doc(req.params.scanId)
    .collection("signals")
    .get();
  return res.json({ ok: true, signals: snapshot.docs.map((doc) => doc.data()) });
});

app.patch(`${API_PREFIX}/signals/:signalId`, verifyToken, async (req, res) => {
  const scansSnapshot = await db.collection(USERS_COLLECTION).doc(req.user.uid).collection("scans").get();
  for (const scanDoc of scansSnapshot.docs) {
    const signalRef = scanDoc.ref.collection("signals").doc(req.params.signalId);
    const signalSnapshot = await signalRef.get();
    if (signalSnapshot.exists) {
      await signalRef.set(req.body || {}, { merge: true });
      return res.json({ ok: true, signal: { ...signalSnapshot.data(), ...(req.body || {}) } });
    }
  }
  return sendError(res, 404, "Signal not found");
});

app.delete(`${API_PREFIX}/scans/:scanId`, verifyToken, async (req, res) => {
  const scanRef = db.collection(USERS_COLLECTION).doc(req.user.uid).collection("scans").doc(req.params.scanId);
  const scanSnapshot = await scanRef.get();
  if (!scanSnapshot.exists) return sendError(res, 404, "Scan not found");
  await db.recursiveDelete(scanRef);
  return res.json({ ok: true });
});

app.post(`${API_PREFIX}/users/:userId/inspections`, verifyToken, async (req, res) => {
  if (req.user.uid !== req.params.userId) return sendError(res, 403, "Forbidden");
  const profile = await getHydratedProfile(req.user.uid);
  if (profile.accountType !== "premium") return sendError(res, 403, "Premium account required");

  const inspectionId = makeId("inspection");
  const uploaded = await saveInspectionImage(req.user.uid, inspectionId, req.body.photoBase64, req.body.photoMimeType);
  const rawChecklist = Array.isArray(req.body.checklist) ? req.body.checklist : [];
  const inspection = {
    inspectionId,
    createdAt: nowIso(),
    notes: String(req.body.notes || "").trim(),
    checklist: rawChecklist.map((item, index) => ({
      id: String(item.id || `item_${index + 1}`),
      label: String(item.label || VISUAL_CHECKLIST[index] || `Etape ${index + 1}`),
      checked: Boolean(item.checked),
    })),
    imagePath: uploaded?.gsUrl || null,
    linkedScanId: null,
  };

  const inspectionsRef = db.collection(USERS_COLLECTION).doc(req.user.uid).collection("inspections");
  await inspectionsRef.doc(inspectionId).set(inspection);

  const latestScanQuery = await db
    .collection(USERS_COLLECTION)
    .doc(req.user.uid)
    .collection("scans")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (!latestScanQuery.empty) {
    const scanDoc = latestScanQuery.docs[0];
    inspection.linkedScanId = scanDoc.id;
    await scanDoc.ref.set({ inspection }, { merge: true });
    await inspectionsRef.doc(inspectionId).set({ linkedScanId: scanDoc.id }, { merge: true });
  }

  return res.json({ ok: true, inspection });
});

app.get(`${API_PREFIX}/users/:userId/inspections`, verifyToken, async (req, res) => {
  if (req.user.uid !== req.params.userId) return sendError(res, 403, "Forbidden");
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .doc(req.user.uid)
    .collection("inspections")
    .orderBy("createdAt", "desc")
    .get();
  return res.json({ ok: true, inspections: snapshot.docs.map((doc) => doc.data()) });
});

async function startServer() {
  try {
    await ensureStaticCollections();
    await ensureDemoUsersSeeded();
  } catch (error) {
    console.error("[server] Firebase bootstrap warning:", error);
  }

  app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}${API_PREFIX}`);
  });
}

startServer();
