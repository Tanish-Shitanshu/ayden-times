import { useRef, useState } from "react";
import { Banner, Button } from "../../design/components";

/** A small "Remove" link under a public response. It opens "Admin login for removal"; only the right name and password can remove it. */
export function AdminRemove({ id, onRemoved }: { id: string; onRemoved: (id: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const close = () => { ref.current?.close(); setName(""); setPassword(""); setErr(""); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/v1/feedback/${encodeURIComponent(id)}/remove`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, password }) });
      if (r.ok) { close(); onRemoved(id); return; }
      const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
      setErr(r.status === 403 ? "Wrong name or password." : j?.error?.message ?? "Could not remove it.");
    } catch { setErr("Could not reach the server. Try again."); } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" className="tr-remove" onClick={() => ref.current?.showModal()}>Remove</button>
      <dialog ref={ref} className="tr-dialog" aria-labelledby={`tr-adm-${id}`} onClose={() => { setErr(""); }}>
        <form onSubmit={submit} className="stack gap-12">
          <h2 id={`tr-adm-${id}`} className="t-tl">Admin login for removal</h2>
          <p className="t-bm t-secondary">Only the admin can remove a response.</p>
          <label className="stack gap-4"><span className="t-lm">Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoCapitalize="none" required /></label>
          <label className="stack gap-4"><span className="t-lm">Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {err && <Banner kind="error">{err}</Banner>}
          <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
            <Button variant="text" type="button" onClick={close}>Cancel</Button>
            <Button type="submit" icon="delete" loading={busy} disabledReason={!name.trim() || !password ? "Enter the name and password." : false}>Remove</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
