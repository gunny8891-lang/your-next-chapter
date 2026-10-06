import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DAILY_STATE_KEEP_DAYS } from "@/lib/experience/dailyStateStore";
import { OPERATOR, missingOperatorDetails, type OperatorField } from "@/lib/legal/details";
import { DATA_CATEGORIES, NON_PERSONAL_TABLES, PROVIDERS, RETENTION, privacySections, type Section } from "@/lib/legal/privacy";
import { termsSections } from "@/lib/legal/terms";

/**
 * The privacy notice makes promises about the product. These tests hold it to them: if
 * the database gains a table of personal data, the code starts talking to a new outside
 * service, or a retention period changes, the notice is out of date and the build says so.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

// ---- the database ---------------------------------------------------------------------

type Table = { name: string; body: string };

function migrationTables(): Table[] {
  const dir = join(ROOT, "supabase", "migrations");
  const tables: Table[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    for (const match of sql.matchAll(/create table public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      tables.push({ name: match[1], body: match[2] });
    }
  }
  return tables;
}

const TABLES = migrationTables();
const PERSONAL = TABLES.filter((t) => !NON_PERSONAL_TABLES.includes(t.name));
const DISCLOSED = DATA_CATEGORIES.flatMap((c) => c.tables);

describe("the notice covers every table that holds personal data", () => {
  it("found the tables to check", () => {
    expect(TABLES.length).toBeGreaterThan(15);
  });

  it.each(PERSONAL.map((t) => t.name))("%s is described in the notice", (name) => {
    expect(DISCLOSED, `Table "${name}" holds personal data but the privacy notice (DATA_CATEGORIES) does not mention it.`).toContain(name);
  });

  it("names no table that does not exist", () => {
    const real = new Set(TABLES.map((t) => t.name));
    for (const name of [...DISCLOSED, ...NON_PERSONAL_TABLES]) expect(real.has(name), `"${name}" is not a table`).toBe(true);
  });

  it("does not list one table twice", () => {
    expect(new Set(DISCLOSED).size).toBe(DISCLOSED.length);
  });
});

describe("deleting an account removes what the notice says it removes", () => {
  it.each(PERSONAL.filter((t) => t.name !== "users").map((t) => t.name))("%s goes with the account (or is kept without identity)", (name) => {
    const table = TABLES.find((t) => t.name === name)!;
    if (name === "ai_usage_logs") {
      // Kept after deletion, but cut loose from the person: the notice says exactly this.
      expect(table.body).toMatch(/user_id uuid references public\.users \(id\) on delete set null/);
      expect(RETENTION.some((r) => /without your identity/.test(r.howLong))).toBe(true);
      return;
    }
    // Directly under the account, or under a parent that is (itinerary items live under itineraries).
    const parents = ["users", ...PERSONAL.map((t) => t.name)].map((n) => `references public\\.${n} \\(id\\) on delete cascade`);
    expect(table.body, `"${name}" would survive an account deletion`).toMatch(new RegExp(parents.join("|")));
  });

  it("the account row itself goes when the sign-in does", () => {
    expect(TABLES.find((t) => t.name === "users")!.body).toMatch(/references auth\.users \(id\) on delete cascade/);
  });

  it("the delete button really removes the sign-in (which removes everything under it)", () => {
    expect(read("src/app/account/actions.ts")).toMatch(/auth\.admin\.deleteUser\(/);
  });
});

describe("'clear what we have learned' clears what the notice says it clears", () => {
  const learned = ["activity", "today"].flatMap((id) => DATA_CATEGORIES.find((c) => c.id === id)!.tables);

  it.each(learned)("%s", (table) => {
    expect(read("src/app/account/learningActions.ts")).toContain(`"${table}"`);
  });
});

describe("retention", () => {
  const text = JSON.stringify(privacySections());

  it("the notice states the same number of days the nightly clean-up keeps", () => {
    expect(text).toContain(`${DAILY_STATE_KEEP_DAYS} days`);
    expect(read("src/lib/experience/dailyStateStore.ts")).toMatch(/keepDays = DAILY_STATE_KEEP_DAYS/);
  });

  it("the clean-up actually runs on a schedule", () => {
    expect(read("src/app/api/jobs/daily-nudges/route.ts")).toContain("purgeOldDailyStates");
    expect(read("vercel.json")).toContain("/api/jobs/daily-nudges");
  });
});

// ---- the outside services -----------------------------------------------------------------

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__fixtures__" || entry === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Web addresses that appear in the code but are not somewhere member information is sent. */
const NOT_RECIPIENTS: Record<string, string> = {
  "www.openstreetmap.org": "attribution links shown to the member",
  "commons.wikimedia.org/wiki": "credit links shown to the member",
  "operations.osmfoundation.org": "a documentation link in a comment",
  "www.larkhour.com": "the app's own address: page metadata, the sitemap, and the identifying header sent to Wikimedia",
  "search.local": "a placeholder, never requested",
  "www.nationaltrust.org.uk": "a public page the discovery job reads for places, nothing about members",
  "www.richmond.gov.uk": "a public page the discovery job reads for places, nothing about members",
  "rut.u3asite.uk": "a public page the discovery job reads for places, nothing about members",
};

describe("every outside service the code calls is disclosed", () => {
  const files = sourceFiles(join(ROOT, "src")).filter((f) => !relative(ROOT, f).startsWith(join("src", "lib", "legal")));
  const hostsInCode = new Map<string, string>();
  for (const file of files) {
    for (const m of read(relative(ROOT, file)).matchAll(/https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
      hostsInCode.set(m[1].toLowerCase(), relative(ROOT, file));
    }
  }
  const disclosed = new Set(PROVIDERS.flatMap((p) => p.hosts));

  it("found the addresses to check", () => {
    expect(hostsInCode.size).toBeGreaterThan(3);
  });

  it("no address in the code is unaccounted for", () => {
    const unknown = [...hostsInCode].filter(([host]) => !disclosed.has(host) && !(host in NOT_RECIPIENTS) && !/^(localhost|example\.)/.test(host));
    const detail = unknown.map(([host, file]) => `${host} (in ${file})`);
    // New hosts must either be added to PROVIDERS in privacy.ts (if member information can reach them) or listed above with a reason.
    expect(detail).toEqual([]);
  });

  it.each([...disclosed])("%s is really used by the code", (host) => {
    expect(hostsInCode.has(host), `The notice names ${host} but nothing in the code calls it any more.`).toBe(true);
  });

  it("the AI providers never receive the member's email address", () => {
    // The notice says the AI is not given the email address. These are the modules that build its prompts.
    for (const file of ["src/lib/chat/agent.ts", "src/lib/itinerary/agent.ts", "src/lib/someTime/recommend.ts", "src/lib/nudges/message.ts"]) {
      expect(read(file), `${file} mentions email`).not.toMatch(/\bemail\b/i);
    }
  });

  it("there is no analytics or tracking library", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
    const names = Object.keys(pkg.dependencies ?? {});
    expect(names.filter((n) => /analytics|posthog|segment|mixpanel|sentry|hotjar|gtag|amplitude|fullstory/i.test(n))).toEqual([]);
  });
});

// ---- the pages -------------------------------------------------------------------------------

const FILLED: Record<OperatorField, string> = {
  companyName: "Example Company Ltd",
  companyNumber: "01234567",
  address: "1 Example Street, London, N1 1AA",
  contactEmail: "privacy@example.test",
  icoNumber: "ZA000000",
};

const flatten = (sections: Section[]) =>
  sections
    .flatMap((s) => [s.title, ...s.blocks.flatMap((b) => ("p" in b ? [b.p] : "ul" in b ? b.ul : b.dl.flatMap((d) => [d.term, d.text])))])
    .join("\n");

describe("the privacy notice and terms", () => {
  it("say plainly what is still to be supplied, and nothing is invented", () => {
    const blank = Object.fromEntries(Object.keys(FILLED).map((k) => [k, null])) as Record<OperatorField, string | null>;
    const text = flatten(privacySections(blank)) + flatten(termsSections(blank));
    expect(text).toContain("[company name to be added]");
    expect(text).toContain("[contact email to be added]");
    expect(missingOperatorDetails(blank)).toHaveLength(5);
  });

  it("have no gaps left once the company details are in", () => {
    for (const text of [flatten(privacySections(FILLED)), flatten(termsSections(FILLED))]) {
      expect(text).not.toMatch(/\[[^\]]*to be added\]/);
      expect(text).toContain(FILLED.companyName);
      expect(text).toContain(FILLED.contactEmail);
    }
    expect(flatten(privacySections(FILLED))).toContain(FILLED.icoNumber);
  });

  it("use the company's real details only once they have been supplied", () => {
    // Until then the pages carry a draft banner (see LegalPage). This pins the current state so it is a deliberate edit.
    expect(Object.values(OPERATOR).every((v) => v === null) || missingOperatorDetails().length === 0).toBe(true);
  });

  it("every section has a unique anchor and some content", () => {
    for (const sections of [privacySections(FILLED), termsSections(FILLED)]) {
      const ids = sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of sections) expect(s.blocks.length).toBeGreaterThan(0);
    }
  });

  it("are readable without an account", () => {
    const proxy = read("src/utils/supabase/middleware.ts");
    expect(proxy).toContain('"/privacy"');
    expect(proxy).toContain('"/terms"');
  });

  it("the plain-language promises in the product agree with the notice", () => {
    // The Account page says how the Daily State is treated; the notice must say the same thing.
    expect(read("src/components/AccountSettingsForm.tsx")).toMatch(/deleted after a week/);
    expect(flatten(privacySections(FILLED))).toContain(`${DAILY_STATE_KEEP_DAYS} days`);
  });
});
