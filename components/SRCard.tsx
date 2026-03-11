import { View, type ViewProps } from "react-native";
import { colors } from "../theme";

type SRCardProps = ViewProps & {
  children: React.ReactNode;
};

export function SRCard({ children, style, ...rest }: SRCardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: 24,
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 3,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
