import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { ScreenLayout } from "../../components/ScreenLayout";
import { SRHeader } from "../../components/SRHeader";
import { SRButton } from "../../components/SRButton";
import { SRCard } from "../../components/SRCard";
import { colors } from "../../theme";

export const options = {
  tabBarButton: () => null,
};

export default function Inspection() {
  const router = useRouter();

  return (
    <ScreenLayout>
      <SRHeader title="Analyse visuelle" subtitle="Fonctionnalite mise de cote pour cette version" />

      <SRCard style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 10, color: colors.foreground }}>
          Statut
        </Text>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 12 }}>
          La verification visuelle passera plus tard par l'envoi d'une video au backend. Pour le moment,
          elle n'est pas incluse dans le flux d'analyse.
        </Text>
        <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
          Le scan Premium se concentre donc sur les signaux Wi-Fi et Bluetooth, avec affichage des noms detectes.
        </Text>
      </SRCard>

      <View>
        <SRButton label="Retour a l'accueil" onPress={() => router.push("/(tabs)")} />
      </View>
    </ScreenLayout>
  );
}
