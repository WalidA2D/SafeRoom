import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { computeThreat, type ThreatEngineOutput } from "../../services/threatEngine";
import { runRemoteScan, type ScanSignal, type ScanSummary } from "../../services/scans";
import { scanNearbyDevices, type ProximityScanResult } from "../../services/proximityScanner";
import { useAuthStore } from "../../store/authStore";
import { useScanStore } from "../../store/scanStore";
import { ScreenLayout } from "../../components/ScreenLayout";
import { SRHeader } from "../../components/SRHeader";
import { SRButton } from "../../components/SRButton";
import { SRCard } from "../../components/SRCard";
import { colors } from "../../theme";

function formatPercentage(value: number) {
  return `${Math.round(value)}%`;
}

function formatPorts(openPorts?: number[]) {
  return openPorts && openPorts.length > 0 ? openPorts.join(", ") : "Aucun port ouvert detecte";
}

function formatDistance(distance?: number | null) {
  if (typeof distance !== "number") return "Distance inconnue";
  return `${distance.toFixed(1)} m`;
}

function formatDeviceType(deviceType?: string) {
  switch (deviceType) {
    case "camera_compatible":
    case "ip_camera":
      return "Compatible camera/surveillance";
    case "tracker":
      return "Tracker / balise";
    case "iot_device":
      return "Objet connecte";
    case "router":
      return "Routeur / passerelle";
    case "media_device":
      return "Appareil multimedia";
    case "storage_device":
      return "Stockage reseau";
    case "printer":
      return "Imprimante";
    case "wifi_access_point":
      return "Point d'acces Wi-Fi";
    case "personal_hotspot":
      return "Partage de connexion";
    case "personal_device":
      return "Appareil personnel probable";
    default:
      return "Type inconnu";
  }
}

const riskLabels: Record<string, string> = {
  secure: "Securise",
  low: "Faible",
  moderate: "Moyen",
  high: "Eleve",
  critical: "Critique",
};

type ResultViewModel = ThreatEngineOutput & {
  networkSummary: ScanSummary["networkSummary"];
  bluetoothSummary: ScanSummary["bluetoothSummary"];
  visualSummary: ScanSummary["visualSummary"];
  signalsCount: number;
  savedToHistory: boolean;
  reportLocked: boolean;
  locationLabel: string;
  signals: ScanSignal[];
};

function mapRemoteResult(
  scan: ScanSummary,
  savedToHistory: boolean,
  signals: ScanSignal[]
): ResultViewModel {
  return {
    riskScore: scan.riskScore,
    riskLevel: scan.riskLevel as ThreatEngineOutput["riskLevel"],
    reasons: scan.reasons,
    recommendations: scan.recommendations,
    networkSummary: scan.networkSummary,
    bluetoothSummary: scan.bluetoothSummary,
    visualSummary: scan.visualSummary,
    signalsCount: scan.signalsCount,
    savedToHistory,
    reportLocked: scan.reportLocked,
    locationLabel: scan.location.label,
    signals,
  };
}

function mapLocalProximityResult(scan: ProximityScanResult, reportLocked: boolean): ResultViewModel {
  const threat = computeThreat({
    network: {
      detected: scan.summary.wifiDetected,
      suspicious: scan.summary.wifiSuspicious,
    },
    bluetooth: {
      detected: scan.summary.bluetoothDetected,
      suspicious: scan.summary.bluetoothSuspicious,
    },
    visual: {
      flags: 0,
    },
  });

  const highlights = scan.signals
    .filter((signal) => signal.suspicionLevel !== "low")
    .slice(0, 3)
    .map((signal) => `${signal.deviceName}: ${signal.reason}`);
  const recommendations = Array.from(
    new Set([
      ...threat.recommendations,
      ...scan.summary.notes,
      scan.summary.suspiciousDetected > 0
        ? "Comparez les appareils proches detectes avec les equipements attendus de la chambre."
        : "Aucun appareil proche ne presente d'indice fort, mais le resultat reste indicatif.",
    ])
  );

  return {
    riskScore: threat.riskScore,
    riskLevel: threat.riskLevel,
    reasons: Array.from(new Set([...threat.reasons, scan.summary.summaryText, ...highlights])).filter(Boolean),
    recommendations,
    networkSummary: {
      detectedDevices: scan.summary.wifiDetected,
      suspiciousDevices: scan.summary.wifiSuspicious,
      summaryText: scan.summary.summaryText,
    },
    bluetoothSummary: {
      detectedDevices: scan.summary.bluetoothDetected,
      suspiciousDevices: scan.summary.bluetoothSuspicious,
      summaryText: scan.summary.notes.join(" "),
    },
    visualSummary: { flags: 0 },
    signalsCount: scan.summary.totalDetected,
    savedToHistory: false,
    reportLocked,
    locationLabel: `Detection de proximite (~${scan.summary.radiusMeters} m)`,
    signals: scan.signals,
  };
}

export default function Home() {
  const [isReady, setIsReady] = useState(false);
  const [result, setResult] = useState<ResultViewModel | null>(null);

  const {
    plan,
    userEmail,
    userId,
    scansToday,
    dailyLimit,
    canScan,
    hydrateFromStorage,
    startGuestSession,
    incrementScans,
    persistGuestQuota,
    updateProfileFromServer,
  } = useAuthStore();
  const router = useRouter();

  const { status, progress, summary, start, setProgress, setSummary, finish, reset } = useScanStore();

  const remaining = Math.max(0, dailyLimit() - scansToday);
  const isScanning = status === "running";

  useEffect(() => {
    (async () => {
      await hydrateFromStorage();
      setIsReady(true);
    })();
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (!isReady) return;

    if (!userEmail && plan !== "visitor") {
      router.replace("/login");
    }
  }, [isReady, plan, userEmail, router]);

  const simulateScan = async () => {
    if (isScanning || !canScan()) return;

    start();
    setResult(null);

    const proximityResult = await scanNearbyDevices({
      radiusMeters: 10,
      onProgress: setProgress,
    });
    setSummary({
      network: {
        detected: proximityResult.summary.wifiDetected,
        suspicious: proximityResult.summary.wifiSuspicious,
      },
      bluetooth: {
        detected: proximityResult.summary.bluetoothDetected,
        suspicious: proximityResult.summary.bluetoothSuspicious,
      },
      visual: {
        flags: 0,
      },
    });

    let finalResult = mapLocalProximityResult(proximityResult, plan !== "premium");

    if (userId && plan !== "visitor") {
      setProgress(92);

      const remoteResult = await runRemoteScan({
        locationLabel: "Scan guide SafeRoom",
        city: "Session mobile",
        country: "Local",
        visualFlags: 0,
        proximitySignals: proximityResult.signals,
        proximitySummary: proximityResult.summary,
      });

      if (remoteResult) {
        setProgress(96);
        setSummary({
          network: {
            detected: remoteResult.scan.networkSummary.detectedDevices,
            suspicious: remoteResult.scan.networkSummary.suspiciousDevices,
          },
          bluetooth: {
            detected: remoteResult.scan.bluetoothSummary.detectedDevices,
            suspicious: remoteResult.scan.bluetoothSummary.suspiciousDevices,
          },
          visual: {
            flags: remoteResult.scan.visualSummary.flags,
          },
        });
        finalResult = mapRemoteResult(remoteResult.scan, remoteResult.savedToHistory, remoteResult.signals);
        await updateProfileFromServer();
      } else {
        Alert.alert(
          "Backend indisponible",
          "Le resultat affiche est local. Le quota cloud et l'historique n'ont pas ete mis a jour."
        );
      }
    } else {
      incrementScans();
      await persistGuestQuota();
    }

    finish();
    setResult(finalResult);
  };

  const startGuest = async () => {
    await startGuestSession();
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "secure":
        return "#16A34A";
      case "low":
        return "#FBBF24";
      case "moderate":
        return "#F97316";
      case "high":
        return "#DC2626";
      case "critical":
        return "#7F1D1D";
      default:
        return colors.foreground;
    }
  };

  const bluetoothSignals = result?.signals.filter((signal) => signal.type === "bluetooth") ?? [];
  const wifiSignals = result?.signals.filter((signal) => signal.type === "wifi") ?? [];
  const lanSignals = result?.signals.filter((signal) => signal.type === "network") ?? [];

  if (!isReady) {
    return (
      <ScreenLayout>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <ScrollView showsVerticalScrollIndicator={false}>
        <SRHeader title="SafeRoom" subtitle="Analyse de securite de votre environnement" />

        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 6 }}>Quota</Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
            Scans restants aujourd'hui : {remaining} / {dailyLimit()}
          </Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 8 }}>
            Plan actuel : {plan === "visitor" ? "Visiteur" : plan === "premium" ? "Premium" : "Gratuit"}
          </Text>
        </SRCard>

        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 12 }}>
            Statut de l'analyse
          </Text>

          <View style={{ marginBottom: 12 }}>
            <View
              style={{
                height: 10,
                borderRadius: 999,
                backgroundColor: colors.muted,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  backgroundColor: colors.primary,
                }}
              />
            </View>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 6 }}>
              {isScanning ? `Analyse en cours (${formatPercentage(progress)})...` : "Pret a lancer une analyse"}
            </Text>
          </View>

          <View style={{ gap: 6, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
              Reseau : {summary.network.detected} detectes, {summary.network.suspicious} suspects
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
              Bluetooth : {summary.bluetooth.detected} detectes, {summary.bluetooth.suspicious} suspects
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
              Visuel : fonctionnalite mise de cote pour le moment
            </Text>
          </View>

          <SRButton
            label={isScanning ? "Analyse en cours..." : "Lancer l'analyse"}
            onPress={simulateScan}
            variant={canScan() ? "primary" : "secondary"}
          />

          {!canScan() ? (
            <Text style={{ marginTop: 12, fontSize: 14, color: colors.mutedForeground }}>
              Vous avez atteint votre quota pour aujourd'hui.
            </Text>
          ) : null}

          {!canScan() && plan !== "visitor" ? (
            <Text style={{ marginTop: 8, fontSize: 13, color: colors.mutedForeground }}>
              Passez Premium pour des scans quasi illimites et l'historique cloud.
            </Text>
          ) : null}

          {!canScan() ? (
            <View style={{ marginTop: 12 }}>
              <SRButton label="Demarrer en visiteur" variant="secondary" onPress={startGuest} />
            </View>
          ) : null}
        </SRCard>

        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 12 }}>Analyse visuelle</Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 16 }}>
            Cette partie passera plus tard par l'envoi d'une video. Pour l'instant, elle est mise de cote.
          </Text>
          <SRButton label="Voir le statut" variant="secondary" onPress={() => router.push("/(tabs)/inspection")} />
        </SRCard>

        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 12 }}>
            Historique
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 16 }}>
            Retrouvez vos scans cloud, leurs signaux et vos inspections associees.
          </Text>
          <SRButton label="Voir l'historique" onPress={() => router.push("/(tabs)/history")} />
        </SRCard>

        {result ? (
          <SRCard style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 10 }}>Resultat</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 8 }}>
              <Text style={{ fontSize: 42, fontWeight: "700", color: getRiskColor(result.riskLevel) }}>
                {result.riskScore}
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  marginLeft: 12,
                  color: getRiskColor(result.riskLevel),
                  fontWeight: "600",
                }}
              >
                {riskLabels[result.riskLevel] ?? result.riskLevel}
              </Text>
            </View>

            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 12 }}>
              Source : {result.locationLabel}
            </Text>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 6 }}>Synthese modules</Text>
              <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 4 }}>
                Reseau : {result.networkSummary.detectedDevices} detectes, {result.networkSummary.suspiciousDevices} suspects
              </Text>
              {result.networkSummary.summaryText ? (
                <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 4 }}>
                  {result.networkSummary.summaryText}
                </Text>
              ) : null}
              <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 4 }}>
                Bluetooth : {result.bluetoothSummary.detectedDevices} detectes, {result.bluetoothSummary.suspiciousDevices} suspects
              </Text>
              <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 4 }}>
                Visuel : mis de cote pour cette version
              </Text>
              <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
                Appareils detailles : {result.signalsCount}
              </Text>
            </View>

            {!result.reportLocked && bluetoothSignals.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 6 }}>
                  Appareils Bluetooth detectes
                </Text>
                {bluetoothSignals.map((signal) => (
                  <View
                    key={signal.signalId}
                    style={{
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>
                      {signal.deviceName}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 2 }}>
                      Distance : {formatDistance(signal.estimatedDistanceMeters)} | RSSI : {signal.signalStrength} dBm
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 2 }}>
                      Type : {formatDeviceType(signal.deviceType)} | Fabricant : {signal.vendor || "Unknown"}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                      Suspicion : {signal.suspicionLevel} | {signal.reason}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {!result.reportLocked && wifiSignals.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 6 }}>
                  Reseaux Wi-Fi proches
                </Text>
                {wifiSignals.map((signal) => (
                  <View
                    key={signal.signalId}
                    style={{
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>
                      {signal.deviceName}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 2 }}>
                      Distance : {formatDistance(signal.estimatedDistanceMeters)} | RSSI : {signal.signalStrength} dBm
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 2 }}>
                      Type : {formatDeviceType(signal.deviceType)} | Fabricant : {signal.vendor || "Unknown"}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                      Suspicion : {signal.suspicionLevel} | {signal.reason}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {!result.reportLocked && lanSignals.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 6 }}>
                  Appareils du reseau local
                </Text>
                {lanSignals.map((signal) => (
                  <View
                    key={signal.signalId}
                    style={{
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>
                      {signal.deviceName}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 2 }}>
                      IP : {signal.ipAddress || "Inconnue"} | Type : {formatDeviceType(signal.deviceType)}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 2 }}>
                      Fabricant : {signal.vendor || "Unknown"} | Ports : {formatPorts(signal.openPorts)}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                      Suspicion : {signal.suspicionLevel} | {signal.reason}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {result.reportLocked && (bluetoothSignals.length > 0 || wifiSignals.length > 0 || lanSignals.length > 0) ? (
              <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 12 }}>
                Passez Premium pour voir le detail des appareils BLE, Wi-Fi et LAN detectes.
              </Text>
            ) : null}

            {result.reasons.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 6 }}>
                  Ce que nous avons detecte
                </Text>
                {result.reasons.map((reason) => (
                  <Text key={reason} style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 4 }}>
                    - {reason}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 6 }}>Conseils</Text>
              {result.recommendations.map((recommendation) => (
                <Text
                  key={recommendation}
                  style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 4 }}
                >
                  - {recommendation}
                </Text>
              ))}
            </View>

            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
              {result.savedToHistory
                ? "Ce rapport a ete sauvegarde dans votre historique cloud."
                : result.reportLocked
                  ? "Le detail des appareils proches et l'historique cloud sont reserves au Premium."
                  : "Resultat disponible pour cette session."}
            </Text>
          </SRCard>
        ) : null}

        {status === "done" ? (
          <SRButton
            label="Refaire une analyse"
            variant="secondary"
            onPress={() => {
              reset();
              setResult(null);
            }}
          />
        ) : null}
      </ScrollView>
    </ScreenLayout>
  );
}
