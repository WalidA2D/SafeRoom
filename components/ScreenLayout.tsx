import type { ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme";

type ScreenLayoutProps = ViewProps & {
  children: React.ReactNode;
  noPadding?: boolean;
};

export function ScreenLayout({
  children,
  noPadding,
  style,
  ...rest
}: ScreenLayoutProps) {
  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={[
        { flex: 1, backgroundColor: colors.background },
        !noPadding && { paddingHorizontal: 20 },
        style,
      ]}
      {...rest}
    >
      {children}
    </SafeAreaView>
  );
}
