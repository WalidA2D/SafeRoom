import { View, Text } from "react-native";
import { colors } from "../theme";

export function AdBanner() {
  return (
    <View style={{ backgroundColor: colors.muted, borderRadius: 16, padding: 16 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center" }}>
        Espace publicité
      </Text>
    </View>
  );
}
