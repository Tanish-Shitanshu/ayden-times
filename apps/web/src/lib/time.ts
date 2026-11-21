export function formatDate(iso: string, lang: string = "en") {
  try { return new Date(iso).toLocaleDateString(lang === "en" ? "en-IN" : `${lang}-IN`, { day: "numeric", month: "short", year: "numeric" }); } catch { return iso.slice(0, 10); }
}
export function formatDateTime(iso: string, lang: string = "en") {
  try { return new Date(iso).toLocaleString(lang === "en" ? "en-IN" : `${lang}-IN`, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
}
/** Converts a simulated minute offset to a label using the mission clock as reference. */
export function simLabel(simMinute: number, clock: { minute: number; label: string }) {
  const m = clock.label.match(/^(\S+)\s+(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const base = Number(m[2]) * 60 + Number(m[3]) - clock.minute;
  const t = (((base + simMinute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
