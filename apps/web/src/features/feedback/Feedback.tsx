import { useSearchParams } from "react-router";
import type { RoleId } from "../../contract";
import { BackLink } from "../../design/components";
import { FeedbackForm } from "./FeedbackForm";

const ROLES: RoleId[] = ["software-engineer", "finance-analyst", "procurement", "marketing", "tech-consulting", "nurse", "banking-ops", "executive", "data-analyst"];

/** A standalone page testers can open from a link or a QR code. */
export default function Feedback() {
  const [params] = useSearchParams();
  const r = params.get("role") as RoleId | null;
  return (
    <div className="container page">
      <div className="page-head">
        <div className="back-row"><BackLink to="/" label="Home" /></div>
        <h1 className="t-hl page-title">Tell us how it went</h1>
        <p className="t-bl t-secondary measure">You tried Ayden. A minute of honest feedback helps us build the right thing, and it shows up on our live traction page if you let it.</p>
      </div>
      <FeedbackForm roleId={r && ROLES.includes(r) ? r : undefined} missionId={params.get("mission") ?? undefined} />
    </div>
  );
}
