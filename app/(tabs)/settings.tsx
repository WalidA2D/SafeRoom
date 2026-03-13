import { Alert, View, Text } from "react-native";
import { useRouter } from "expo-router";
import { ScreenLayout } from "../../components/ScreenLayout";
import { SRButton } from "../../components/SRButton";
import { SRCard } from "../../components/SRCard";
import { SRHeader } from "../../components/SRHeader";
import { AdBanner } from "../../components/AdBanner";
import { useAuthStore } from "../../store/authStore";

export default function Settings() {
  const router = useRouter();
  const { plan, scansToday, dailyLimit, clearGuestAndReset, setPlan, userEmail, signOut } = useAuthStore();
  console.log("PLAN:", plan);
  const handleReset = async () => {
    Alert.alert(
      "Réinitialiser la session",
      "Cela effacera votre session invité et réinitialisera le compteur de scans.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Réinitialiser",
          style: "destructive",
          onPress: async () => {
            await clearGuestAndReset();
          },
        },
      ]
    );
  };

  const upgradeToPremium = async () => {

    // Bloquer les visiteurs
    if (plan === "visitor") {
      Alert.alert(
        "Fonction Premium",
        "Vous devez créer un compte pour accéder à Premium."
      );
      router.push("/login");
      return;
    }

    Alert.alert(
      "Passer Premium",
      "Ce passage débloque l'historique, la caméra d'inspection et un quota illimité.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Activer Premium",
          onPress: async () => {
            await setPlan("premium");
          },
        },
      ]
    );
  };

  const switchToFree = async () => {
    await setPlan("free");
  };

  return (
    <ScreenLayout>
      <SRHeader title="Paramètres" subtitle="Gérez votre session et votre quota" />
      
      {plan === "premium" && (
        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#16A34A" }}>
            Compte Premium actif
          </Text>
          <Text style={{ marginTop: 6 }}>
            Historique illimité, inspection caméra et aucune publicité.
          </Text>
        </SRCard>
      )}

      <SRCard style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Compte</Text>
        {userEmail ? (
          <>
            <Text style={{ fontSize: 14, color: "#334155" }}>Connecté en tant que</Text>
            <Text style={{ fontSize: 14, color: "#334155", marginBottom: 12 }}>{userEmail}</Text>
            <SRButton label="Se déconnecter" variant="secondary" onPress={signOut} />
          </>
        ) : (
          <>
            <Text style={{ fontSize: 14, color: "#334155", marginBottom: 12 }}>
              Connectez-vous pour conserver vos scans et accéder à votre historique.
            </Text>
            <SRButton label="Se connecter" onPress={() => router.replace("/login")} />
          </>
        )}
      </SRCard>

      <SRCard style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Votre plan</Text>
        <Text style={{ fontSize: 14, color: "#334155" }}>Type : {plan}</Text>
        <Text style={{ fontSize: 14, color: "#334155" }}>
          Scans aujourd’hui : {scansToday} / {dailyLimit()}
        </Text>
      </SRCard>

      {plan === "free" ? (
        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
            Déverrouillez plus de fonctionnalités
          </Text>
          <Text style={{ fontSize: 14, color: "#334155", marginBottom: 16 }}>
            Passez Premium pour conserver l’historique, accéder à la caméra d’inspection et
            supprimer les publicités.
          </Text>
          <SRButton label="Passer Premium" variant="primary" onPress={upgradeToPremium} />
        </SRCard>
      ) : null}

      <SRCard style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Besoin d’un nouveau départ ?
        </Text>
        <Text style={{ fontSize: 14, color: "#334155", marginBottom: 16 }}>
          Réinitialise la session invité (le quota par appareil est conservé pour la journée).
        </Text>
        <SRButton label="Réinitialiser la session" variant="secondary" onPress={handleReset} />
      </SRCard>

      <SRCard>
        <Text style={{ fontSize: 14, color: "#334155" }}>
          SafeRoom est une application de démonstration. Les résultats sont basés sur des
          données simulées et ne remplacent pas un audit de sécurité réel.
        </Text>
      </SRCard>

      {plan !== "premium" ? (
        <View style={{ marginTop: 20 }}>
          <AdBanner />
        </View>
      ) : null}
    </ScreenLayout>
  );
}
