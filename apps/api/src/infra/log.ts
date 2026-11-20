/** Structured JSON logs. Cloud Run forwards stdout to Cloud Logging; `severity` maps to log level.
 *  Never log prompt text, user text, keys or connection strings. */
type Sev = "DEBUG" | "INFO" | "WARNING" | "ERROR";

export function log(severity: Sev, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ severity, message, time: new Date().toISOString(), ...fields });
  if (severity === "ERROR") console.error(line);
  else console.log(line);
}
export const info = (m: string, f?: Record<string, unknown>) => log("INFO", m, f);
export const warn = (m: string, f?: Record<string, unknown>) => log("WARNING", m, f);
export const error = (m: string, f?: Record<string, unknown>) => log("ERROR", m, f);
