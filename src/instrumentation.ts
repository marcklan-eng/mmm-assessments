// Runs once when the server starts, before any page or API route loads.
// Some hosts (e.g. Google AI Studio) ask for a value for every setting the code mentions. Placeholders like
// "none" mean "not set", so treat them exactly like a missing setting.
const PLACEHOLDERS = new Set(["none", "n/a", "na", "-", "null", "unset", "not set", "skip"]);

export function register() {
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string" && PLACEHOLDERS.has(v.trim().toLowerCase())) delete process.env[k];
  }
}
