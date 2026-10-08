import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanDogName, dogFromForm } from "@/lib/account/dog";
import { parseTimeRequest } from "@/lib/someTime/request";
import { extrasContext, extrasSummary, type DogInfo } from "@/components/TimeSheet";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const form = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe("what the Account form says about the dog", () => {
  it("is nothing at all unless they have a dog, and forgets the rest when they untick it", () => {
    expect(dogFromForm(form({}))).toEqual({ has_dog: false, dog_name: null, dog_usually_comes: false });
    expect(dogFromForm(form({ dog_name: "Biscuit", dog_usually_comes: "on" }))).toEqual({ has_dog: false, dog_name: null, dog_usually_comes: false });
  });

  it("keeps the name and the usual habit for someone with a dog, each optional", () => {
    expect(dogFromForm(form({ has_dog: "on" }))).toEqual({ has_dog: true, dog_name: null, dog_usually_comes: false });
    expect(dogFromForm(form({ has_dog: "on", dog_name: "  Biscuit ", dog_usually_comes: "on" }))).toEqual({ has_dog: true, dog_name: "Biscuit", dog_usually_comes: true });
  });

  it("tidies a name: no control characters, one space between words, at most 60 characters, null when empty", () => {
    expect(cleanDogName("Mr\u0000  Biscuit\n")).toBe("Mr Biscuit");
    expect(cleanDogName("a".repeat(100))).toHaveLength(60);
    expect(cleanDogName("   ")).toBeNull();
    expect(cleanDogName(undefined)).toBeNull();
    expect(cleanDogName(42)).toBeNull();
  });

  it("is saved with the rest of the profile, shown on the Account page, and asks nothing more of someone without a dog", () => {
    expect(read("src/app/account/actions.ts")).toContain("...dogFromForm(formData)");
    expect(read("src/app/account/page.tsx")).toContain("has_dog, dog_name, dog_usually_comes");
    const form = read("src/components/AccountSettingsForm.tsx");
    expect(form).toContain('label="I have a dog"');
    expect(form).toContain("{hasDog && (");
    expect(form).toContain('label="I often take my dog with me"');
    // A dog never changes what goes in the weekly plan, so adding one must not rebuild it.
    expect(read("src/lib/account/planInputs.ts")).not.toMatch(/has_dog|dog_/);
  });
});

describe("what the sheet sends for this outing", () => {
  const dog: DogInfo = { hasDog: true, usuallyComes: true, name: "Biscuit" };

  it("sends nothing when nothing was chosen and there is no dog", () => {
    expect(extrasContext("any", undefined, false)).toBeUndefined();
    expect(extrasContext("any", { hasDog: false, usuallyComes: false, name: null }, true)).toBeUndefined();
  });

  it("sends the spend when one was chosen", () => {
    expect(extrasContext("free", undefined, false)).toEqual({ spend: "free" });
    expect(extrasContext("mid", { hasDog: false, usuallyComes: false, name: null }, false)).toEqual({ spend: "mid" });
  });

  it("sends the dog either way for someone with a dog, so No overrides a usual Yes", () => {
    expect(extrasContext("any", dog, true)).toEqual({ dog: true });
    expect(extrasContext("any", dog, false)).toEqual({ dog: false });
    expect(extrasContext("low", dog, true)).toEqual({ spend: "low", dog: true });
  });

  it("arrives at the server in a form the server accepts", () => {
    const context = extrasContext("low", dog, true);
    expect(parseTimeRequest({ start: "now", duration: "1-2h", who: "just_me", context })?.context).toEqual({ spend: "low", dog: true });
  });

  it("says what is chosen in a line, mentioning the dog only when it is coming", () => {
    expect(extrasSummary("any", undefined, false)).toBe("Spend: Don't mind");
    expect(extrasSummary("free", dog, true)).toBe("Spend: Free · Dog coming");
    expect(extrasSummary("low", dog, false)).toBe("Spend: £");
    expect(extrasSummary("mid", { hasDog: false, usuallyComes: false, name: null }, true)).toBe("Spend: ££");
  });

  it("asks about the dog only for someone who has one, starting from what they usually do, and does not remember the spend", () => {
    const sheet = read("src/components/TimeSheet.tsx");
    expect(sheet).toContain("{dog?.hasDog && (");
    expect(sheet).toContain("useState<boolean>(dog?.hasDog === true && dog.usuallyComes)");
    expect(sheet).toContain('useState<Spend | "any">("any")');
    expect(sheet).not.toMatch(/writeSaved\(\{[^}]*spend/);
    expect(sheet).toContain("...(context ? { context } : {})");
  });

  it("is given the dog by Today", () => {
    expect(read("src/components/TodayView.tsx")).toContain("dog={dog}");
    const page = read("src/app/today/page.tsx");
    expect(page).toContain("has_dog, dog_name, dog_usually_comes");
    expect(page).toContain("hasDog: profile.has_dog === true");
  });
});

describe("what a card says", () => {
  const card = read("src/components/ExperienceCard.tsx");

  it("shows the cost from the same tiers as the filter, and a dog line only when dogs are known to be welcome", () => {
    expect(card).toContain("costLabelFor(option)");
    expect(card).toContain('option.facts.find((f) => f.startsWith("Dogs "))');
  });

  it("says what still needs checking, in words, never hidden", () => {
    expect(card).toContain("option.contextNotes.length > 0 &&");
    expect(card).toContain('option.contextNotes.join(" · ")');
  });
});
