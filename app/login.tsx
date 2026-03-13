import { useEffect, useState } from "react";
import { View, Text, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { ScreenLayout } from "../components/ScreenLayout";
import { SRHeader } from "../components/SRHeader";
import { SRButton } from "../components/SRButton";
import { useAuthStore } from "../store/authStore";
import { colors } from "../theme";

export const options = {
  tabBarButton: () => null,
};

export default function Login() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const startGuestSession = useAuthStore((s) => s.startGuestSession);
  const userEmail = useAuthStore((s) => s.userEmail);
  const plan = useAuthStore((s) => s.plan);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    if (!isHydrated) return;

    if (userEmail) {
      router.replace("/(tabs)");
    }
  }, [userEmail, isHydrated, router]);

  const onSubmit = async (mode: "signIn" | "signUp") => {
    setLoading(true);
    try {
      const result = mode === "signIn" ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
      if (!result) {
        Alert.alert("Erreur", "Impossible de se connecter. Vérifiez vos identifiants.");
        return;
      }
      router.replace("/(tabs)");
    } finally {
      setLoading(false);
    }
  };

  const enterAsVisitor = async () => {
    setLoading(true);
    try {
      await startGuestSession();
      router.replace("/(tabs)");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenLayout>
      <SRHeader title="Connexion" subtitle="Accédez à votre compte SafeRoom" />
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 8 }}>
          Email
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          style={{
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            color: colors.foreground,
          }}
        />
        <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 8 }}>
          Mot de passe
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={{
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
            color: colors.foreground,
          }}
        />
        <SRButton label="Se connecter" onPress={() => onSubmit("signIn")} />
      <View style={{ marginTop: 12 }}>
        <SRButton label="Créer un compte" variant="secondary" onPress={() => onSubmit("signUp")} />
      </View>
      <View style={{ marginTop: 20 }}>
        <SRButton label="Continuer en visiteur" variant="ghost" onPress={enterAsVisitor} />
      </View>
      </View>
    </ScreenLayout>
  );
}

