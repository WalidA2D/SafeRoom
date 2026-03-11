export type RiskLevel = "secure" | "low" | "moderate" | "high" | "critical";

export interface ThreatEngineInput {
  network: { detected: number; suspicious: number };
  bluetooth: { detected: number; suspicious: number };
  visual: { flags: number };
}

export interface ThreatEngineOutput {
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
  recommendations: string[];
}

export function computeThreat(input: ThreatEngineInput): ThreatEngineOutput {
  const { network, bluetooth, visual } = input;

  let score = 0;
  score += network.suspicious * 10;
  score += bluetooth.suspicious * 12;
  score += visual.flags * 8;

  if (network.detected > 10) score += 5;
  if (bluetooth.detected > 8) score += 5;

  if (score > 100) score = 100;

  let level: RiskLevel = "secure";
  if (score > 20 && score <= 40) level = "low";
  else if (score > 40 && score <= 60) level = "moderate";
  else if (score > 60 && score <= 80) level = "high";
  else if (score > 80) level = "critical";

  const reasons: string[] = [];
  if (network.suspicious > 0) reasons.push("Équipements réseau suspects détectés");
  if (bluetooth.suspicious > 0) reasons.push("Signaux Bluetooth inhabituels détectés");
  if (visual.flags > 0) reasons.push("Anomalies visuelles relevées");

  const recommendations: string[] = [
    "Ce score est indicatif : SafeRoom n’est pas une preuve absolue.",
  ];
  if (level === "high" || level === "critical") {
    recommendations.push(
      "Envisager de contacter l’hôte ou de demander un changement de chambre."
    );
  }

  return { riskScore: score, riskLevel: level, reasons, recommendations };
}

