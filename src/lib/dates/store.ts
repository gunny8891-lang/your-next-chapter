import type { SupabaseClient } from "@supabase/supabase-js";
import { DATE_KINDS, isValidMonthDay, type DateKind, type ImportantDate } from "@/lib/dates/importantDates";

/**
 * Reading a member's dates to remember, with their own client (so only their own are ever visible). Never throws: the table
 * comes from a later migration than the rest, and a screen must still show when it is not there yet or cannot be read.
 */
export async function loadImportantDates(supabase: SupabaseClient, memberId: string): Promise<ImportantDate[]> {
  try {
    const { data, error } = await supabase.from("important_dates").select("id, title, kind, month, day, year").eq("member_id", memberId).limit(200);
    if (error) {
      console.warn("important dates: could not read:", error.message);
      return [];
    }
    return (data ?? []).flatMap((row) => {
      const kind = DATE_KINDS.find((k) => k.value === row.kind)?.value as DateKind | undefined;
      const month = Number(row.month);
      const day = Number(row.day);
      // A row that is not a date that could exist is skipped rather than shown.
      if (!kind || !isValidMonthDay(month, day) || typeof row.title !== "string") return [];
      return [{ id: String(row.id), title: row.title, kind, month, day, year: row.year === null || row.year === undefined ? null : Number(row.year) }];
    });
  } catch (err) {
    console.warn("important dates: could not read:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Whether a database error means the table has not been created yet. */
export function tableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "")));
}
