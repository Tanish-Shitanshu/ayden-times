import { Link } from "react-router";
import { api } from "../../api/client";
import { useAsync } from "../../lib/hooks";
import { Icon } from "../../design/components";
import "./traction.css";

/** A small live line for the landing page. It renders nothing until there are at least 5 real responses. */
export function TractionStrip() {
  const s = useAsync(() => api.getTraction().catch(() => null), []);
  const d = s.data;
  if (!d || d.feedbackCount < 5 || d.avgRating === null) return null;
  return (
    <Link to="/traction" className="tr-strip" style={{ marginTop: 16 }}>
      <Icon name="star" fill style={{ color: "#f9ab00" }} className="sm" />
      <b>{d.avgRating.toFixed(1)} / 5</b> from <b>{d.testers}</b> testers · see live results
      <Icon name="arrow_forward" className="sm" />
    </Link>
  );
}
