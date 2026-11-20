import "../landing/landing.css";
import { Link } from "react-router";
import type { RoleSummary } from "../../contract";
import { Chip, Icon, IconTile, Skeleton } from "../../design/components";
import { useT } from "../../lib/i18n";

export function RoleCard({ role, progressLabel, showStart }: { role: RoleSummary; progressLabel?: string; showStart?: boolean }) {
  const t = useT();
  const ready = role.status === "ready";
  const body = (
    <>
      <div className="row gap-12" style={{ alignItems: "flex-start" }}>
        <IconTile icon={role.icon} color={role.accentHex} />
        <span className="spacer" />
        {progressLabel && <Chip tone="primary" icon="pending">{progressLabel}</Chip>}
        {!ready && <Chip tone="planned">{t("common.planned")}</Chip>}
      </div>
      <h3 className="t-tl" style={{ marginTop: 16 }}>{role.title}</h3>
      <p className="t-label t-secondary" style={{ marginTop: 4 }}>{role.company}</p>
      <p className="t-bm t-secondary" style={{ marginTop: 8, flex: 1 }}>{role.tagline}</p>
      <div className="row gap-8 wrap" style={{ marginTop: 16 }}>
        <Chip>{role.domain}</Chip>
        <Chip icon="schedule">{t("common.minutes", { n: role.estMinutes })}</Chip>
        <Chip icon="psychology">{t("common.skills", { n: role.skillCount })}</Chip>
      </div>
      {showStart && ready && (
        <div className="row" style={{ marginTop: 20 }}>
          <span className="btn btn-tonal" aria-hidden="true">{t("common.start")}</span>
          <span className="spacer" />
          <Icon name="arrow_forward" className="card-arrow" />
        </div>
      )}
      {!showStart && ready && <Icon name="arrow_forward" className="card-arrow" style={{ position: "absolute", right: 20, bottom: 20 }} />}
    </>
  );
  if (!ready) return <div className="card role-card planned" aria-label={`${role.title}. ${t("common.planned")}`}>{body}</div>;
  return <Link to={`/roles/${role.id}`} className="card card-link role-card" aria-label={`${role.title}. ${role.tagline}`}>{body}</Link>;
}

export function RoleCardSkeleton() {
  return (
    <div className="card role-card" aria-hidden="true">
      <Skeleton h={48} w={48} r={14} />
      <Skeleton h={24} w="70%" style={{ marginTop: 16 }} />
      <Skeleton h={14} w="40%" style={{ marginTop: 8 }} />
      <Skeleton h={40} style={{ marginTop: 12 }} />
      <div className="row gap-8" style={{ marginTop: 16 }}><Skeleton h={28} w={80} /><Skeleton h={28} w={70} /></div>
    </div>
  );
}
