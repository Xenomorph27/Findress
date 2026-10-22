// Safety rail for the dev-fixes work: refuse to run when DATABASE_URL points at production.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const PROD_ENDPOINT = "ep-silent-waterfall-b5s3elqp";
const host = (u) => (u || "").replace(/^[a-z]+:\/\/[^@]*@/, "").split(/[/:?]/)[0];
const vars = process.env.DATABASE_URL
  ? process.env
  : parseEnv(readFileSync(process.argv[2] ?? ".env.devfixes", "utf8"));
const h = host(vars.DATABASE_URL);
if (!h || h.includes(PROD_ENDPOINT)) {
  console.error(`REFUSING: DATABASE_URL host is ${h || "(empty)"} (production or unset)`);
  process.exit(1);
}
console.log(`ok: ${h.replace(/-pooler/, "")} is not production`);
