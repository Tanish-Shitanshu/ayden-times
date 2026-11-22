import { useEffect, useState } from "react";
import { api, type WorkSample } from "../../api/client";
import type { Report } from "../../contract";
import { errorText, useT } from "../../lib/i18n";
import { copyText } from "../../lib/hooks";
import { Banner, Button, Icon, LinkButton, TextField } from "../../design/components";
import { Certificate, sampleUrl } from "./Certificate";
import "./share.css";

/** On the report page: share a work sample and download a certificate. Off until the learner opts in. */
export function ShareCard({ report }: { report: Report }) {
  const t = useT();
  const [sample, setSample] = useState<WorkSample | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getShare(report.id).then((s) => { if (alive) { setSample(s.sample); if (s.sample) setName(s.sample.name); } }).catch(() => alive && setSample(null));
    api.getMe({ silent401: true }).then((m) => { if (alive && !m.isGuest) setName((n) => n || m.displayName); }).catch(() => undefined);
    return () => { alive = false; };
  }, [report.id]);

  const create = async () => {
    setBusy(true);
    setErr("");
    try {
      const s = await api.createShare(report.id, name);
      setSample(s.sample);
      if (s.sample) setName(s.sample.name);
    } catch (e) { setErr(errorText(t, e)); } finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true);
    try { await api.revokeShare(report.id); setSample(null); } catch (e) { setErr(errorText(t, e)); } finally { setBusy(false); }
  };

  if (report.status !== "ready" || sample === undefined) return null;
  const url = sample ? sampleUrl(sample.token) : "";
  return (
    <section className="card share-card" aria-labelledby="share-h">
      <div className="row gap-12" style={{ alignItems: "center" }}>
        <Icon name="workspace_premium" className="lg" style={{ color: "var(--primary)" }} />
        <div className="stack gap-4 grow">
          <h2 id="share-h" className="t-tl">Your certificate and shareable work sample</h2>
          <p className="t-bm t-secondary">Put your name on a certificate you can download, and get a link that shows your skills and a few quotes of your own words. Nothing is shared until you do this.</p>
        </div>
      </div>

      <div className="share-name">
        <TextField label="Your full name, as it should appear" value={name} onChange={setName} maxLength={60} helper="Letters only. This is the name on the certificate and the link." />
        <div className="row gap-8 wrap">
          <Button icon={sample ? "check" : "verified"} loading={busy} onClick={create} disabled={name.trim().length < 2}>{sample ? "Update name" : "Create certificate and link"}</Button>
          {sample && <Button variant="text" icon="link_off" onClick={stop} disabled={busy}>Stop sharing</Button>}
        </div>
      </div>
      {err && <Banner kind="error">{err}</Banner>}

      {sample && (
        <>
          <div className="share-url">
            <code>{url}</code>
            <Button variant="outlined" size="sm" icon={copied ? "check" : "content_copy"} onClick={async () => { await copyText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }}>{copied ? "Copied" : "Copy link"}</Button>
            <LinkButton to={`/s/${encodeURIComponent(sample.token)}`} variant="text" size="sm" icon="open_in_new">Preview what others see</LinkButton>
          </div>
          <p className="t-label t-secondary">Anyone with this link can see your name, the skills you showed at or near target, and a few short quotes. They cannot see gaps, your transcript or any score. You can stop sharing at any time and the link stops working.</p>
          <Certificate sample={sample} />
        </>
      )}
    </section>
  );
}
