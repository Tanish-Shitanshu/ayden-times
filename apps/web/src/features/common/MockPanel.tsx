import { useEffect, useState, useSyncExternalStore } from "react";
import type { ErrorCode, RuntimeMode } from "../../contract";
import { getSettings, setSettings, subscribeSettings } from "../../api/mock/settings";
import { resetMockData } from "../../api/mock/server";
import { Button, Drawer, Icon, Switch } from "../../design/components";

const ERRORS: (ErrorCode | "")[] = ["", "unauthenticated", "consent_required", "attempt_cap", "rate_limited", "model_unavailable", "validation", "not_found", "internal"];

/** Development-only controls for the mock backend. Not included when VITE_API_MODE=live. */
export default function MockPanel() {
  const [open, setOpen] = useState(false);
  const s = useSyncExternalStore(subscribeSettings, () => JSON.stringify(getSettings()));
  const v = JSON.parse(s) as ReturnType<typeof getSettings>;
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "m") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  const row = (label: string, sub: string, el: React.ReactNode) => (
    <div className="row gap-12" style={{ padding: "10px 0", borderBottom: "1px solid var(--outline)" }}><div className="grow stack"><span className="t-bm" style={{ fontWeight: 500 }}>{label}</span><span className="t-label t-secondary">{sub}</span></div>{el}</div>
  );
  const select = (val: string, opts: string[], on: (x: string) => void, label: string) => (
    <select aria-label={label} value={val} onChange={(e) => on(e.target.value)} style={{ height: 40, borderRadius: 8, border: "1px solid var(--outline-strong)", background: "var(--surface)", padding: "0 8px" }}>{opts.map((o) => <option key={o} value={o}>{o || "none"}</option>)}</select>
  );
  return (
    <>
      <button type="button" className="mock-pill" onClick={() => setOpen(true)} aria-label="Open mock panel (Ctrl+Shift+M)" title="Mock panel (Ctrl+Shift+M)"><Icon name="science" className="sm" />Mock</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Mock panel (development only)">
        <p className="t-bm t-secondary">The API runs in your browser from fixtures. Switch to the live server by setting <code>VITE_API_MODE=live</code>.</p>
        {row("Simulated latency", "400 to 1200 ms per request", <Switch checked={v.latency} onChange={(x) => setSettings({ latency: x })} label="Latency" />)}
        {row("Slow model", "Replies and checks take 10 s (shows 'Still working')", <Switch checked={v.slowModel} onChange={(x) => setSettings({ slowModel: x })} label="Slow model" />)}
        {row("Runtime mode", "Non-live shows the fallback banner and 'scripted' tags", select(v.runtime, ["live", "scripted", "cached"], (x) => setSettings({ runtime: x as RuntimeMode }), "Runtime"))}
        {row("Force next error", "The next request fails with this code", select(v.forceError ?? "", ERRORS, (x) => setSettings({ forceError: (x || null) as ErrorCode | null }), "Error"))}
        {row("Report polls", "Polls before a report is ready", select(String(v.reportPolls), ["0", "1", "3", "6"], (x) => setSettings({ reportPolls: Number(x) }), "Polls"))}
        {row("Fail next report", "Shows the report error state once", <Switch checked={v.failNextReport} onChange={(x) => setSettings({ failNextReport: x })} label="Fail report" />)}
        {row("Data Analyst as planned", "Shows a non-clickable Planned role", <Switch checked={v.dataPlanned} onChange={(x) => setSettings({ dataPlanned: x })} label="Planned role" />)}
        {row("Seed my groups", "Group insights show seeded demo patterns", <Switch checked={v.seedCohorts} onChange={(x) => setSettings({ seedCohorts: x })} label="Seed groups" />)}
        <div className="row gap-8" style={{ marginTop: 20 }}>
          <Button variant="danger-outlined" icon="restart_alt" onClick={() => { resetMockData(); location.reload(); }}>Reset all mock data</Button>
        </div>
      </Drawer>
    </>
  );
}
