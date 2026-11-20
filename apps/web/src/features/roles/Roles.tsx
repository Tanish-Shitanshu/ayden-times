import { api } from "../../api/client";
import { useAsync } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useApp } from "../../app/store";
import { ErrorState, Icon, LinkButton, SlowNote } from "../../design/components";
import { RoleCard, RoleCardSkeleton } from "./RoleCard";
import type { Progress } from "../../contract";

export default function Roles() {
  const t = useT();
  const me = useApp((s) => s.me);
  const roles = useAsync(() => api.getRoles(), []);
  const tried = me?.onboardings.map((o) => o.roleId) ?? [];
  const progress = useAsync(async () => {
    const out: Record<string, Progress> = {};
    await Promise.all(tried.map((r) => api.getProgress(r).then((p) => { out[r] = p; }).catch(() => undefined)));
    return out;
  }, [tried.join(",")]);
  const label = (id: string) => {
    const p = progress.data?.[id];
    if (!p) return undefined;
    if (p.attempts.some((a) => a.status === "active")) return t("common.inProgress");
    if (p.attempts.length) return t("roles.milestones", { a: p.milestonesAchieved, b: p.milestonesTotal });
    return undefined;
  };
  return (
    <div className="container page">
      <div className="page-head">
        <h1 className="t-hl page-title">{t("roles.title")}</h1>
        <p className="t-bl t-secondary measure">{t("roles.sub")}</p>
      </div>
      {roles.error ? <ErrorState error={roles.error} retry={roles.reload} /> : (
        <>
          <div className="grid grid-3">
            {roles.loading || !roles.data ? Array.from({ length: 5 }, (_, i) => <RoleCardSkeleton key={i} />) : roles.data.map((r) => <RoleCard key={r.id} role={r} showStart progressLabel={label(r.id)} />)}
          </div>
          <SlowNote active={roles.loading} />
        </>
      )}
      <div className="card row gap-16 wrap" style={{ marginTop: 24, padding: 16, alignItems: "center" }}>
        <Icon name="sports_esports" className="lg" />
        <div style={{ flex: 1, minWidth: 200 }}><div className="t-tm">Warm up: Spot the trap</div><div className="t-bm t-secondary">Six quick workplace moments in about a minute. Just you versus you.</div></div>
        <LinkButton to="/play" variant="tonal" icon="play_arrow">Play</LinkButton>
      </div>
      <p className="t-bm t-secondary row gap-8" style={{ marginTop: 32 }}><Icon name="person" className="sm" />{t("roles.footer")}</p>
    </div>
  );
}
