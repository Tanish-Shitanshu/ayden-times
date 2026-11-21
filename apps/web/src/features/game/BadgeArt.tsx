import { useState } from "react";
import { Icon } from "../../design/components";
import { useFeatures } from "../../lib/features";

/** Gemini-generated badge illustration (Vertex AI, cached in Cloud Storage). Falls back to an icon. */
export function BadgeArt({ roleId, skillId, size = 72, locked = false }: { roleId: string; skillId: string; size?: number; locked?: boolean }) {
  const f = useFeatures();
  const [bad, setBad] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 4 } as const;
  if (!f.badgeArt || bad) {
    return <span className={`badge-art fallback${locked ? " locked" : ""}`} style={box} aria-hidden="true"><Icon name={locked ? "lock" : "workspace_premium"} fill={!locked} /></span>;
  }
  return <img className={`badge-art${locked ? " locked" : ""}`} style={box} width={size} height={size} loading="lazy" alt="" src={`/api/v1/badges/${encodeURIComponent(roleId)}/${encodeURIComponent(skillId)}/art`} onError={() => setBad(true)} />;
}
