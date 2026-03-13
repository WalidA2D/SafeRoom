const path = require("path");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const DEFAULT_SERVICE_ACCOUNT = path.resolve(__dirname, "../scripts/serviceAccountKey.json");
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : DEFAULT_SERVICE_ACCOUNT;

function initFirebase() {
  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (err) {
    console.error("[server] Impossible de charger les credentials Firebase Admin", err);
    process.exit(1);
  }
}

initFirebase();

const db = admin.firestore();
const auth = admin.auth();

const app = express();
app.use(cors());
app.use(express.json());

const API_PREFIX = "/api/v1";

function sendError(res, code, message) {
  return res.status(code).json({ ok: false, message });
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
  } catch (err) {
    return sendError(res, 401, "Invalid or expired token");
  }
}

// ---------- Auth routes -------------------------------------------------------
app.post(`${API_PREFIX}/auth/register`, async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password || !displayName) {
    return sendError(res, 400, "email, password and displayName are required");
  }

  try {
    const user = await auth.createUser({ email, password, displayName });
    const customToken = await auth.createCustomToken(user.uid);

    // Create Firestore user profile
    await db.collection("users").doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      accountType: "free",
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      scanQuotaPerDay: 5,
      scansUsedToday: 0,
      isPremium: false,
      premiumExpiresAt: null,
      preferences: {
        notifications: true,
        allowBluetoothScan: true,
        allowNetworkScan: true,
        allowCameraInspection: false,
      },
      consent: {
        analytics: true,
        privacyAccepted: true,
      },
    });

    return res.json({ ok: true, uid: user.uid, token: customToken });
  } catch (err) {
    console.error("[auth/register]", err);
    return sendError(res, 400, err.message || "Failed to create user");
  }
});

app.post(`${API_PREFIX}/auth/login`, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return sendError(res, 400, "email and password are required");
  }

  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    return sendError(res, 500, "Missing Firebase API key (EXPO_PUBLIC_FIREBASE_API_KEY)");
  }

  try {
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
      return sendError(res, 400, data.error?.message || "Authentication failed");
    }

    return res.json({ ok: true, idToken: data.idToken, refreshToken: data.refreshToken, uid: data.localId });
  } catch (err) {
    console.error("[auth/login]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.post(`${API_PREFIX}/auth/anonymous`, async (req, res) => {
  try {
    const user = await auth.createUser({});
    const token = await auth.createCustomToken(user.uid);

    await db.collection("users").doc(user.uid).set({
      uid: user.uid,
      displayName: "Anonymous",
      accountType: "visitor",
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      scanQuotaPerDay: 1,
      scansUsedToday: 0,
      isPremium: false,
      premiumExpiresAt: null,
      preferences: {
        notifications: true,
        allowBluetoothScan: true,
        allowNetworkScan: true,
        allowCameraInspection: false,
      },
      consent: {
        analytics: true,
        privacyAccepted: true,
      },
    });

    return res.json({ ok: true, token, uid: user.uid });
  } catch (err) {
    console.error("[auth/anonymous]", err);
    return sendError(res, 500, "Failed to create anonymous user");
  }
});

app.post(`${API_PREFIX}/auth/logout`, verifyToken, async (req, res) => {
  // No server-side state for logout; client should clear local token.
  return res.json({ ok: true });
});

app.get(`${API_PREFIX}/auth/me`, verifyToken, async (req, res) => {
  const uid = req.user.uid;
  try {
    const doc = await db.collection("users").doc(uid).get();
    if (!doc.exists) return sendError(res, 404, "User profile not found");
    const profile = doc.data();
    return res.json({ ok: true, profile });
  } catch (err) {
    console.error("[auth/me]", err);
    return sendError(res, 500, "Internal error");
  }
});

// ---------- Users ------------------------------------------------------------
app.get(`${API_PREFIX}/users/:userId`, verifyToken, async (req, res) => {
  const { userId } = req.params;
  if (req.user.uid !== userId) return sendError(res, 403, "Forbidden");

  try {
    const doc = await db.collection("users").doc(userId).get();
    if (!doc.exists) return sendError(res, 404, "User not found");
    return res.json({ ok: true, user: doc.data() });
  } catch (err) {
    console.error("[users/get]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.patch(`${API_PREFIX}/users/:userId`, verifyToken, async (req, res) => {
  const { userId } = req.params;
  if (req.user.uid !== userId) return sendError(res, 403, "Forbidden");

  const update = { ...req.body, lastLogin: new Date().toISOString() };
  try {
    await db.collection("users").doc(userId).update(update);
    const updated = await db.collection("users").doc(userId).get();
    return res.json({ ok: true, user: updated.data() });
  } catch (err) {
    console.error("[users/patch]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.delete(`${API_PREFIX}/users/:userId`, verifyToken, async (req, res) => {
  const { userId } = req.params;
  if (req.user.uid !== userId) return sendError(res, 403, "Forbidden");

  try {
    await db.collection("users").doc(userId).delete();
    await auth.deleteUser(userId);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[users/delete]", err);
    return sendError(res, 500, "Internal error");
  }
});

// ---------- Scans ------------------------------------------------------------
app.post(`${API_PREFIX}/scans/start`, verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { locationLabel, city, country } = req.body;

  if (!locationLabel || !city || !country) {
    return sendError(res, 400, "locationLabel, city and country are required");
  }

  try {
    const scanId = `scan_${uid}_${Date.now()}`;
    const scanDoc = {
      scanId,
      userId: uid,
      createdAt: new Date().toISOString(),
      location: { label: locationLabel, city, country },
      riskScore: 0,
      riskLevel: "unknown",
      networkSummary: { detectedDevices: 0, suspiciousDevices: 0 },
      bluetoothSummary: { detectedDevices: 0, suspiciousDevices: 0 },
      visualSummary: { flags: 0 },
      recommendations: [],
    };

    await db.collection("users").doc(uid).collection("scans").doc(scanId).set(scanDoc);

    return res.json({ ok: true, scan: scanDoc });
  } catch (err) {
    console.error("[scans/start]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.post(`${API_PREFIX}/scans/:scanId/signals`, verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { scanId } = req.params;
  const { type, deviceName, macAddress, signalStrength } = req.body;

  if (!type || !deviceName || !macAddress || typeof signalStrength !== "number") {
    return sendError(res, 400, "type, deviceName, macAddress and signalStrength are required");
  }

  try {
    const scanRef = db.collection("users").doc(uid).collection("scans").doc(scanId);
    const scan = await scanRef.get();
    if (!scan.exists) return sendError(res, 404, "Scan not found");

    const signalId = `signal_${scanId}_${Date.now()}`;
    const signal = {
      signalId,
      type,
      deviceName,
      macAddress,
      vendor: "Unknown",
      signalStrength,
      suspicionLevel: "medium",
      reason: "Signal inconnu détecté",
      detectedAt: new Date().toISOString(),
    };

    await scanRef.collection("signals").doc(signalId).set(signal);

    return res.json({ ok: true, signal });
  } catch (err) {
    console.error("[scans/signals]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.post(`${API_PREFIX}/scans/:scanId/finish`, verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { scanId } = req.params;
  const { riskScore, riskLevel } = req.body;

  if (typeof riskScore !== "number" || !riskLevel) {
    return sendError(res, 400, "riskScore and riskLevel are required");
  }

  try {
    const scanRef = db.collection("users").doc(uid).collection("scans").doc(scanId);
    const scan = await scanRef.get();
    if (!scan.exists) return sendError(res, 404, "Scan not found");

    await scanRef.update({ riskScore, riskLevel, finishedAt: new Date().toISOString() });
    const updated = await scanRef.get();
    return res.json({ ok: true, scan: updated.data() });
  } catch (err) {
    console.error("[scans/finish]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.get(`${API_PREFIX}/scans/:scanId`, verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { scanId } = req.params;
  try {
    const scanRef = db.collection("users").doc(uid).collection("scans").doc(scanId);
    const scanSnap = await scanRef.get();
    if (!scanSnap.exists) return sendError(res, 404, "Scan not found");

    const signalsSnap = await scanRef.collection("signals").get();
    const signals = signalsSnap.docs.map((d) => d.data());

    return res.json({ ok: true, scan: scanSnap.data(), signals });
  } catch (err) {
    console.error("[scans/get]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.get(`${API_PREFIX}/users/:userId/scans`, verifyToken, async (req, res) => {
  const { userId } = req.params;
  if (req.user.uid !== userId) return sendError(res, 403, "Forbidden");

  try {
    const scans = [];
    const snapshot = await db.collection("users").doc(userId).collection("scans").orderBy("createdAt", "desc").get();
    snapshot.forEach((doc) => scans.push(doc.data()));
    return res.json({ ok: true, scans });
  } catch (err) {
    console.error("[scans/list]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.delete(`${API_PREFIX}/scans/:scanId`, verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { scanId } = req.params;
  try {
    await db.collection("users").doc(uid).collection("scans").doc(scanId).delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error("[scans/delete]", err);
    return sendError(res, 500, "Internal error");
  }
});

// ---------- Signals ----------------------------------------------------------
app.get(`${API_PREFIX}/scans/:scanId/signals`, verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { scanId } = req.params;

  try {
    const scanRef = db.collection("users").doc(uid).collection("scans").doc(scanId);
    const scan = await scanRef.get();
    if (!scan.exists) return sendError(res, 404, "Scan not found");

    const snap = await scanRef.collection("signals").get();
    const signals = snap.docs.map((d) => d.data());
    return res.json({ ok: true, signals });
  } catch (err) {
    console.error("[signals/list]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.patch(`${API_PREFIX}/signals/:signalId`, verifyToken, async (req, res) => {
  const { signalId } = req.params;
  const updates = req.body;

  try {
    // Recherche brutale dans les scans de l'utilisateur
    const scansSnap = await db.collection("users").doc(req.user.uid).collection("scans").get();
    for (const scanDoc of scansSnap.docs) {
      const sigRef = scanDoc.ref.collection("signals").doc(signalId);
      const sigSnap = await sigRef.get();
      if (sigSnap.exists) {
        await sigRef.update(updates);
        return res.json({ ok: true, signal: { ...sigSnap.data(), ...updates } });
      }
    }
    return sendError(res, 404, "Signal not found");
  } catch (err) {
    console.error("[signals/patch]", err);
    return sendError(res, 500, "Internal error");
  }
});

// ---------- Trusted devices --------------------------------------------------
app.get(`${API_PREFIX}/users/:userId/trusted-devices`, verifyToken, async (req, res) => {
  const { userId } = req.params;
  if (req.user.uid !== userId) return sendError(res, 403, "Forbidden");

  try {
    const snap = await db.collection("users").doc(userId).collection("trustedDevices").get();
    const list = snap.docs.map((d) => d.data());
    return res.json({ ok: true, devices: list });
  } catch (err) {
    console.error("[trusted-devices/list]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.post(`${API_PREFIX}/users/:userId/trusted-devices`, verifyToken, async (req, res) => {
  const { userId } = req.params;
  const { deviceName, macAddress } = req.body;
  if (req.user.uid !== userId) return sendError(res, 403, "Forbidden");
  if (!deviceName || !macAddress) return sendError(res, 400, "deviceName and macAddress are required");

  try {
    const deviceId = `device_${Date.now()}`;
    const device = {
      deviceId,
      deviceName,
      macAddress,
      vendor: "Unknown",
      addedAt: new Date().toISOString(),
    };

    await db.collection("users").doc(userId).collection("trustedDevices").doc(deviceId).set(device);
    return res.json({ ok: true, device });
  } catch (err) {
    console.error("[trusted-devices/add]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.delete(`${API_PREFIX}/users/:userId/trusted-devices/:deviceId`, verifyToken, async (req, res) => {
  const { userId, deviceId } = req.params;
  if (req.user.uid !== userId) return sendError(res, 403, "Forbidden");

  try {
    await db.collection("users").doc(userId).collection("trustedDevices").doc(deviceId).delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error("[trusted-devices/delete]", err);
    return sendError(res, 500, "Internal error");
  }
});

// ---------- Threat signatures ------------------------------------------------
app.get(`${API_PREFIX}/threat-signatures`, async (req, res) => {
  try {
    const snap = await db.collection("threatSignatures").get();
    const list = snap.docs.map((d) => d.data());
    return res.json({ ok: true, signatures: list });
  } catch (err) {
    console.error("[threat-signatures/list]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.post(`${API_PREFIX}/threat-signatures`, verifyToken, async (req, res) => {
  const sig = req.body;
  if (!sig?.signatureId) return sendError(res, 400, "signatureId is required");

  try {
    await db.collection("threatSignatures").doc(sig.signatureId).set(sig);
    return res.json({ ok: true, signature: sig });
  } catch (err) {
    console.error("[threat-signatures/create]", err);
    return sendError(res, 500, "Internal error");
  }
});

// ---------- Vendors ---------------------------------------------------------
app.get(`${API_PREFIX}/vendors/:macPrefix`, async (req, res) => {
  const { macPrefix } = req.params;
  try {
    const doc = await db.collection("vendorDatabase").doc(macPrefix).get();
    if (!doc.exists) return sendError(res, 404, "Vendor not found");
    return res.json({ ok: true, vendor: doc.data() });
  } catch (err) {
    console.error("[vendors/get]", err);
    return sendError(res, 500, "Internal error");
  }
});

// ---------- Premium ---------------------------------------------------------
app.get(`${API_PREFIX}/premium/status`, verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("users").doc(req.user.uid).get();
    if (!doc.exists) return sendError(res, 404, "User not found");
    const { accountType, isPremium, premiumExpiresAt } = doc.data();
    return res.json({ ok: true, accountType, isPremium, premiumExpiresAt });
  } catch (err) {
    console.error("[premium/status]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.post(`${API_PREFIX}/premium/activate`, verifyToken, async (req, res) => {
  try {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    await db.collection("users").doc(req.user.uid).update({
      accountType: "premium",
      isPremium: true,
      premiumExpiresAt: expiresAt,
      scanQuotaPerDay: 999,
    });
    return res.json({ ok: true, premiumExpiresAt: expiresAt });
  } catch (err) {
    console.error("[premium/activate]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.post(`${API_PREFIX}/premium/cancel`, verifyToken, async (req, res) => {
  try {
    await db.collection("users").doc(req.user.uid).update({
      accountType: "free",
      isPremium: false,
      premiumExpiresAt: null,
      scanQuotaPerDay: 5,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[premium/cancel]", err);
    return sendError(res, 500, "Internal error");
  }
});

// ---------- Ads -------------------------------------------------------------
app.get(`${API_PREFIX}/ads/config`, async (_req, res) => {
  try {
    const doc = await db.doc(ADS_CONFIG_DOC).get();
    if (!doc.exists) return sendError(res, 404, "Ads config not found");
    return res.json({ ok: true, config: doc.data() });
  } catch (err) {
    console.error("[ads/config]", err);
    return sendError(res, 500, "Internal error");
  }
});

// ---------- Stats -----------------------------------------------------------
app.get(`${API_PREFIX}/stats/global`, async (_req, res) => {
  try {
    const doc = await db.doc(SCAN_STATS_DOC).get();
    if (!doc.exists) return sendError(res, 404, "Stats not found");
    return res.json({ ok: true, stats: doc.data() });
  } catch (err) {
    console.error("[stats/global]", err);
    return sendError(res, 500, "Internal error");
  }
});

app.get(`${API_PREFIX}/stats/user/:userId`, verifyToken, async (req, res) => {
  const { userId } = req.params;
  if (req.user.uid !== userId) return sendError(res, 403, "Forbidden");

  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return sendError(res, 404, "User not found");
    const user = userDoc.data();

    const scansSnap = await db.collection("users").doc(userId).collection("scans").get();
    const totalScans = scansSnap.size;
    const suspicious = scansSnap.docs.filter((doc) => {
      const data = doc.data();
      return data.riskLevel === "high" || data.riskLevel === "moderate";
    }).length;

    return res.json({ ok: true, stats: { totalScans, suspiciousScans: suspicious, user } });
  } catch (err) {
    console.error("[stats/user]", err);
    return sendError(res, 500, "Internal error");
  }
});

// Health check
app.get(`${API_PREFIX}/health`, (_req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}${API_PREFIX}`);
});
