import { useCallback, useEffect, useState } from "react";
import { Banner, BackLink, Button, Chip, EmptyState } from "../../design/components";
import { Stars } from "../traction/Traction";

interface Item { id: string; createdAt: string; roleId?: string; rating: number; recommend: number; comment?: string; name?: string; college?: string; photo?: string; showPublicly: boolean }

const KEY = "ayden_admin_token";
const read = (): string => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } };
const write = (v: string) => { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch { /* private mode */ } };

async function call(method: "GET" | "DELETE", path: string, token: string): Promise<{ status: number; body: { items?: Item[]; error?: { message: string } } }> {
  const r = await fetch(`/api/v1${path}`, { method, headers: { "x-admin-token": token }, credentials: "omit" });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Review feedback and remove a response. An admin can delete, never add or edit. Protected by a token that lives in Secret Manager. */
export default function Admin() {
  const [token, setToken] = useState(read());
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async (t: string) => {
    setErr("");
    const r = await call("GET", "/admin/feedback", t);
    if (r.status === 200) { setItems(r.body.items ?? []); write(t); setToken(t); }
    else { setItems(null); write(""); setToken(""); setErr(r.status === 404 ? "The admin page is switched off on this server." : r.body.error?.message ?? "Could not load."); }
  }, []);

  useEffect(() => { if (token) void load(token); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (id: string) => {
    if (!window.confirm("Remove this response permanently? It also disappears from the traction page.")) return;
    setBusy(id);
    const r = await call("DELETE", `/admin/feedback/${id}`, token);
    setBusy("");
    if (r.status === 200) setItems((xs) => (xs ?? []).filter((x) => x.id !== id));
    else setErr(r.body.error?.message ?? "Could not remove it.");
  };

  return (
    <main className="container" style={{ paddingBlock: 24 }}>
      <BackLink to="/traction" label="Traction" />
      <h1 className="t-hl" style={{ marginTop: 12 }}>Feedback review</h1>
      <p className="t-bm t-secondary" style={{ marginTop: 6 }}>Every response, including testers who did not tick "show publicly" (their name and photo are never stored). You can remove a response; you cannot add or edit one.</p>
      {err && <div style={{ marginTop: 12 }}><Banner kind="error">{err}</Banner></div>}
      {items === null ? (
        <form className="card" style={{ marginTop: 16, maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); void load(draft.trim()); }}>
          <label className="t-lm" htmlFor="admin-token">Admin token</label>
          <input id="admin-token" type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 8, border: "1px solid var(--outline)" }} />
          <div style={{ marginTop: 12 }}><Button type="submit" icon="lock_open" disabledReason={draft.trim().length < 16 ? "Enter the token." : false}>Open</Button></div>
        </form>
      ) : items.length === 0 ? (
        <EmptyState icon="inbox" title="No feedback yet" />
      ) : (
        <>
          <p className="t-label t-secondary" style={{ marginTop: 12 }}>{items.length} responses, newest first.</p>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {items.map((f) => (
              <div key={f.id} className="card" style={{ display: "grid", gap: 8 }}>
                <div className="row gap-12 wrap">
                  {f.photo ? <img className="tr-photo" src={f.photo} alt="" /> : <span className="tr-photo" aria-hidden />}
                  <div className="grow">
                    <div className="t-lm">{f.name || "Anonymous tester"}{f.college ? ` · ${f.college}` : ""}</div>
                    <div className="t-label t-secondary">{new Date(f.createdAt).toLocaleString()}{f.roleId ? ` · ${f.roleId}` : ""}</div>
                  </div>
                  <Stars n={f.rating} />
                  <Chip tone="tonal">Recommend {f.recommend}/10</Chip>
                  {f.showPublicly ? <Chip tone="success" icon="visibility">Public</Chip> : <Chip tone="tonal" icon="visibility_off">Private</Chip>}
                </div>
                {f.comment && <blockquote style={{ margin: 0 }}>{f.comment}</blockquote>}
                <div className="row"><span className="spacer" /><Button variant="text" icon="delete" loading={busy === f.id} onClick={() => { void remove(f.id); }}>Remove</Button></div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}><Button variant="text" icon="logout" onClick={() => { write(""); setToken(""); setItems(null); setDraft(""); }}>Lock</Button></div>
        </>
      )}
    </main>
  );
}
