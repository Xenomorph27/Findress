/**
 * Run a command with the variables from an env file layered over the current environment.
 *   node scripts/with-env.mjs .env.neon next dev
 *
 * Used by the `:neon` scripts. `node --env-file` can't do this job: Next's build workers inherit
 * Node's flags through NODE_OPTIONS, which rejects --env-file. Variables in the file win over the
 * shell's and over .env.local, which Next loads without overriding what is already set.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const [file, command, ...args] = process.argv.slice(2);
if (!file || !command) {
  console.error("usage: node scripts/with-env.mjs <env-file> <command> [args...]");
  process.exit(2);
}

let vars;
try {
  vars = parseEnv(readFileSync(file, "utf8"));
} catch (err) {
  console.error(`Could not read ${file}: ${err.message}`);
  console.error("Create it with: neon env pull --file .env.neon");
  process.exit(2);
}

// shell: true so `next` / `tsx` resolve to the .cmd shims on Windows.
const child = spawn(command, args, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...vars },
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
