/**
 * Script de seed Firebase (Firestore + Auth) pour peupler votre projet avec des données de test.
 *
 * Usage:
 *   1) Créez une clé de compte de service dans Firebase (IAM & Admin -> Comptes de service).
 *   2) Téléchargez le JSON et placez-le dans un emplacement sûr (ex: ./scripts/serviceAccountKey.json).
 *   3) Exécutez :
 *        GOOGLE_APPLICATION_CREDENTIALS=./scripts/serviceAccountKey.json node ./scripts/seed-firebase.js
 *
 *   Sur Windows PowerShell :
 *        $env:GOOGLE_APPLICATION_CREDENTIALS = "./scripts/serviceAccountKey.json";
 *        node .\scripts\seed-firebase.js
 *
 * NOTE: Ce script nécessite le package `firebase-admin`.
 *    npm install --save-dev firebase-admin
 */

const path = require("path");
const admin = require("firebase-admin");

// --- Configuration -----------------------------------------------------------
// Vous pouvez soit définir GOOGLE_APPLICATION_CREDENTIALS soit modifier le chemin ci-dessous.
// Par défaut, on cherche le fichier ./scripts/serviceAccountKey.json à côté de ce script.
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : path.resolve(__dirname, "serviceAccountKey.json");

// Collections / documents Firestore
const USERS_COLLECTION = "users";
const SCAN_STATS_DOC = "scanStats/global";
const ADS_CONFIG_DOC = "adsConfig/config";

// Helpers
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const isoDaysAgo = (days) => new Date(Date.now() - 1000 * 60 * 60 * 24 * days).toISOString();
const randomMac = () =>
  Array.from({ length: 6 })
    .map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, "0"))
    .join(":")
    .toUpperCase();

const USER_TEMPLATES = [
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

const LOCATION_OPTIONS = [
  { label: "Hôtel Paris - Chambre 302", city: "Paris", country: "France" },
  { label: "Airbnb Barcelone - Suite", city: "Barcelona", country: "Spain" },
  { label: "Appartement Berlin - Mitte", city: "Berlin", country: "Germany" },
  { label: "Auberge Lyon - Dortoir 4", city: "Lyon", country: "France" },
  { label: "Hotel Brussels - Chambre 12", city: "Brussels", country: "Belgium" },
];

const RECOMMENDATIONS = [
  "Inspecter les détecteurs de fumée",
  "Vérifier les prises murales",
  "Contrôler les objets orientés vers le lit",
  "Désactiver le Bluetooth quand non utilisé",
  "Vérifier le réseau Wi‑Fi inconnu",
  "Inspecter les prises USB dans la chambre",
];

const SIGNAL_REASONS = {
  low: "Device connu / non suspect",
  medium: "Signal BLE très fort et inconnu",
  high: "Appareil inconnu détecté avec signature suspecte",
};

const SIGNAL_TYPES = ["bluetooth", "wifi", "zigbee", "thread"];

const VENDOR_DB = [
  { oui: "A4:12:F4", vendorName: "Apple Inc.", deviceCategory: "smartphone" },
  { oui: "00:1A:11", vendorName: "Cisco Systems", deviceCategory: "router" },
  { oui: "3C:5A:B4", vendorName: "Hikvision", deviceCategory: "ip_camera" },
  { oui: "F4:5C:89", vendorName: "Xiaomi", deviceCategory: "smartphone" },
  { oui: "BC:AE:C5", vendorName: "Samsung Electronics", deviceCategory: "smartphone" },
  { oui: "00:16:3E", vendorName: "Juniper Networks", deviceCategory: "router" },
  { oui: "88:1F:A1", vendorName: "Sony", deviceCategory: "camera" },
  { oui: "D4:6A:6A", vendorName: "Google", deviceCategory: "smartphone" },
  { oui: "FC:FB:FB", vendorName: "Nest Labs", deviceCategory: "smarthome" },
  { oui: "3C:7A:64", vendorName: "Belkin", deviceCategory: "smarthome" },
];

const THREAT_SIGNATURES = [
  {
    signatureId: "sig_cam_wifi_01",
    deviceType: "ip_camera",
    vendor: "Hikvision",
    keywords: ["IPCAM", "HIKVISION", "CAMERA"],
    riskLevel: "high",
    description: "Signature correspondant à des caméras IP courantes",
  },
  {
    signatureId: "sig_router_01",
    deviceType: "router",
    vendor: "Cisco",
    keywords: ["CISCO", "WRT", "ROUTER"],
    riskLevel: "medium",
    description: "Signature de routeurs réseau, vérifier le firmware",
  },
  {
    signatureId: "sig_smartplug_01",
    deviceType: "smarthome",
    vendor: "Belkin",
    keywords: ["SMARTPLUG", "WEMO", "BELKIN"],
    riskLevel: "low",
    description: "Prise connectée détectée (généralement safe)",
  },
  {
    signatureId: "sig_voice_01",
    deviceType: "smart_speaker",
    vendor: "Amazon",
    keywords: ["ALEXA", "ECHO", "AMAZON"],
    riskLevel: "medium",
    description: "Assistant vocal détecté (possible écoute) ",
  },
  {
    signatureId: "sig_tv_01",
    deviceType: "smart_tv",
    vendor: "Samsung",
    keywords: ["SMARTTV", "TIZEN", "SAMSUNG"],
    riskLevel: "low",
    description: "Télévision connectée détectée",
  },
  {
    signatureId: "sig_camera_other_01",
    deviceType: "ip_camera",
    vendor: "Unknown",
    keywords: ["CAMERA", "IPCAM", "WEB"],
    riskLevel: "high",
    description: "Caméra IP inconnue détectée",
  },
  {
    signatureId: "sig_router_02",
    deviceType: "router",
    vendor: "TP-Link",
    keywords: ["TP-LINK", "TL-", "ROUTER"],
    riskLevel: "medium",
    description: "Routeur grand public détecté",
  },
  {
    signatureId: "sig_camera_03",
    deviceType: "ip_camera",
    vendor: "Dahua",
    keywords: ["DAHUA", "IPC", "CAMERA"],
    riskLevel: "high",
    description: "Caméra de surveillance professionnelle détectée",
  },
  {
    signatureId: "sig_hub_01",
    deviceType: "smarthome",
    vendor: "Philips",
    keywords: ["HUE", "BRIDGE", "PHILIPS"],
    riskLevel: "low",
    description: "Pont domotique détecté",
  },
  {
    signatureId: "sig_unknown_01",
    deviceType: "unknown",
    vendor: "Unknown",
    keywords: ["UNKNOWN", "UNCLASSIFIED"],
    riskLevel: "medium",
    description: "Appareil non classé détecté",
  },
];

function getScanQuota(accountType) {
  if (accountType === "visitor") return 1;
  if (accountType === "free") return 5;
  return 999;
}

function makeUserProfile(uid, template) {
  const now = new Date();
  const isPremium = template.accountType === "premium";
  const premiumExpiresAt = isPremium
    ? new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString()
    : null;
  const scanQuotaPerDay = getScanQuota(template.accountType);
  const scansUsedToday = randomInt(0, scanQuotaPerDay);

  return {
    uid,
    email: template.email,
    displayName: template.displayName,
    accountType: template.accountType,
    createdAt: isoDaysAgo(randomInt(10, 40)),
    lastLogin: isoDaysAgo(randomInt(0, 3)),
    scanQuotaPerDay,
    scansUsedToday,
    isPremium,
    premiumExpiresAt,
    preferences: {
      notifications: true,
      allowBluetoothScan: Math.random() > 0.2,
      allowNetworkScan: Math.random() > 0.1,
      allowCameraInspection: Math.random() > 0.5,
    },
    consent: {
      analytics: Math.random() > 0.2,
      privacyAccepted: true,
    },
  };
}

function createScanDoc(uid, scanIndex) {
  const createdAt = isoDaysAgo(scanIndex * 2 + 1);
  const riskScore = randomInt(10, 95);
  const riskLevel =
    riskScore < 30 ? "low" : riskScore < 70 ? "moderate" : "high";
  const location = pick(LOCATION_OPTIONS);
  const detectedDevices = randomInt(2, 18);
  const suspiciousDevices = Math.min(detectedDevices, randomInt(0, 5));
  const detectedBt = randomInt(1, 10);
  const suspiciousBt = Math.min(detectedBt, randomInt(0, 4));

  const recCount = randomInt(2, 4);
  const recommendations = Array.from({ length: recCount }).map(() => pick(RECOMMENDATIONS));

  return {
    scanId: `scan_${uid}_${scanIndex}`,
    userId: uid,
    createdAt,
    location,
    riskScore,
    riskLevel,
    networkSummary: {
      detectedDevices,
      suspiciousDevices,
    },
    bluetoothSummary: {
      detectedDevices: detectedBt,
      suspiciousDevices: suspiciousBt,
    },
    visualSummary: {
      flags: randomInt(0, 5),
    },
    recommendations,
  };
}

function createSignalDoc(scanId, signalIndex) {
  const signalStrength = randomInt(-90, -20);
  const suspicionLevel = pick(["low", "medium", "high"]);
  return {
    signalId: `signal_${scanId}_${signalIndex}`,
    type: pick(SIGNAL_TYPES),
    deviceName: `Device ${randomInt(100, 999)}`,
    macAddress: randomMac(),
    vendor: pick(["Unknown", "Apple", "Samsung", "Hikvision", "Google", "Cisco"]),
    signalStrength,
    suspicionLevel,
    reason: SIGNAL_REASONS[suspicionLevel],
    detectedAt: new Date(Date.now() - randomInt(0, 600) * 1000).toISOString(),
  };
}

async function seedGlobalCollections(db) {
  const statsDoc = db.doc(SCAN_STATS_DOC);
  await statsDoc.set({
    totalScans: 10 * USER_TEMPLATES.length,
    suspiciousScans: randomInt(10, 30),
    lastUpdated: new Date().toISOString(),
  });

  const adsDoc = db.doc(ADS_CONFIG_DOC);
  await adsDoc.set({
    enabled: true,
    provider: "admob",
    banner: true,
    interstitial: false,
    premiumNoAds: true,
  });

  const vendorBatch = db.batch();
  VENDOR_DB.forEach((vendor) => {
    const doc = db.collection("vendorDatabase").doc(vendor.oui);
    vendorBatch.set(doc, vendor);
  });
  await vendorBatch.commit();

  const signatureBatch = db.batch();
  THREAT_SIGNATURES.forEach((sig) => {
    const doc = db.collection("threatSignatures").doc(sig.signatureId);
    signatureBatch.set(doc, sig);
  });
  await signatureBatch.commit();
}

async function main() {
  console.log("📦 Initialisation du script de seed Firebase...");

  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (err) {
    console.error(
      "❌ Impossible de charger les credentials du service. Vérifiez le chemin et/ou la variable d'environnement GOOGLE_APPLICATION_CREDENTIALS.",
      err
    );
    process.exit(1);
  }

  const auth = admin.auth();
  const db = admin.firestore();

  console.log("✅ Firebase Admin initialisé (Auth + Firestore)");

  // Créer des comptes Firebase Auth + profil Firestore
  const createdUsers = [];
  for (const template of USER_TEMPLATES) {
    let user;
    try {
      user = await auth.getUserByEmail(template.email);
      console.log(`🔁 L'utilisateur existe déjà : ${template.email} (uid=${user.uid})`);
    } catch {
      user = await auth.createUser({
        email: template.email,
        password: "Test1234!",
        displayName: template.displayName,
      });
      console.log(`✅ Utilisateur créé : ${template.email} (uid=${user.uid})`);
    }

    const profile = makeUserProfile(user.uid, template);
    await db.collection(USERS_COLLECTION).doc(user.uid).set(profile);
    createdUsers.push({ user, profile });
  }

  // Créer des scans / signals / trustedDevices pour chaque utilisateur
  for (const { user, profile } of createdUsers) {
    const userPath = db.collection(USERS_COLLECTION).doc(user.uid);

    // trustedDevices
    const trustedBatch = db.batch();
    for (let i = 1; i <= 3; i += 1) {
      const devId = `device_${user.uid}_${i}`;
      trustedBatch.set(userPath.collection("trustedDevices").doc(devId), {
        deviceId: devId,
        deviceName: `Device ${i}`,
        macAddress: randomMac(),
        vendor: pick(["Apple", "Samsung", "Google", "Unknown"]),
        addedAt: isoDaysAgo(randomInt(1, 30)),
      });
    }
    await trustedBatch.commit();

    // scans + signals
    for (let scanIndex = 1; scanIndex <= 10; scanIndex += 1) {
      const scan = createScanDoc(user.uid, scanIndex);
      const scanRef = userPath.collection("scans").doc(scan.scanId);
      await scanRef.set(scan);

      const signalBatch = db.batch();
      const signalCount = randomInt(3, 6);
      for (let signalIndex = 1; signalIndex <= signalCount; signalIndex += 1) {
        const signal = createSignalDoc(scan.scanId, signalIndex);
        signalBatch.set(scanRef.collection("signals").doc(signal.signalId), signal);
      }
      await signalBatch.commit();
    }

    console.log(`✅ Données seedées pour user=${user.email} (scans=10, trustedDevices=3)`);
  }

  // Collections globales
  await seedGlobalCollections(db);

  console.log("🎉 Seed Firebase terminé. Vous pouvez maintenant utiliser ces données dans votre application.");
  console.log("👉 Pour tester, connectez-vous avec une des adresses :");
  USER_TEMPLATES.forEach((u) => console.log(`   - ${u.email} / Test1234!`));
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Erreur lors du seed :", err);
  process.exit(1);
});
