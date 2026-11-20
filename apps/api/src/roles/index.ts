import type { DrillDef, MissionDef, RolePack } from "../domain/types.js";
import { softwareEngineer } from "./software-engineer.js";

export const ROLES: RolePack[] = [softwareEngineer];

export const getRole = (id: string): RolePack | undefined => ROLES.find((r) => r.id === id);

export function findMission(role: RolePack, id?: string): MissionDef | undefined {
  return id ? role.missions.find((m) => m.id === id) : role.missions[0];
}
export const findDrill = (role: RolePack, id: string): DrillDef | undefined => role.drills.find((d) => d.id === id);
