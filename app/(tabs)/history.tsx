import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { clearHistory, fetchScanDetails, fetchScanHistory, type ScanSummary } from "../../services/scans";
import { useAuthStore } from "../../store/authStore";
import { ScreenLayout } from "../../components/ScreenLayout";
import { SRHeader } from "../../components/SRHeader";
import { SRCard } from "../../components/SRCard";
import { SRButton } from "../../components/SRButton";
import { colors } from "../../theme";

function formatDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString();
}

function formatPorts(openPorts?: number[]) {
  return openPorts && openPorts.length > 0 ? openPorts.join(", ") : "aucun";
}

function formatDistance(distance?: number | null) {
  return typeof distance === "number" ? `${distance.toFixed(1)} m` : "distance ?";
}

function formatSignalPreview(
  items: Array<{
    deviceName: string;
    vendor: string;
    ipAddress?: string | null;
    openPorts?: number[];
    suspicionLevel: string;
    estimatedDistanceMeters?: number | null;
  }>
) {
  if (items.length === 0) return "Aucun";

  const preview = items.slice(0, 6).map((item) => {
    const locationPart = item.ipAddress ? item.ipAddress : formatDistance(item.estimatedDistanceMeters);
    return `${item.deviceName} [${locationPart} | ${item.vendor} | ports ${formatPorts(item.openPorts)} | ${item.suspicionLevel}]`;
  });

  return items.length > 6 ? `${preview.join(" | ")} | ...` : preview.join(" | ");
}

export default function History() {
  const router = useRouter();
  const { plan, userId } = useAuthStore();
  const [history, setHistory] = useState<ScanSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const data = await fetchScanHistory(userId);
    setHistory(data);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [userId]);

  const showDetails = async (scanId: string) => {
    const details = await fetchScanDetails(scanId);
    if (!details) {
      Alert.alert("Erreur", "Impossible de charger ce rapport.");
      return;
    }

    const { scan, signals } = details;
    const bluetoothSignals = signals.filter((signal) => signal.type === "bluetooth");
    const wifiSignals = signals.filter((signal) => signal.type === "wifi");
    const lanSignals = signals.filter((signal) => signal.type === "network");
    const bluetoothNames = bluetoothSignals
      .map((signal) => `${signal.deviceName} (${signal.vendor}, ${formatDistance(signal.estimatedDistanceMeters)})`)
      .join(" | ");
    const wifiNames = wifiSignals
      .map((signal) => `${signal.deviceName} (${signal.vendor}, ${formatDistance(signal.estimatedDistanceMeters)})`)
      .join(" | ");
    const bluetoothDetails = formatSignalPreview(bluetoothSignals);
    const wifiDetails = formatSignalPreview(wifiSignals);
    const lanDetails = formatSignalPreview(lanSignals);

    Alert.alert(
      "Rapport detaille",
      `Date : ${formatDate(scan.createdAt)}\nLieu : ${scan.location.label}\nScore : ${scan.riskScore} (${scan.riskLevel})\n\nReseau : ${scan.networkSummary.detectedDevices} detectes, ${scan.networkSummary.suspiciousDevices} suspects\nResume LAN : ${scan.networkSummary.summaryText || "Aucun resume detaille"}\nBluetooth : ${scan.bluetoothSummary.detectedDevices} detectes, ${scan.bluetoothSummary.suspiciousDevices} suspects\nVisuel : mis de cote pour cette version\nAppareils detailles : ${signals.length}\n\nNoms Bluetooth : ${bluetoothNames || "Aucun"}\n\nReseaux Wi-Fi : ${wifiNames || "Aucun"}\n\nDetail BLE : ${bluetoothDetails}\n\nDetail Wi-Fi : ${wifiDetails}\n\nDetail LAN : ${lanDetails}\n\nRaisons : ${scan.reasons.join(" | ")}\n\nConseils : ${scan.recommendations.join(" | ")}`,
      [{ text: "OK", style: "default" }]
    );
  };

  const clearAll = () => {
    Alert.alert("Effacer l'historique", "Voulez-vous vraiment supprimer tous les rapports cloud ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Effacer",
        style: "destructive",
        onPress: async () => {
          await clearHistory(history.map((item) => item.scanId));
          setHistory([]);
        },
      },
    ]);
  };

  if (plan !== "premium") {
    return (
      <ScreenLayout>
        <SRHeader title="Historique" subtitle="Acces Premium requis" />
        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, marginBottom: 12, color: colors.foreground }}>
            L'historique cloud des scans est reserve aux utilisateurs Premium.
          </Text>
          <SRButton label="Passer au Premium" onPress={() => router.push("/settings")} variant="primary" />
        </SRCard>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <SRHeader title="Historique" subtitle="Vos scans enregistres dans le backend" />

      {loading ? (
        <View style={{ paddingVertical: 40 }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : history.length === 0 ? (
        <SRCard>
          <Text style={{ fontSize: 16, marginBottom: 12 }}>Aucun scan enregistre.</Text>
          <SRButton label="Lancer un scan" onPress={() => router.push("/")} />
        </SRCard>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.scanId}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => void showDetails(item.scanId)}>
              <SRCard style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", flex: 1, paddingRight: 12 }}>
                    {item.location.label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color:
                        item.riskScore > 80
                          ? "#DC2626"
                          : item.riskScore > 60
                            ? "#F97316"
                            : item.riskScore > 40
                              ? "#FBBF24"
                              : "#16A34A",
                    }}
                  >
                    {item.riskScore}
                  </Text>
                </View>
                <Text style={{ marginTop: 6, color: colors.mutedForeground }}>
                  {formatDate(item.createdAt)}
                </Text>
                <Text style={{ marginTop: 6, color: colors.mutedForeground }}>
                  Niveau : {item.riskLevel}
                </Text>
                <Text style={{ marginTop: 6, color: colors.mutedForeground }}>
                  Appareils : {item.signalsCount} | Detail radio/LAN disponible
                </Text>
                <Text style={{ marginTop: 6, color: colors.mutedForeground }}>
                  Appuyez pour voir le detail complet
                </Text>
              </SRCard>
            </TouchableOpacity>
          )}
        />
      )}

      {history.length > 0 ? (
        <SRButton label="Effacer l'historique" variant="secondary" onPress={clearAll} />
      ) : null}

      {!loading && history.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <SRButton label="Rafraichir" variant="ghost" onPress={() => void load()} />
        </View>
      ) : null}

      <View style={{ height: 32 }} />
    </ScreenLayout>
  );
}
