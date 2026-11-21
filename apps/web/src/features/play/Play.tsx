import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, Icon, LinkButton } from "../../design/components";
import "./play.css";
import { PLAY_KEY, loadPlay, today as todayStr, type PlayStats } from "../game/xp";

interface Round {
  role: string;
  icon: string;
  scene: string;
  from: string;
  choices: string[]; // choices[0] is always the right one before shuffling
  why: string;
}

const POOL: Round[] = [
  { role: "Software engineer", icon: "terminal", from: "Manager", scene: "\"The demo is in 10 minutes. Just merge it now, we can review after.\"", choices: ["Say the risk, keep the checks, offer a quick safe option", "Merge it now", "Ignore the message"], why: "Hold your standards, name the risk and propose a fast, safe alternative." },
  { role: "Software engineer", icon: "terminal", from: "Your commit", scene: "Which commit message would a teammate be able to follow?", choices: ["fix(cart): stop duplicate items (CART-12)", "fixed stuff", "update"], why: "type(scope): summary plus the ticket key tells reviewers what and where." },
  { role: "Software engineer", icon: "terminal", from: "Head of Ops", scene: "\"While you're in there, can you also add a loyalty discount today?\"", choices: ["Route it to your manager as a separate ticket", "Add it quietly to the same pull request", "Refuse and walk away"], why: "Extra scope goes through the manager. Small, focused pull requests get reviewed faster." },
  { role: "Software engineer", icon: "terminal", from: "README", scene: "You notice an API key pasted in the project README.", choices: ["Tell your manager and never copy it anywhere", "Copy it into your pull request to help the reviewer", "Leave it, it's probably fake"], why: "Secrets never go into commits or chats. Report them." },
  { role: "Banking ops", icon: "account_balance", from: "Team lead", scene: "\"You're the checker too. Just click release on the payment you prepared.\"", choices: ["Decline, name four-eyes, suggest another checker", "Click release, it's quicker", "Release it and tell nobody"], why: "Maker and checker must be different people." },
  { role: "Banking ops", icon: "account_balance", from: "Angry customer", scene: "\"Why is my payment delayed?\" (The payment is on hold after a name match.)", choices: ["\"It is in standard processing and we will update you.\"", "\"There is a compliance flag on your account.\"", "\"Our system flagged you as suspicious.\""], why: "Never reveal an alert or review to the customer (no tipping off)." },
  { role: "Nurse", icon: "stethoscope", from: "Observations", scene: "A patient's early-warning score has jumped from 2 to 6.", choices: ["Escalate now with SBAR and the exact latest values", "Recheck in an hour", "Mention it to the next shift"], why: "A high score means urgent escalation with a clear, structured message." },
  { role: "Nurse", icon: "stethoscope", from: "Visitor", scene: "\"How is the man in bed 8 doing? Is he in pain?\" (Not their relative.)", choices: ["Politely decline and point them to the nurse in charge", "Tell them he is stable", "Share his medication"], why: "Patient information is shared only with people involved in their care." },
  { role: "Nurse", icon: "stethoscope", from: "Charge nurse", scene: "\"Just give him whatever dose you think is right, I'm busy.\"", choices: ["Check the chart and the order first, and say you won't guess", "Give a typical dose", "Ask the patient what he usually takes"], why: "Never choose a drug or dose yourself. Use the chart or ask a prescriber." },
  { role: "Tech consulting", icon: "insights", from: "Client CFO", scene: "\"So it's supplier prices, right? I'll tell procurement today.\" (Your data shows mix shift.)", choices: ["Say the data points to mix shift, flag the data conflict, state confidence", "Agree, it keeps him happy", "Say you're not sure and stop talking"], why: "Numbers must tie to the data. Don't let a wrong conclusion travel." },
  { role: "Tech consulting", icon: "insights", from: "Client CFO", scene: "\"Can you also do a store-staffing analysis by Monday?\" (Out of scope.)", choices: ["Loop in your manager before agreeing", "Say yes, Monday is fine", "Say no, it is out of scope"], why: "Scope is agreed through your manager, not casually with the client." },
  { role: "Tech consulting", icon: "insights", from: "Your update", scene: "Which opening line is best for a busy manager?", choices: ["\"Margin fell 2.2 points, mostly from category mix shift.\"", "\"I looked at several tables and there was a lot of data.\"", "\"Here is everything I did today.\""], why: "Lead with the answer and a number. Reasons come next." },
];

const ROUNDS = 6;
const SECONDS = 20;
const shuffle = <T,>(a: T[]) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j]!, x[i]!]; } return x; };
/** Small seeded shuffle so the daily challenge is the same six moments all day. */
const seeded = <T,>(a: T[], seed: number) => { let t = seed; const rnd = () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j]!, x[i]!]; } return x; };
const dailySeed = () => Number(todayStr().replace(/-/g, ""));
const ACHIEVEMENTS: { id: string; label: string; icon: string; test: (s: PlayStats) => boolean }[] = [
  { id: "first", label: "First warm-up", icon: "flag", test: (s) => s.plays >= 1 },
  { id: "perfect", label: "Perfect run", icon: "military_tech", test: (s) => (s.perfect ?? 0) >= 1 },
  { id: "streak3", label: "3-day streak", icon: "local_fire_department", test: (s) => s.streakDays >= 3 },
  { id: "regular", label: "Regular: 5 plays", icon: "repeat", test: (s) => s.plays >= 5 },
];

export default function Play() {
  const [daily, setDaily] = useState(() => loadPlay().lastDay !== todayStr());
  const [deck, setDeck] = useState(() => (loadPlay().lastDay !== todayStr() ? seeded(POOL, dailySeed()) : shuffle(POOL)).slice(0, ROUNDS));
  const [rights, setRights] = useState(0);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [left, setLeft] = useState(SECONDS);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState(loadPlay);
  const saved = useRef(false);

  const round = deck[i];
  const options = useMemo(() => (round ? shuffle(round.choices.map((c, k) => ({ c, ok: k === 0 }))) : []), [round]);

  const answer = useCallback((idx: number | null) => {
    if (picked !== null || !round) return;
    const ok = idx !== null && options[idx]?.ok;
    setPicked(idx ?? -1);
    if (ok) { setScore((s) => s + 10 + Math.min(combo, 4) * 2 + Math.ceil(left / 5)); setCombo((c) => c + 1); setRights((r) => r + 1); } else setCombo(0);
  }, [picked, round, options, combo, left]);

  useEffect(() => {
    if (done || picked !== null) return;
    if (left <= 0) { answer(null); return; }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, picked, done, answer]);

  const next = () => {
    if (i + 1 >= ROUNDS) { setDone(true); return; }
    setI(i + 1); setPicked(null); setLeft(SECONDS);
  };

  useEffect(() => {
    if (!done || saved.current) return;
    saved.current = true;
    const today = todayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const s = loadPlay();
    const streakDays = s.lastDay === today ? s.streakDays : s.lastDay === yesterday ? s.streakDays + 1 : 1;
    const nx: PlayStats = { best: Math.max(s.best, score), plays: s.plays + 1, streakDays, lastDay: today, days: (s.days ?? 0) + (s.lastDay === today ? 0 : 1), perfect: (s.perfect ?? 0) + (rights >= ROUNDS ? 1 : 0) };
    try { localStorage.setItem(PLAY_KEY, JSON.stringify(nx)); } catch { /* ignore */ }
    setStats(nx);
  }, [done, score, rights]);

  const again = () => { setDaily(false); setRights(0); setDeck(shuffle(POOL).slice(0, ROUNDS)); setI(0); setPicked(null); setScore(0); setCombo(0); setLeft(SECONDS); setDone(false); saved.current = false; };
  const max = ROUNDS * 10 + ROUNDS * 4 + 8 * 2;

  if (done) {
    const title = score >= max * 0.75 ? "Sharp eye" : score >= max * 0.45 ? "Getting there" : "Good start";
    return (
      <div className="container page play">
        <div className="card play-card play-end">
          <Icon name="emoji_events" className="play-trophy" />
          <h1 className="t-hl">{title}</h1>
          <p className="t-bl t-secondary">You scored <strong>{score}</strong> points. Your best is {stats.best}. This is just you versus you: nothing is ranked or shared.</p>
          <div className="row gap-8 wrap" style={{ justifyContent: "center" }}>
            <Chip icon="local_fire_department" tone="warning">{stats.streakDays}-day streak</Chip>
            <Chip icon="sports_esports" tone="tonal">{stats.plays} plays</Chip>
            <Chip icon="check_circle" tone="success">{rights} of {ROUNDS} right</Chip>
          </div>
          <ul className="play-ach" aria-label="Achievements">
            {ACHIEVEMENTS.map((a) => { const on = a.test(stats); return <li key={a.id} className={on ? "on" : ""}><Icon name={on ? a.icon : "lock"} className="sm" />{a.label}</li>; })}
          </ul>
          <div className="row gap-12 wrap" style={{ justifyContent: "center", marginTop: 20 }}>
            <Button icon="replay" onClick={again}>Play again</Button>
            <LinkButton to="/roles" variant="tonal" icon="play_arrow">Rehearse a full role</LinkButton>
          </div>
        </div>
      </div>
    );
  }

  const bar = (left / SECONDS) * 100;
  return (
    <div className="container page play">
      <div className="page-head">
        <h1 className="t-hl page-title">Spot the trap</h1>
        <p className="t-bl t-secondary measure">Six quick workplace moments. Pick the move a good new hire would make. A 60-second warm-up before the real rehearsal.</p>
      </div>
      <div className="card play-card">
        <div className="play-top">
          <Chip icon={round!.icon} tone="tonal">{round!.role}</Chip>
          <Chip icon={daily ? "today" : "fitness_center"} tone={daily ? "primary" : "tonal"}>{daily ? "Daily challenge" : "Practice"}</Chip>
          <span className="t-bm t-secondary">Round {i + 1} of {ROUNDS}</span>
          <span className="play-score" aria-live="polite"><Icon name="stars" />{score}</span>
          {combo > 1 && <Chip icon="bolt" tone="success">Combo x{combo}</Chip>}
        </div>
        <div className="play-timer" role="progressbar" aria-valuemin={0} aria-valuemax={SECONDS} aria-valuenow={left} aria-label="Time left"><div style={{ width: `${bar}%` }} className={left <= 5 ? "low" : ""} /></div>
        <p className="t-bm t-secondary" style={{ marginTop: 16 }}>{round!.from}</p>
        <p className="t-tl play-scene">{round!.scene}</p>
        <div className="play-options" role="group" aria-label="Choices">
          {options.map((o, k) => {
            const state = picked === null ? "" : o.ok ? "right" : picked === k ? "wrong" : "dim";
            return (
              <button key={k} type="button" className={`play-opt ${state}`} onClick={() => answer(k)} aria-disabled={picked !== null || undefined}>
                <Icon name={state === "right" ? "check_circle" : state === "wrong" ? "cancel" : "radio_button_unchecked"} />
                <span>{o.c}</span>
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <div className={`play-why ${options[picked]?.ok ? "ok" : "no"}`} role="status">
            <strong>{picked >= 0 && options[picked]?.ok ? "Nice. " : picked === -1 ? "Time's up. " : "Not quite. "}</strong>{round!.why}
            <div style={{ marginTop: 12 }}><Button onClick={next} icon="arrow_forward" iconRight>{i + 1 >= ROUNDS ? "See my result" : "Next"}</Button></div>
          </div>
        )}
      </div>
      <p className="t-bm t-secondary row gap-8" style={{ marginTop: 16 }}><Icon name="lock" className="sm" />Practice only. Your score stays on this device.</p>
    </div>
  );
}
