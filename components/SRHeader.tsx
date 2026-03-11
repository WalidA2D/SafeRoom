import { Text, View, Pressable } from "react-native";
import { colors } from "../theme";

type SRHeaderProps = {
  title: string;
  subtitle?: string;
  /** Affiche un bouton « Retour » et appelle onBack au clic */
  showBack?: boolean;
  onBack?: () => void;
};

export function SRHeader({ title, subtitle, showBack, onBack }: SRHeaderProps) {
  return (
    <View style={{ marginBottom: 32 }}>
      {showBack && onBack ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            marginBottom: 16,
            paddingVertical: 4,
            paddingRight: 12,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: colors.primary, fontSize: 20, marginRight: 4 }}>←</Text>
          <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 16 }}>Retour</Text>
        </Pressable>
      ) : null}
      <Text style={{ color: colors.foreground, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 16, marginTop: 6 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
