import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Read a real upstream file saved under src/lib/sources/__fixtures__. */
export function fixture(...parts: string[]): string {
  return readFileSync(path.join(here, "__fixtures__", ...parts), "utf8");
}
