const dns = require("dns");
const net = require("net");
const os = require("os");
const util = require("util");
const { execFile } = require("child_process");
const { lanNetwork } = require("lan-network");

const execFileAsync = util.promisify(execFile);

const DISCOVERY_PORTS = [80, 443, 554];
const DETAIL_PORTS = [
  22,
  53,
  80,
  81,
  82,
  88,
  139,
  443,
  445,
  554,
  631,
  1883,
  5000,
  5001,
  8000,
  8008,
  8009,
  8080,
  8081,
  8443,
  8554,
  8883,
  8888,
  9100,
  34567,
  37777,
];
const CAMERA_PORTS = new Set([81, 82, 554, 8000, 8080, 8081, 8554, 34567, 37777]);
const IOT_PORTS = new Set([1883, 5000, 5001, 8008, 8009, 8883, 8888, 34567]);
const PRINTER_PORTS = new Set([631, 9100]);
const STORAGE_PORTS = new Set([139, 445, 5000, 5001]);
const MEDIA_PORTS = new Set([8008, 8009]);
const MAX_HOSTS = 254;
const PRESENCE_TIMEOUT_MS = 160;
const PORT_TIMEOUT_MS = 120;
const HOST_CONCURRENCY = 48;
const DEVICE_CONCURRENCY = 8;
const PORT_CONCURRENCY = 8;

const PORT_LABELS = {
  22: "ssh",
  53: "dns",
  80: "http",
  81: "http-alt",
  82: "http-alt",
  88: "http-alt",
  139: "netbios",
  443: "https",
  445: "smb",
  554: "rtsp",
  631: "ipp",
  1883: "mqtt",
  5000: "nas-or-iot",
  5001: "nas-or-iot",
  8000: "http-alt",
  8008: "media-cast",
  8009: "media-cast",
  8080: "http-proxy",
  8081: "http-alt",
  8443: "https-alt",
  8554: "rtsp-alt",
  8883: "mqtt-tls",
  8888: "http-alt",
  9100: "printer",
  34567: "iot-vendor",
  37777: "camera-vendor",
};

const CAMERA_KEYWORDS = [
  "cam",
  "camera",
  "ipcam",
  "ipc",
  "hikvision",
  "dahua",
  "reolink",
  "ezviz",
  "wyze",
  "arlo",
  "foscam",
  "imou",
  "tapo",
  "surveillance",
];
const IOT_KEYWORDS = [
  "iot",
  "sensor",
  "smart",
  "plug",
  "bulb",
  "switch",
  "tuya",
  "ewelink",
  "nest",
  "echo",
  "alexa",
  "google home",
  "mqtt",
];
const ROUTER_KEYWORDS = [
  "router",
  "gateway",
  "access point",
  "wifi",
  "wlan",
  "cisco",
  "tplink",
  "tp-link",
  "netgear",
  "ubiquiti",
  "unifi",
  "mikrotik",
  "fritz",
  "livebox",
  "freebox",
  "sagem",
  "arcadyan",
];
const MEDIA_KEYWORDS = ["chromecast", "roku", "fire tv", "android tv", "apple tv", "google cast"];
const STORAGE_KEYWORDS = ["nas", "synology", "qnap", "storage"];
const PRINTER_KEYWORDS = ["printer", "hp", "epson", "brother", "canon", "xerox"];

function normalizeMac(macAddress) {
  return String(macAddress || "")
    .trim()
    .replace(/-/g, ":")
    .toUpperCase();
}

function ipToNumber(ipAddress) {
  const parts = String(ipAddress || "")
    .split(".")
    .map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return (
    (((parts[0] << 24) >>> 0) |
      ((parts[1] << 16) >>> 0) |
      ((parts[2] << 8) >>> 0) |
      (parts[3] >>> 0)) >>>
    0
  );
}

function numberToIp(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function netmaskToPrefix(netmask) {
  const number = ipToNumber(netmask);
  if (number === null) return 24;

  let prefix = 0;
  for (let bit = 31; bit >= 0; bit -= 1) {
    if (((number >>> bit) & 1) === 1) prefix += 1;
  }
  return prefix;
}

function createMask(prefix) {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff >>> 0;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

function hostCapacity(prefix) {
  if (prefix >= 31) return 0;
  return Math.max(0, 2 ** (32 - prefix) - 2);
}

function parseAssignmentRange(assignment) {
  const addressNumber = ipToNumber(assignment.address);
  if (addressNumber === null) return null;

  const cidrPrefix = String(assignment.cidr || "").includes("/")
    ? Number(String(assignment.cidr).split("/")[1])
    : null;
  const originalPrefix = Number.isInteger(cidrPrefix) ? cidrPrefix : netmaskToPrefix(assignment.netmask);
  const prefix = clamp(originalPrefix, 8, 30);
  const effectivePrefix = hostCapacity(prefix) > MAX_HOSTS ? 24 : prefix;
  const mask = createMask(effectivePrefix);
  const networkNumber = addressNumber & mask;
  const broadcastNumber = networkNumber | (~mask >>> 0);

  return {
    prefix,
    effectivePrefix,
    coverage: effectivePrefix === prefix ? "full" : "partial",
    networkNumber,
    broadcastNumber,
    networkRange: `${numberToIp(networkNumber)}/${effectivePrefix}`,
  };
}

function buildCandidateIps(assignment) {
  const range = parseAssignmentRange(assignment);
  if (!range) {
    return {
      coverage: "partial",
      networkRange: assignment.cidr || null,
      ips: [],
    };
  }

  const localAddress = assignment.address;
  const gateway = assignment.gateway || null;
  const ips = [];

  if (gateway && gateway !== localAddress) {
    ips.push(gateway);
  }

  for (let current = range.networkNumber + 1; current < range.broadcastNumber; current += 1) {
    const candidate = numberToIp(current >>> 0);
    if (candidate === localAddress || candidate === gateway) continue;
    ips.push(candidate);
  }

  return {
    coverage: range.coverage,
    networkRange: range.networkRange,
    ips,
  };
}

function withTimeout(task, timeoutMs, fallbackValue) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallbackValue), timeoutMs);

    try {
      Promise.resolve(typeof task === "function" ? task() : task)
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(fallbackValue);
        });
    } catch {
      clearTimeout(timer);
      resolve(fallbackValue);
    }
  });
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

function tcpProbe(ipAddress, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (status, errorCode = null) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve({ ipAddress, port, status, errorCode });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish("open"));
    socket.once("timeout", () => finish("timeout"));
    socket.once("error", (error) => {
      const code = error?.code || null;
      if (code === "ECONNREFUSED" || code === "ECONNRESET") {
        finish("closed", code);
        return;
      }
      if (
        code === "ETIMEDOUT" ||
        code === "EHOSTUNREACH" ||
        code === "ENETUNREACH" ||
        code === "EHOSTDOWN" ||
        code === "ENETDOWN"
      ) {
        finish("unreachable", code);
        return;
      }
      finish("error", code);
    });

    try {
      socket.connect(port, ipAddress);
    } catch (error) {
      finish("error", error?.code || null);
    }
  });
}

async function probePresence(ipAddress) {
  const observedOpenPorts = [];

  for (const port of DISCOVERY_PORTS) {
    const result = await tcpProbe(ipAddress, port, PRESENCE_TIMEOUT_MS);
    if (result.status === "open") {
      observedOpenPorts.push(port);
      return { ipAddress, present: true, observedOpenPorts };
    }
    if (result.status === "closed") {
      return { ipAddress, present: true, observedOpenPorts };
    }
  }

  return { ipAddress, present: false, observedOpenPorts };
}

async function scanPorts(ipAddress, initialOpenPorts = []) {
  const alreadyOpen = new Set(initialOpenPorts);
  const results = await mapWithConcurrency(DETAIL_PORTS, PORT_CONCURRENCY, async (port) => {
    if (alreadyOpen.has(port)) {
      return { port, status: "open" };
    }
    const result = await tcpProbe(ipAddress, port, PORT_TIMEOUT_MS);
    return { port, status: result.status };
  });

  return results
    .filter((entry) => entry.status === "open")
    .map((entry) => entry.port)
    .sort((left, right) => left - right);
}

async function resolveHostname(ipAddress) {
  const hostnames = await withTimeout(() => dns.promises.reverse(ipAddress), 250, []);
  return Array.isArray(hostnames) && hostnames.length > 0 ? hostnames[0] : null;
}

function parseArpTable(output) {
  const entries = new Map();
  const lines = String(output || "").split(/\r?\n/);

  for (const line of lines) {
    let match = line.match(/^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9A-Fa-f:-]{17})\s+/);
    if (!match) {
      match = line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9A-Fa-f:-]{17})/);
    }
    if (!match) {
      match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+dev\s+\S+\s+lladdr\s+([0-9A-Fa-f:-]{17})/);
    }
    if (!match) continue;

    const ipAddress = match[1];
    const macAddress = normalizeMac(match[2]);
    if (!macAddress || macAddress.includes("FF:FF:FF") || macAddress.includes("<INCOMPLETE>")) continue;
    entries.set(ipAddress, macAddress);
  }

  return entries;
}

async function readArpTable() {
  const commands =
    process.platform === "win32"
      ? [["arp", ["-a"]]]
      : process.platform === "darwin"
        ? [["arp", ["-an"]]]
        : [
            ["ip", ["neigh"]],
            ["arp", ["-an"]],
          ];

  for (const [command, args] of commands) {
    const result = await withTimeout(
      () => execFileAsync(command, args, { windowsHide: true }),
      1200,
      null
    );
    if (result?.stdout) {
      return parseArpTable(result.stdout);
    }
  }

  return new Map();
}

function buildVendorInfo(vendorDatabase, macAddress) {
  const prefix = normalizeMac(macAddress)
    .split(":")
    .slice(0, 3)
    .join(":");

  return (
    vendorDatabase[prefix] || {
      oui: prefix || "UNKNOWN",
      vendorName: "Unknown",
      deviceCategory: "unknown",
    }
  );
}

function hasKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function mapPortLabels(openPorts) {
  return openPorts.map((port) => PORT_LABELS[port] || `tcp-${port}`);
}

function applyThreatSignatures(fingerprint, signatures) {
  return signatures.filter((signature) => {
    const keywords = Array.isArray(signature?.keywords) ? signature.keywords : [];
    return keywords.some((keyword) => fingerprint.includes(String(keyword).toLowerCase()));
  });
}

function inferDeviceType({
  ipAddress,
  gateway,
  fingerprint,
  vendorInfo,
  openPorts,
  signatureMatches,
}) {
  if (
    ipAddress === gateway ||
    vendorInfo.deviceCategory === "router" ||
    hasKeyword(fingerprint, ROUTER_KEYWORDS)
  ) {
    return "router";
  }
  if (vendorInfo.deviceCategory === "ip_camera") {
    return "camera_compatible";
  }
  if (
    signatureMatches.some((signature) => signature.deviceType === "ip_camera") ||
    hasKeyword(fingerprint, CAMERA_KEYWORDS) ||
    openPorts.some((port) => CAMERA_PORTS.has(port))
  ) {
    return "camera_compatible";
  }
  if (vendorInfo.deviceCategory === "smarthome") {
    return "iot_device";
  }
  if (
    vendorInfo.deviceCategory === "smart_speaker" ||
    hasKeyword(fingerprint, IOT_KEYWORDS) ||
    openPorts.some((port) => IOT_PORTS.has(port))
  ) {
    return "iot_device";
  }
  if (hasKeyword(fingerprint, MEDIA_KEYWORDS) || openPorts.some((port) => MEDIA_PORTS.has(port))) {
    return "media_device";
  }
  if (hasKeyword(fingerprint, STORAGE_KEYWORDS) || openPorts.some((port) => STORAGE_PORTS.has(port))) {
    return "storage_device";
  }
  if (hasKeyword(fingerprint, PRINTER_KEYWORDS) || openPorts.some((port) => PRINTER_PORTS.has(port))) {
    return "printer";
  }
  if (vendorInfo.deviceCategory && vendorInfo.deviceCategory !== "unknown") {
    return vendorInfo.deviceCategory;
  }
  return "unknown";
}

function evaluateSuspicion({
  ipAddress,
  gateway,
  hostname,
  vendorInfo,
  openPorts,
  deviceType,
  signatureMatches,
  trustedDevices,
}) {
  const macAddress = trustedDevices.macAddress;
  const isTrusted = macAddress ? trustedDevices.set.has(macAddress) : false;
  if (isTrusted) {
    return {
      isTrusted: true,
      suspicionScore: 0,
      suspicionLevel: "low",
      reason: "Appareil enregistre dans votre liste de confiance.",
      reasons: ["Appareil enregistre dans votre liste de confiance."],
    };
  }

  const reasons = [];
  let score = 0;
  const signatureLabels = signatureMatches.map((signature) => signature.vendor || signature.deviceType).filter(Boolean);
  const cameraPorts = openPorts.filter((port) => CAMERA_PORTS.has(port));
  const iotPorts = openPorts.filter((port) => IOT_PORTS.has(port));

  if (cameraPorts.length > 0) {
    score += 52;
    reasons.push(`Ports compatibles video ou camera exposes (${cameraPorts.join(", ")}).`);
  }
  if (signatureMatches.length > 0) {
    score += signatureMatches.some((signature) => signature.riskLevel === "high") ? 18 : 10;
    reasons.push(`Correspondances detectees avec des signatures connues (${signatureLabels.join(", ")}).`);
  }
  if (deviceType === "camera_compatible") {
    score += 16;
    reasons.push("Le profil ressemble a un appareil de surveillance ou a une camera IP.");
  }
  if (iotPorts.length > 0 && cameraPorts.length === 0) {
    score += 18;
    reasons.push(`Services typiques d'objets connectes exposes (${iotPorts.join(", ")}).`);
  }
  if (!hostname) {
    score += 4;
    reasons.push("Nom d'hote indisponible.");
  }
  if (vendorInfo.vendorName === "Unknown") {
    score += 8;
    reasons.push("Fabricant non identifie.");
  }
  if (openPorts.length >= 5) {
    score += 10;
    reasons.push("Plusieurs services reseau sont exposes.");
  }
  if (ipAddress === gateway || deviceType === "router") {
    score -= 18;
    reasons.push("Passerelle ou equipement principal du reseau local.");
  }
  if (deviceType === "printer" || deviceType === "media_device" || deviceType === "storage_device") {
    score -= 6;
  }

  score = clamp(score, 0, 100);
  let suspicionLevel = "low";
  if (score >= 35 && score < 65) suspicionLevel = "medium";
  if (score >= 65) suspicionLevel = "high";

  if (reasons.length === 0) {
    reasons.push("Profil reseau courant sans indice fort de surveillance.");
  }

  return {
    isTrusted: false,
    suspicionScore: score,
    suspicionLevel,
    reason: reasons[0],
    reasons,
  };
}

function buildDeviceName(hostname, vendorName, deviceType, ipAddress) {
  if (hostname) return hostname;
  if (vendorName && vendorName !== "Unknown") return `${vendorName} ${deviceType}`;
  return `Appareil reseau ${ipAddress}`;
}

async function inspectDevice({
  ipAddress,
  gateway,
  vendorDatabase,
  trustedDevices,
  threatSignatures,
  arpEntries,
  initialOpenPorts,
}) {
  const [hostname, openPorts] = await Promise.all([
    resolveHostname(ipAddress),
    scanPorts(ipAddress, initialOpenPorts),
  ]);
  const macAddress = arpEntries.get(ipAddress) || null;
  const vendorFromMac = buildVendorInfo(vendorDatabase, macAddress);
  const fingerprint = [hostname, vendorFromMac.vendorName, ...mapPortLabels(openPorts)].join(" ").toLowerCase();
  const signatureMatches = applyThreatSignatures(fingerprint, threatSignatures);
  const inferredVendor =
    vendorFromMac.vendorName !== "Unknown"
      ? vendorFromMac
      : {
          ...vendorFromMac,
          vendorName:
            signatureMatches.find((signature) => signature.vendor && signature.vendor !== "Unknown")?.vendor ||
            vendorFromMac.vendorName,
        };
  const deviceType = inferDeviceType({
    ipAddress,
    gateway,
    fingerprint,
    vendorInfo: inferredVendor,
    openPorts,
    signatureMatches,
  });
  const suspicion = evaluateSuspicion({
    ipAddress,
    gateway,
    hostname,
    vendorInfo: inferredVendor,
    openPorts,
    deviceType,
    signatureMatches,
    trustedDevices: { set: trustedDevices, macAddress },
  });

  return {
    ipAddress,
    hostname,
    macAddress,
    deviceName: buildDeviceName(hostname, inferredVendor.vendorName, deviceType, ipAddress),
    vendor: inferredVendor.vendorName,
    deviceType,
    hardwareHint: inferredVendor.oui || null,
    openPorts,
    exposedServices: mapPortLabels(openPorts),
    suspicionScore: suspicion.suspicionScore,
    suspicionLevel: suspicion.suspicionLevel,
    reason: suspicion.reason,
    reasons: suspicion.reasons,
    isTrusted: suspicion.isTrusted,
  };
}

function buildEmptyAnalysis(message) {
  return {
    summary: {
      detectedDevices: 0,
      suspiciousDevices: 0,
      suspectedCameraLikeDevices: 0,
      suspectedIotDevices: 0,
      scannedHosts: 0,
      responsiveHosts: 0,
      networkRange: null,
      gateway: null,
      localAddress: null,
      coverage: "partial",
      summaryText: message,
    },
    devices: [],
    highlights: [message],
    recommendations: [
      "Assurez-vous que le serveur SafeRoom est connecte au meme Wi-Fi que l'utilisateur.",
      "Utilisez ce resultat comme un indicateur, pas comme une preuve absolue.",
    ],
  };
}

async function resolveLanAssignment() {
  try {
    const assignment = await lanNetwork();
    if (assignment?.address) return assignment;
  } catch {
    // fallback below
  }

  const interfaces = os.networkInterfaces();
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return {
          iname: name,
          address: address.address,
          netmask: address.netmask,
          mac: address.mac,
          internal: false,
          cidr: address.cidr || null,
          gateway: null,
        };
      }
    }
  }

  return null;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function analyzeLocalLan({ vendorDatabase = {}, trustedDevices = new Set(), threatSignatures = [] } = {}) {
  const assignment = await resolveLanAssignment();
  if (!assignment?.address) {
    return buildEmptyAnalysis("Impossible d'identifier un reseau local IPv4 actif pour ce scan.");
  }

  const candidateHosts = buildCandidateIps(assignment);
  if (candidateHosts.ips.length === 0) {
    return buildEmptyAnalysis("Le sous-reseau detecte ne contient pas d'hotes exploitables a sonder.");
  }

  const presenceResults = await mapWithConcurrency(candidateHosts.ips, HOST_CONCURRENCY, (ipAddress) =>
    probePresence(ipAddress)
  );
  const activeHosts = presenceResults.filter((entry) => entry.present);

  if (activeHosts.length === 0) {
    return {
      summary: {
        detectedDevices: 0,
        suspiciousDevices: 0,
        suspectedCameraLikeDevices: 0,
        suspectedIotDevices: 0,
        scannedHosts: candidateHosts.ips.length,
        responsiveHosts: 0,
        networkRange: candidateHosts.networkRange,
        gateway: assignment.gateway || null,
        localAddress: assignment.address,
        coverage: candidateHosts.coverage,
        summaryText:
          "Aucun appareil n'a repondu aux sondes TCP rapides sur le segment Wi-Fi analyse.",
      },
      devices: [],
      highlights: [
        "Aucun appareil n'a repondu aux sondes TCP rapides sur le segment Wi-Fi analyse.",
      ],
      recommendations: unique([
        candidateHosts.coverage === "partial"
          ? "Le reseau semble plus large qu'un /24 : seul un segment a ete sonde pour rester rapide."
          : null,
        "Refaites un scan lorsque le serveur SafeRoom est bien connecte au meme Wi-Fi local.",
        "Utilisez ce resultat comme un indicateur, pas comme une preuve absolue.",
      ]),
    };
  }

  const arpEntries = await readArpTable();
  const devices = await mapWithConcurrency(activeHosts, DEVICE_CONCURRENCY, (host) =>
    inspectDevice({
      ipAddress: host.ipAddress,
      gateway: assignment.gateway || null,
      vendorDatabase,
      trustedDevices,
      threatSignatures,
      arpEntries,
      initialOpenPorts: host.observedOpenPorts,
    })
  );

  devices.sort((left, right) => {
    if (right.suspicionScore !== left.suspicionScore) {
      return right.suspicionScore - left.suspicionScore;
    }
    return left.ipAddress.localeCompare(right.ipAddress);
  });

  const suspiciousDevices = devices.filter((device) => device.suspicionLevel !== "low");
  const cameraLikeDevices = devices.filter((device) => device.deviceType === "camera_compatible");
  const iotLikeDevices = devices.filter((device) => device.deviceType === "iot_device");
  const summaryText =
    devices.length === 0
      ? "Aucun appareil detaille n'a pu etre etabli a partir du LAN detecte."
      : `${devices.length} appareil(s) detecte(s) sur ${candidateHosts.networkRange}, dont ${suspiciousDevices.length} a verifier et ${cameraLikeDevices.length} compatibles camera/surveillance.`;

  return {
    summary: {
      detectedDevices: devices.length,
      suspiciousDevices: suspiciousDevices.length,
      suspectedCameraLikeDevices: cameraLikeDevices.length,
      suspectedIotDevices: iotLikeDevices.length,
      scannedHosts: candidateHosts.ips.length,
      responsiveHosts: activeHosts.length,
      networkRange: candidateHosts.networkRange,
      gateway: assignment.gateway || null,
      localAddress: assignment.address,
      coverage: candidateHosts.coverage,
      summaryText,
    },
    devices,
    highlights: unique([
      suspiciousDevices.length > 0
        ? `${suspiciousDevices.length} appareil(s) reseau presentent des caracteristiques a verifier.`
        : "Aucun appareil reseau ne ressort avec un niveau de suspicion eleve.",
      cameraLikeDevices.length > 0
        ? `${cameraLikeDevices.length} appareil(s) exposent des ports ou signatures compatibles avec de la video reseau.`
        : null,
      candidateHosts.coverage === "partial"
        ? "Le reseau semble plus large qu'un /24 : seul un segment a ete sonde pour rester rapide."
        : null,
    ]),
    recommendations: unique([
      suspiciousDevices.length > 0
        ? "Comparez les appareils listes avec les equipements attendus du logement."
        : null,
      cameraLikeDevices.length > 0
        ? "Verifiez physiquement les appareils associes aux IP ou ports video exposes."
        : null,
      iotLikeDevices.length > 0
        ? "Les objets connectes inconnus meritent un controle manuel si leur presence est inattendue."
        : null,
      "Utilisez ce resultat comme un indicateur, pas comme une preuve absolue.",
    ]),
  };
}

module.exports = {
  analyzeLocalLan,
};
