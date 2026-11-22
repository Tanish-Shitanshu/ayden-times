import type { DrillDef, MissionDef, RolePack } from "../domain/types.js";
import { bankingOps } from "./banking-ops.js";
import { dataAnalyst } from "./data-analyst.js";
import { executive } from "./executive.js";
import { financeAnalyst } from "./finance-analyst.js";
import { marketing } from "./marketing.js";
import { nurse } from "./nurse.js";
import { procurement } from "./procurement.js";
import { softwareEngineer } from "./software-engineer.js";
import { techConsulting } from "./tech-consulting.js";

export const ROLES: RolePack[] = [softwareEngineer, financeAnalyst, procurement, techConsulting, marketing, bankingOps, nurse, executive, dataAnalyst];

export const getRole = (id: string): RolePack | undefined => ROLES.find((r) => r.id === id);

export function findMission(role: RolePack, id?: string): MissionDef | undefined {
  return id ? role.missions.find((m) => m.id === id) : role.missions[0];
}
export const findDrill = (role: RolePack, id: string): DrillDef | undefined => role.drills.find((d) => d.id === id);
