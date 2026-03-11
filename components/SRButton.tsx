import { Pressable, Text } from "react-native";
import { colors } from "../theme";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
};

export function SRButton({ label, onPress, variant = "primary" }: Props) {
  const bg = variant === "primary" ? colors.primary : variant === "secondary" ? colors.muted : "transparent";
  const textColor = variant === "primary" ? colors.primaryForeground : colors.foreground;

  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: bg, minHeight: 52, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: textColor, fontWeight: "600", fontSize: 16 }}>
        {label}
      </Text>
    </Pressable>
  );
}
