import { useEffect, useRef, useState } from "react";
import { View, Text, Image, Alert } from "react-native";
import { Camera, CameraView } from "expo-camera";
import { useRouter } from "expo-router";
import { ScreenLayout } from "../../components/ScreenLayout";
import { SRHeader } from "../../components/SRHeader";
import { SRButton } from "../../components/SRButton";
import { useAuthStore } from "../../store/authStore";
import { colors } from "../../theme";

export const options = {
  // garde l'écran accessible via navigation mais masque l'onglet dans la barre
  tabBarButton: () => null,
};

export default function Inspection() {
  const router = useRouter();
  const { plan } = useAuthStore();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    })();
  }, []);

  if (plan !== "premium") {
    return (
      <ScreenLayout>
        <SRHeader title="Inspection visuelle" subtitle="Accès Premium requis" />
        <View style={{ paddingHorizontal: 10 }}>
          <Text style={{ fontSize: 16, marginBottom: 12, color: colors.foreground }}>
            La fonctionnalité d’inspection visuelle (caméra) est réservée aux utilisateurs Premium.
          </Text>
          <SRButton label="Accéder aux paramètres" onPress={() => router.push("/settings")} />
        </View>
      </ScreenLayout>
    );
  }

  if (hasPermission === null) {
    return (
      <ScreenLayout>
        <SRHeader title="Inspection visuelle" />
        <Text style={{ marginTop: 20, fontSize: 16, color: colors.mutedForeground }}>
          Vérification des permissions…
        </Text>
      </ScreenLayout>
    );
  }

  if (hasPermission === false) {
    return (
      <ScreenLayout>
        <SRHeader title="Inspection visuelle" />
        <Text style={{ marginTop: 20, fontSize: 16, color: colors.foreground }}>
          Permission caméra refusée. Vous pouvez l’activer depuis les réglages de l’appareil.
        </Text>
      </ScreenLayout>
    );
  }

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      setPhotoUri(photo.uri);
    } catch (error) {
      Alert.alert("Erreur", "Impossible de prendre la photo.");
    }
  };

  return (
    <ScreenLayout noPadding>
      <SRHeader title="Inspection visuelle" subtitle="Prenez une photo de l’endroit que vous souhaitez vérifier" />

      <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 10 }}>
        <View
          style={{
            flex: 1,
            width: "100%",
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "#000",
          }}
        >
          <CameraView
            ref={(ref: any) => {
              cameraRef.current = ref;
            }}
            style={{ flex: 1 }}
            facing={facing}
          />
        </View>

        <View style={{ width: "100%", marginTop: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <SRButton
            label="Retourner"
            variant="secondary"
            onPress={() => setFacing((current) => (current === "back" ? "front" : "back"))}
          />
          <SRButton label="Prendre une photo" onPress={takePhoto} />
        </View>

        {photoUri ? (
          <View style={{ marginTop: 16, width: "100%" }}>
            <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 8 }}>Dernière capture</Text>
            <Image source={{ uri: photoUri }} style={{ width: "100%", height: 240, borderRadius: 16 }} />
          </View>
        ) : null}
      </View>
    </ScreenLayout>
  );
}
