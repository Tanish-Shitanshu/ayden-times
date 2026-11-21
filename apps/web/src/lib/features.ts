import { useEffect, useState } from "react";
import { api } from "../api/client";

export interface Features { badgeArt: boolean; translate: boolean; speech: boolean }
const OFF: Features = { badgeArt: false, translate: false, speech: false };

let pending: Promise<Features> | null = null;
/** Which optional Google features this deployment has switched on. Read once, never blocks the page. */
export function loadFeatures(): Promise<Features> {
  if (!pending) pending = api.getStatus().then((s) => s.features ?? OFF).catch(() => OFF);
  return pending;
}

export function useFeatures(): Features {
  const [f, setF] = useState<Features>(OFF);
  useEffect(() => { let alive = true; loadFeatures().then((x) => alive && setF(x)); return () => { alive = false; }; }, []);
  return f;
}
