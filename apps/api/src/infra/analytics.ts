import { BigQuery } from "@google-cloud/bigquery";
import type { StoredReport } from "../domain/types.js";
import { error as logError, info } from "./log.js";

export interface AnalyticsRow {
  ts: string;
  role: string;
  kind: string;
  mode: string;
  skill_id: string;
  anchors_met: number;
  anchors_total: number;
  state: string;
  trap_missed: number;
}

/** Anonymous rows only: no user id, no mission id, no text. Used for the college / employer pattern view. */
export function toRows(r: StoredReport): AnalyticsRow[] {
  const missedTraps = r.traps.filter((t) => t.missed).length;
  return r.skills
    .filter((s) => s.signals.length > 0)
    .map((s) => ({
      ts: r.createdAt,
      role: r.roleId,
      kind: r.kind,
      mode: r.integrity.mode,
      skill_id: s.skillId,
      anchors_met: s.anchorsMet,
      anchors_total: s.anchorsTotal,
      state: s.state,
      trap_missed: missedTraps,
    }));
}

export interface Analytics {
  recordCompletion(r: StoredReport): Promise<void>;
  rowsWritten(): number;
  enabled(): boolean;
}

export class BigQueryAnalytics implements Analytics {
  private bq: BigQuery;
  private written = 0;
  constructor(private project: string, private dataset = "ayden_analytics", private table = "mission_skill_results") {
    this.bq = new BigQuery({ projectId: project });
  }
  enabled() {
    return true;
  }
  rowsWritten() {
    return this.written;
  }
  async recordCompletion(r: StoredReport) {
    const rows = toRows(r);
    if (!rows.length) return;
    try {
      await this.bq.dataset(this.dataset).table(this.table).insert(rows);
      this.written += rows.length;
      info("analytics rows written", { rows: rows.length });
    } catch (e) {
      logError("analytics insert failed", { error: String((e as Error).message).slice(0, 160) });
    }
  }
}

export class NoAnalytics implements Analytics {
  async recordCompletion() {}
  rowsWritten() {
    return 0;
  }
  enabled() {
    return false;
  }
}
