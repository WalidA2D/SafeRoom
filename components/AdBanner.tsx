import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { apiFetch } from "../services/api";
import { colors } from "../theme";

type AdsConfig = {
  enabled?: boolean;
  provider?: string;
  banner?: boolean;
};

export function AdBanner() {
  const [config, setConfig] = useState<AdsConfig | null>(null);

  useEffect(() => {
    (async () => {
      const response = await apiFetch<{ config: AdsConfig }>("/ads/config", { method: "GET" });
      if (response.ok) {
        setConfig(response.data.config ?? null);
      }
    })();
  }, []);

  if (config && (!config.enabled || !config.banner)) {
    return null;
  }

  return (
    <View style={{ backgroundColor: colors.muted, borderRadius: 16, padding: 16 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center" }}>
        Espace publicite {config?.provider ? `- ${config.provider}` : "SafeRoom"}
      </Text>
    </View>
  );
}
