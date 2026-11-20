import { LinkButton, EmptyState } from "../../design/components";
import { useT } from "../../lib/i18n";

export default function NotFound() {
  const t = useT();
  return (
    <div className="container page">
      <h1 className="sr-only">{t("nf.title")}</h1>
      <EmptyState icon="explore_off" title={t("nf.title")} body={t("nf.body")} action={<><LinkButton to="/" icon="home">{t("common.home")}</LinkButton><LinkButton to="/roles" variant="outlined">{t("common.browseRoles")}</LinkButton></>} />
    </div>
  );
}
