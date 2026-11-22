import { useRef, useState } from "react";
import { Link } from "react-router";
import { api, type FeedbackInput } from "../../api/client";
import type { RoleId } from "../../contract";
import { useApp } from "../../app/store";
import { errorText, useT } from "../../lib/i18n";
import { Banner, Button, Checkbox, Icon, TextField } from "../../design/components";
import "./feedback.css";

/** Resize a photo in the browser to a small square JPEG, so only a few KB ever leave the device. */
async function toSquareJpeg(file: File, size = 240): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("That image could not be read."));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser cannot resize photos.");
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    for (const q of [0.78, 0.65, 0.5, 0.38]) {
      const out = canvas.toDataURL("image/jpeg", q);
      if (out.length < 80_000) return out;
    }
    throw new Error("That photo is too large.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const STAR_WORDS = ["", "Not useful", "Okay", "Good", "Very good", "Excellent"];

export function FeedbackForm({ roleId, missionId, onDone }: { roleId?: RoleId; missionId?: string; onDone?: () => void }) {
  const t = useT();
  const toast = useApp((s) => s.toast);
  const [rating, setRating] = useState(0);
  const [recommend, setRecommend] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [college, setCollege] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [publicOk, setPublicOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr("");
    try { setPhoto(await toSquareJpeg(f)); } catch (e) { setErr((e as Error).message); }
  };

  const submit = async () => {
    if (!rating || recommend === null) { setErr("Please choose a star rating and how likely you are to recommend Ayden."); return; }
    setBusy(true); setErr("");
    const body: FeedbackInput = { rating, recommend, comment: comment.trim() || undefined, roleId, missionId, showPublicly: publicOk, ...(publicOk ? { name: name.trim() || undefined, college: college.trim() || undefined, photo: photo ?? undefined } : {}) };
    try { await api.sendFeedback(body); setDone(true); toast("Thank you!"); onDone?.(); }
    catch (e) { setErr(errorText(t, e)); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="card fb-done" role="status">
        <Icon name="celebration" className="fb-done-icon" />
        <h2 className="t-tl">Thank you, that really helps</h2>
        <p className="t-bl t-secondary">{publicOk ? "Your feedback may appear on our public traction page." : "Your feedback stays private to the team."}</p>
        <div className="row gap-8 wrap" style={{ justifyContent: "center", marginTop: 12 }}>
          <Link className="btn btn-tonal" to="/traction"><Icon name="monitoring" className="sm" /> See live results</Link>
          <Link className="btn btn-outlined" to="/roles"><Icon name="play_arrow" className="sm" /> Try another role</Link>
        </div>
      </div>
    );
  }

  return (
    <form className="card fb-form stack gap-16" onSubmit={(e) => { e.preventDefault(); void submit(); }} aria-label="Feedback">
      <div>
        <h2 className="t-tl">How was your rehearsal?</h2>
        <p className="t-bm t-secondary">Sixty seconds. Your report stays private. Nothing here is public unless you tick the box at the end.</p>
      </div>

      <fieldset className="fb-group">
        <legend className="t-lm">Overall</legend>
        <div className="fb-stars" role="radiogroup" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}: ${STAR_WORDS[n]}`} className={`fb-star ${n <= rating ? "on" : ""}`} onClick={() => setRating(n)}>
              <Icon name="star" fill={n <= rating} />
            </button>
          ))}
          <span className="t-bm t-secondary fb-star-word" aria-live="polite">{rating ? STAR_WORDS[rating] : "Tap a star"}</span>
        </div>
      </fieldset>

      <fieldset className="fb-group">
        <legend className="t-lm">How likely are you to recommend Ayden to a friend?</legend>
        <div className="fb-scale" role="radiogroup" aria-label="Likelihood to recommend, 0 to 10">
          {Array.from({ length: 11 }, (_, n) => (
            <button type="button" key={n} role="radio" aria-checked={recommend === n} className={`fb-n ${recommend === n ? "on" : ""}`} onClick={() => setRecommend(n)}>{n}</button>
          ))}
        </div>
        <div className="fb-scale-labels t-label t-secondary"><span>Not at all</span><span>Definitely</span></div>
      </fieldset>

      <TextField label="What was most useful, or what should we fix?" value={comment} onChange={setComment} multiline rows={3} maxLength={600} helper={`${comment.length}/600`} />

      <div className="fb-public stack gap-12">
        <Checkbox checked={publicOk} onChange={setPublicOk} sub="Shows your quote, and the name, college and photo below if you add them, on the public traction page. You can ask us to remove it.">
          Show my feedback publicly
        </Checkbox>
        {publicOk && (
          <div className="stack gap-12 fb-public-fields">
            <div className="grid grid-2">
              <TextField label="Your name (optional)" value={name} onChange={setName} maxLength={60} />
              <TextField label="College or company (optional)" value={college} onChange={setCollege} maxLength={80} />
            </div>
            <div className="fb-photo row gap-12">
              {photo ? <img src={photo} alt="Your photo preview" className="fb-photo-img" width={72} height={72} /> : <div className="fb-photo-img empty" aria-hidden><Icon name="add_a_photo" /></div>}
              <div className="stack gap-4">
                <div className="row gap-8 wrap">
                  <Button type="button" variant="tonal" size="sm" icon="photo_camera" onClick={() => file.current?.click()}>{photo ? "Retake photo" : "Add a photo"}</Button>
                  {photo && <Button type="button" variant="text" size="sm" onClick={() => setPhoto(null)}>Remove</Button>}
                </div>
                <span className="t-label t-secondary">Optional. Resized on your device to a small square before it is sent.</span>
              </div>
              <input ref={file} type="file" accept="image/*" capture="user" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          </div>
        )}
      </div>

      {err && <Banner kind="error" icon="error">{err}</Banner>}
      <div className="row gap-8 wrap">
        <Button type="submit" icon="send" loading={busy}>Send feedback</Button>
      </div>
    </form>
  );
}
