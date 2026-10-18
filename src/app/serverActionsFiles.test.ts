import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A file marked "use server" may export only async functions: anything else (a constant, a type that is a value) stops the
 * production build, and the site stays on the old version. The unit tests do not run the build, so this checks it directly.
 */

function files(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const path = `${dir}/${name}`;
    if (statSync(join(process.cwd(), path)).isDirectory()) files(path, found);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) found.push(path);
  }
  return found;
}

describe("files marked use server", () => {
  const serverFiles = files("src").filter((f) => /^\s*["']use server["']/.test(readFileSync(join(process.cwd(), f), "utf8")));

  it("found them", () => {
    expect(serverFiles.length).toBeGreaterThan(15);
  });

  it("export only async functions and types", () => {
    for (const file of serverFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const exports = [...source.matchAll(/^export\s+(?!type\b|interface\b)(async function|function|const|let|var|class|enum|default)\b[^\n]*/gm)].map((m) => m[0]);
      const notAsyncFunctions = exports.filter((e) => !/^export\s+async function\b/.test(e));
      expect(notAsyncFunctions, file).toEqual([]);
    }
  });
});
