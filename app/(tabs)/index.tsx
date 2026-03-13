import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { computeThreat, type ThreatEngineOutput } from "../../services/threatEngine";
import { addScanToHistory } from "../../services/history";
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

const riskLabels: Record<string, string> = {
  secure: "Sécurisé",
  low: "Faible",
  moderate: "Moyen",
  high: "Elevé",
  critical: "Critique",
};

export default function Home() {
  const [isReady, setIsReady] = useState(false);
  const [result, setResult] = useState<ThreatEngineOutput | null>(null);

  const {
    plan,
    userEmail,
    scansToday,
    dailyLimit,
    canScan,
    hydrateFromStorage,
    startGuestSession,
    incrementScans,
    persistGuestQuota,
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
  }, []);

  useEffect(() => {
    if (!isReady) return;

    // si pas connecté ET pas visiteur → login
    if (!userEmail && plan !== "visitor") {
      router.replace("/login");
    }
  }, [isReady, plan, userEmail]);

  const simulateScan = async () => {
    if (isScanning || !canScan()) return;

    start();
    setResult(null);

    const state = {
      network: { detected: 0, suspicious: 0 },
      bluetooth: { detected: 0, suspicious: 0 },
      visual: { flags: 0 },
    };

    const steps = 12;
    for (let i = 0; i <= steps; i += 1) {
      state.network.detected = Math.floor(Math.random() * 12);
      state.network.suspicious = Math.floor(Math.random() * 3);
      state.bluetooth.detected = Math.floor(Math.random() * 10);
      state.bluetooth.suspicious = Math.floor(Math.random() * 2);
      state.visual.flags = Math.floor(Math.random() * 3);

      setSummary(state);
      setProgress((i / steps) * 100);

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    finish();

    const output = computeThreat(state);
    setResult(output);

    if (plan === "premium") {
      await addScanToHistory({
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        riskScore: output.riskScore,
        riskLevel: output.riskLevel,
        network: state.network,
        bluetooth: state.bluetooth,
        visual: state.visual,
      });
    }

    incrementScans();
    await persistGuestQuota();
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
        <SRHeader title="SafeRoom" subtitle="Analyse de sécurité de votre environnement" />

        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 6 }}>Quota</Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
            Scans restants aujourd’hui : {remaining} / {dailyLimit()}
          </Text>
        </SRCard>

        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 12 }}>
            Statut de l’analyse
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
              {isScanning ? `Analyse en cours (${formatPercentage(progress)})…` : "Prêt à lancer une analyse"}
            </Text>
          </View>

          <SRButton
            label={isScanning ? "Analyse en cours…" : "Lancer l’analyse"}
            onPress={simulateScan}
            variant={canScan() ? "primary" : "secondary"}
          />

          {!canScan() ? (
            <Text style={{ marginTop: 12, fontSize: 14, color: colors.mutedForeground }}>
              Vous avez atteint votre quota pour aujourd’hui. Appuyez sur "Démarrer en invité" pour
              récupérer un quota invité.
            </Text>
          ) : null}

          {!canScan() ? (
            <View style={{ marginTop: 12 }}>
              <SRButton label="Démarrer en invité" variant="secondary" onPress={startGuest} />
            </View>
          ) : null}
        </SRCard>

        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 12 }}>
            Inspection visuelle
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 16 }}>
            Utilisez la caméra pour inspecter visuellement la pièce. Cette fonctionnalité est
            réservée aux utilisateurs Premium.
          </Text>
          <SRButton label="Ouvrir la caméra" onPress={() => router.push("/(tabs)/inspection")} />
        </SRCard>

        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 12 }}>
            Historique
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 16 }}>
            Consultez vos scans précédents (Premium uniquement).
          </Text>
          <SRButton label="Voir l’historique" onPress={() => router.push("/(tabs)/history")} />
        </SRCard>

        {result ? (
          <SRCard style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 10 }}>Résultat</Text>
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
            {result.reasons.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 6 }}>
                  Ce que nous avons détecté
                </Text>
                {result.reasons.map((reason) => (
                  <Text key={reason} style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 4 }}>
                    • {reason}
                  </Text>
                ))}
              </View>
            ) : null}
            <View>
              <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 6 }}>Conseils</Text>
              {result.recommendations.map((rec) => (
                <Text key={rec} style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 4 }}>
                  • {rec}
                </Text>
              ))}
            </View>
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
