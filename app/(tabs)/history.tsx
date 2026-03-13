import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, Alert } from "react-native";
import { useRouter } from "expo-router";
import { loadHistory, clearHistory, type ScanSummary } from "../../services/history";
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

export default function History() {
  const router = useRouter();
  const { plan } = useAuthStore();
  const [history, setHistory] = useState<ScanSummary[]>([]);

  useEffect(() => {
    (async () => {
      const data = await loadHistory();
      setHistory(data);
    })();
  }, []);

  const refresh = async () => {
    const data = await loadHistory();
    setHistory(data);
  };

  const clearAll = () => {
    Alert.alert(
      "Effacer l'historique",
      "Voulez-vous vraiment effacer tous les scans enregistrés ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Effacer",
          style: "destructive",
          onPress: async () => {
            await clearHistory();
            setHistory([]);
          },
        },
      ]
    );
  };

  if (plan !== "premium") {
    return (
      <ScreenLayout>
        <SRHeader title="Historique" subtitle="Accès Premium requis" />
        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, marginBottom: 12, color: colors.foreground }}>
            L’historique des scans est réservé aux utilisateurs Premium. Pour débloquer cette
            fonctionnalité, passez au plan Premium.
          </Text>
          <SRButton
            label="Passer au Premium"
            onPress={() => router.push("/settings")}
            variant="primary"
          />
        </SRCard>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <SRHeader title="Historique" subtitle="Vos scans précédents" />

      {history.length === 0 ? (
        <SRCard>
          <Text style={{ fontSize: 16, marginBottom: 12 }}>Aucun scan enregistré.</Text>
          <SRButton label="Lancer un scan" onPress={() => router.push("/")} />
        </SRCard>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  "Détails du scan",
                  `Date : ${formatDate(item.createdAt)}\nScore : ${item.riskScore} (${item.riskLevel})\n\nRéseau : ${item.network.detected} détectés, ${item.network.suspicious} suspects\nBluetooth : ${item.bluetooth.detected} détectés, ${item.bluetooth.suspicious} suspects\nVisuel : ${item.visual.flags} drapeaux`,
                  [{ text: "OK", style: "default" }]
                )
              }
            >
              <SRCard style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 16, fontWeight: "600" }}>
                    {formatDate(item.createdAt)}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: item.riskScore > 80 ? "#DC2626" : item.riskScore > 60 ? "#F97316" : item.riskScore > 40 ? "#FBBF24" : "#16A34A" }}>
                    {item.riskScore}
                  </Text>
                </View>
                <Text style={{ marginTop: 6, color: colors.mutedForeground }}>
                  Niveau : {item.riskLevel}
                </Text>
                <Text style={{ marginTop: 6, color: colors.mutedForeground }}>
                  Appuyez pour voir les détails
                </Text>
              </SRCard>
            </TouchableOpacity>
          )}
        />
      )}

      {history.length > 0 ? (
        <SRButton label="Effacer l’historique" variant="secondary" onPress={clearAll} />
      ) : null}

      <View style={{ height: 32 }} />
    </ScreenLayout>
  );
}
