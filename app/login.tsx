import { useEffect, useState } from "react";
import { View, Text, TextInput, Alert, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ScreenLayout } from "../components/ScreenLayout";
import { SRHeader } from "../components/SRHeader";
import { SRButton } from "../components/SRButton";
import { useAuthStore } from "../store/authStore";
import { colors } from "../theme";

export const options = {
  tabBarButton: () => null,
};

type AuthMode = "signIn" | "signUp";

function isEmailValid(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value);
}

export default function Login() {
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);
  const startGuestSession = useAuthStore((state) => state.startGuestSession);
  const userEmail = useAuthStore((state) => state.userEmail);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  const [mode, setMode] = useState<AuthMode>("signIn");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isHydrated) return;
    if (userEmail) {
      router.replace("/(tabs)");
    }
  }, [userEmail, isHydrated, router]);

  const resetPasswordFields = () => {
    setPassword("");
    setConfirmPassword("");
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    resetPasswordFields();
  };

  const validate = (): string | null => {
    if (mode === "signUp" && displayName.trim().length < 2) {
      return "Entrez un nom d'affichage valide.";
    }
    if (!email.trim()) {
      return "L'email est obligatoire.";
    }
    if (!isEmailValid(email.trim())) {
      return "Entrez une adresse email valide.";
    }
    if (password.length < 6) {
      return "Le mot de passe doit contenir au moins 6 caracteres.";
    }
    if (mode === "signUp" && password !== confirmPassword) {
      return "Les mots de passe ne correspondent pas.";
    }
    return null;
  };

  const onSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      Alert.alert("Verification", validationError);
      return;
    }

    setLoading(true);
    try {
      if (mode === "signIn") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, displayName.trim());
        Alert.alert("Compte cree", "Votre inscription a ete prise en compte.");
      }
      router.replace("/(tabs)");
    } catch (error: any) {
      Alert.alert(
        mode === "signIn" ? "Connexion impossible" : "Inscription impossible",
        error?.message || "Une erreur est survenue."
      );
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
      <SRHeader
        title={mode === "signIn" ? "Connexion" : "Inscription"}
        subtitle={
          mode === "signIn"
            ? "Connectez-vous a votre compte SafeRoom"
            : "Creez votre compte et synchronisez vos donnees"
        }
      />

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
        <Pressable
          onPress={() => switchMode("signIn")}
          style={{
            flex: 1,
            backgroundColor: mode === "signIn" ? colors.primary : colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>Connexion</Text>
        </Pressable>
        <Pressable
          onPress={() => switchMode("signUp")}
          style={{
            flex: 1,
            backgroundColor: mode === "signUp" ? colors.primary : colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.foreground, fontWeight: "600" }}>Inscription</Text>
        </Pressable>
      </View>

      <View style={{ marginBottom: 20 }}>
        {mode === "signUp" ? (
          <>
            <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 8 }}>
              Nom d'affichage
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              style={{
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                color: colors.foreground,
              }}
            />
          </>
        ) : null}

        <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 8 }}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
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
            marginBottom: 12,
            color: colors.foreground,
          }}
        />

        {mode === "signUp" ? (
          <>
            <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 8 }}>
              Confirmer le mot de passe
            </Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
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
          </>
        ) : (
          <View style={{ marginBottom: 16 }} />
        )}

        <SRButton
          label={
            loading
              ? mode === "signIn"
                ? "Connexion..."
                : "Creation..."
              : mode === "signIn"
                ? "Se connecter"
                : "Creer mon compte"
          }
          onPress={onSubmit}
        />

        <View style={{ marginTop: 12 }}>
          <SRButton
            label={
              mode === "signIn"
                ? "Je n'ai pas encore de compte"
                : "J'ai deja un compte"
            }
            variant="secondary"
            onPress={() => switchMode(mode === "signIn" ? "signUp" : "signIn")}
          />
        </View>

        <View style={{ marginTop: 20 }}>
          <SRButton label="Continuer en visiteur" variant="ghost" onPress={enterAsVisitor} />
        </View>
      </View>
    </ScreenLayout>
  );
}
