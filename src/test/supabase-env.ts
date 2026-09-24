/**
 * Global setup for the database tests: reads the local Supabase URL and keys
 * from `supabase status` so nothing is hard-coded. Start the stack first with
 * `npx supabase start`.
 */
import { execSync } from "node:child_process";

export default function setup() {
  let output: string;
  try {
    output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new Error("Local Supabase isn't running. Start it with `npx supabase start` (needs Docker).");
  }
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) process.env[`SUPABASE_LOCAL_${match[1]}`] = match[2];
  }
}
