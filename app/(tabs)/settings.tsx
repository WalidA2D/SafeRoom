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

  const handleReset = async () => {
    Alert.alert(
      "Reinitialiser la session",
      "Cela effacera votre session visiteur et remettra l'etat local a zero.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Reinitialiser",
          style: "destructive",
          onPress: async () => {
            await clearGuestAndReset();
          },
        },
      ]
    );
  };

  const upgradeToPremium = async () => {
    if (plan === "visitor") {
      Alert.alert("Fonction Premium", "Vous devez creer un compte pour acceder a Premium.");
      router.push("/login");
      return;
    }

    Alert.alert(
      "Passer Premium",
      "Cela debloque l'historique cloud, l'inspection camera et des scans quasi illimites.",
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

  return (
    <ScreenLayout>
      <SRHeader title="Parametres" subtitle="Gerez votre session, votre quota et votre plan" />

      {plan === "premium" ? (
        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#16A34A" }}>
            Compte Premium actif
          </Text>
          <Text style={{ marginTop: 6 }}>
            Historique cloud, inspection visuelle et publicites desactivees.
          </Text>
        </SRCard>
      ) : null}

      <SRCard style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Compte</Text>
        {userEmail ? (
          <>
            <Text style={{ fontSize: 14, color: "#334155" }}>Connecte en tant que</Text>
            <Text style={{ fontSize: 14, color: "#334155", marginBottom: 12 }}>{userEmail}</Text>
            <SRButton
              label="Se deconnecter"
              variant="secondary"
              onPress={async () => {
                await signOut();
                router.replace("/login");
              }}
            />
          </>
        ) : (
          <>
            <Text style={{ fontSize: 14, color: "#334155", marginBottom: 12 }}>
              Connectez-vous pour synchroniser vos scans et gerer votre plan.
            </Text>
            <SRButton label="Se connecter" onPress={() => router.replace("/login")} />
          </>
        )}
      </SRCard>

      <SRCard style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Votre plan</Text>
        <Text style={{ fontSize: 14, color: "#334155" }}>Type : {plan}</Text>
        <Text style={{ fontSize: 14, color: "#334155" }}>
          Scans aujourd'hui : {scansToday} / {dailyLimit()}
        </Text>
      </SRCard>

      {plan === "free" ? (
        <SRCard style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
            Debloquez plus de fonctionnalites
          </Text>
          <Text style={{ fontSize: 14, color: "#334155", marginBottom: 16 }}>
            Passez Premium pour conserver vos rapports, acceder a la camera d'inspection et supprimer les publicites.
          </Text>
          <SRButton label="Passer Premium" variant="primary" onPress={upgradeToPremium} />
        </SRCard>
      ) : null}

      <SRCard style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Besoin d'un nouveau depart ?
        </Text>
        <Text style={{ fontSize: 14, color: "#334155", marginBottom: 16 }}>
          Reinitialise l'etat visiteur local. Le quota cloud des comptes connectes reste gere par le backend.
        </Text>
        <SRButton label="Reinitialiser la session" variant="secondary" onPress={handleReset} />
      </SRCard>

      <SRCard>
        <Text style={{ fontSize: 14, color: "#334155" }}>
          SafeRoom reste un assistant d'inspection. Les rapports aident a verifier une chambre, sans garantir une detection absolue.
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
