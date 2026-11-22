import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { Badge, Report } from "../../contract";
import { Icon } from "../../design/components";
import { playSound } from "../../lib/sound";
import { BadgeArt } from "./BadgeArt";
import "./game.css";

const COLORS = ["#2f5fd0", "#f2b35e", "#1f7a4d", "#9db8ff", "#e8736a"];

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 9) * 0.07, color: COLORS[i % COLORS.length]!, rot: (i * 53) % 360 })), []);
  return <div className="confetti" aria-hidden="true">{bits.map((b, i) => <span key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, background: b.color, transform: `rotate(${b.rot}deg)` }} />)}</div>;
}

/** The moment after a mission: what you earned, in plain numbers. Plays once per report. */
export function Celebrate({ report, missionId }: { report: Report; missionId: string }) {
  const [badges, setBadges] = useState<Badge[] | null>(null);
  const [burst, setBurst] = useState(false);
  const strong = report.skills.filter((s) => s.state === "strong");

  useEffect(() => {
    let alive = true;
    api.getProgress(report.roleId).then((p) => {
      if (!alive) return;
      const mine = p.badges.filter((b) => b.missionId === missionId);
      setBadges(mine);
      let first = true;
      try { first = sessionStorage.getItem(`ayden:celebrated:${missionId}`) !== "1"; sessionStorage.setItem(`ayden:celebrated:${missionId}`, "1"); } catch { /* ignore */ }
      if (first && (mine.length > 0 || strong.length > 0)) { setBurst(true); playSound("complete"); setTimeout(() => alive && setBurst(false), 2600); }
    }).catch(() => setBadges([]));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.roleId, missionId]);

  if (badges === null) return null;
  if (badges.length === 0 && strong.length === 0) return null;
  const xp = 100 + strong.length * 30 + badges.length * 50;
  return (
    <section className="card celebrate" aria-labelledby="cel-h" role="status">
      {burst && <Confetti />}
      <div className="row gap-12 wrap" style={{ alignItems: "center" }}>
        <Icon name="celebration" className="lg" style={{ color: "var(--primary)" }} />
        <div className="grow stack gap-4">
          <h2 id="cel-h" className="t-tl">Shift complete: about +{xp} XP</h2>
          <p className="t-bm t-secondary">{strong.length > 0 ? `${strong.length} ${strong.length === 1 ? "skill" : "skills"} at target. ` : ""}{badges.length > 0 ? "New evidence-linked badges below." : "Badges appear when your own words back them up."}</p>
        </div>
      </div>
      {badges.length > 0 && (
        <ul className="celebrate-badges">
          {badges.map((b) => (
            <li key={b.id}><BadgeArt roleId={b.roleId} skillId={b.skillId} size={88} /><b className="t-bm">{b.title}</b></li>
          ))}
        </ul>
      )}
    </section>
  );
}
