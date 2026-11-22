import { useEffect, useState } from "react";
import { Avatar, Icon } from "../../design/components";
import { BadgeArt } from "../game/BadgeArt";

/**
 * A self-playing preview of one shift, so a visitor sees what doing the simulation feels like:
 * ask, fix, run the checks, see the proof. It is a scripted example (labelled as such), not a live session.
 */

const STEPS = [
  { id: "ask", label: "Ask", clock: "Wed 09:30", goal: "Read the ticket. Ask before you touch the code." },
  { id: "fix", label: "Fix", clock: "Wed 11:10", goal: "Make the change a teammate can follow." },
  { id: "test", label: "Test", clock: "Wed 14:05", goal: "Run the real checks. Read what fails." },
  { id: "proof", label: "Proof", clock: "Wed 17:30", goal: "See what your own words and work showed." },
] as const;

const CHECKS = ["bulk order discount applied once", "single item unchanged", "no discount on one unit", "rounding to the paisa", "quantity zero", "negative quantity rejected", "large order under 1s"];

function Scene({ i }: { i: number }) {
  if (i === 0) {
    return (
      <div className="ls-scene" key="ask">
        <div className="ls-msg them ls-d1"><Avatar name="Priya Nair" hue={210} size="sm" presence="online" /><div><b>Priya Nair</b><span className="ls-tag">AI colleague</span><p>Morning! I've put <b>INV-142</b> on your board. Customers are getting a double discount. Release is Friday.</p></div></div>
        <div className="ls-msg me ls-d2"><p>Before I start: does the discount apply per line or to the whole order?</p></div>
        <div className="ls-msg them ls-d3"><Avatar name="Priya Nair" hue={210} size="sm" presence="online" /><div><p>Good question. Per line. Check the spec in the wiki.</p></div></div>
        <p className="ls-note ls-d4"><Icon name="check_circle" className="sm" /> Asked a clarifying question before coding</p>
      </div>
    );
  }
  if (i === 1) {
    return (
      <div className="ls-scene" key="fix">
        <div className="ls-file"><Icon name="description" className="sm" /><span className="mono">src/pricing.py</span><span className="ls-pill">edited</span></div>
        <pre className="ls-code"><span className="ls-line">{"def line_total(price, qty, rate):"}</span>{"\n"}<span className="ls-line del ls-d1">{"-    subtotal = subtotal * (1 - rate)"}</span>{"\n"}<span className="ls-line add ls-d2">{"+    return round(price * qty * (1 - rate), 2)"}</span></pre>
        <div className="ls-msg them ls-d3"><Avatar name="Dev Rao" hue={150} size="sm" presence="online" /><div><b>Dev Rao</b><span className="ls-tag">AI reviewer</span><p>Could you add a test for quantity 0? It has regressed before.</p></div></div>
      </div>
    );
  }
  if (i === 2) {
    return (
      <div className="ls-scene" key="test">
        <div className="ls-checks-head"><Icon name="terminal" className="sm" /><span>Running in a Google-hosted sandbox</span></div>
        <ul className="ls-checks">
          {CHECKS.map((c, k) => (
            <li key={c} className={k === 4 || k === 5 ? "ls-flip" : "ls-ok"} style={{ animationDelay: `${k * 0.12}s` }}>
              {k === 4 || k === 5
                ? <span className="ls-swap"><Icon name="cancel" className="sm ls-x" fill /><Icon name="check_circle" className="sm ls-v" fill /></span>
                : <Icon name="check_circle" className="sm" fill />}
              <span>{c}</span>
            </li>
          ))}
        </ul>
        <p className="ls-result"><b className="ls-n1">5 of 7</b><span className="ls-arrow"> → </span><b className="ls-n2">7 of 7</b><span className="t-secondary"> after reading the failures and fixing the edge cases</span></p>
      </div>
    );
  }
  return (
    <div className="ls-scene" key="proof">
      <div className="ls-proof">
        <div className="ls-medal ls-d1"><BadgeArt roleId="software-engineer" skillId="verify_changes" title="Verified before shipping" size={92} tier="earned" fresh /><b>Verified before shipping</b></div>
        <div className="ls-bars">
          <div className="ls-bar"><span>You said</span><div><i style={{ width: "80%" }} /></div></div>
          <div className="ls-bar"><span>You showed</span><div className="warn"><i className="ls-grow" style={{ width: "86%" }} /></div></div>
          <p className="ls-quote">"I'll add a test for quantity 0 first, then fix it." <span className="t-secondary">quote checked against your transcript</span></p>
        </div>
      </div>
    </div>
  );
}

export function LiveShift() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setStill(!!m?.matches);
  }, []);
  useEffect(() => {
    if (paused || still) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), 5200);
    return () => clearTimeout(t);
  }, [step, paused, still]);

  const cur = STEPS[step]!;
  return (
    <div className="liveshift" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="ls-bar-top">
        <span className="ls-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="ls-title">Day 3 at Meridian Labs</span>
        <span className="ls-clock"><Icon name="schedule" className="sm" />{cur.clock}</span>
      </div>
      <div className="ls-goal" aria-live="off"><span className="ls-step">Step {step + 1} of {STEPS.length}</span><b>{cur.goal}</b></div>
      <div className="ls-stage" aria-hidden="true"><Scene i={step} /></div>
      <div className="ls-track" role="tablist" aria-label="Preview steps">
        {STEPS.map((s, k) => (
          <button key={s.id} role="tab" aria-selected={k === step} className={`ls-tab${k === step ? " on" : ""}${k < step ? " done" : ""}`} onClick={() => setStep(k)}>
            <span className="ls-num">{k < step ? <Icon name="check" className="sm" /> : k + 1}</span>{s.label}
            {k === step && !paused && !still && <span className="ls-prog" key={`${step}-${paused}`} />}
          </button>
        ))}
      </div>
      <p className="ls-foot">A scripted example from the Software Engineer simulation. You play it for real in about 25 minutes.</p>
    </div>
  );
}
