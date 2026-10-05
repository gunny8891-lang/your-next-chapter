/**
 * Who is behind the service, as the privacy notice and terms state it.
 *
 * These are the facts only the business can supply. Until every one is filled in the
 * pages say so plainly, in a "draft" banner, rather than showing invented details or
 * silently leaving a gap. Fill them in here (and nowhere else) once the company, its
 * address and its contact mailbox exist, then have the wording reviewed by a solicitor.
 */
export const OPERATOR = {
  /** Registered company name, e.g. "Your Next Chapter Ltd". */
  companyName: null as string | null,
  /** Companies House number. */
  companyNumber: null as string | null,
  /** Registered office address, on one line. */
  address: null as string | null,
  /** The mailbox that privacy requests and questions go to. */
  contactEmail: null as string | null,
  /** The ICO registration number (the data protection fee), if the company is required to pay it. */
  icoNumber: null as string | null,
};

/** When the wording of both pages was last changed. Update it with the text. */
export const LEGAL_LAST_UPDATED = "5 October 2026";

export type OperatorField = keyof typeof OPERATOR;

/** The details still to be supplied. Empty once the pages can drop their draft banner. */
export function missingOperatorDetails(operator: Record<OperatorField, string | null> = OPERATOR): OperatorField[] {
  return (Object.keys(operator) as OperatorField[]).filter((key) => !operator[key]);
}

export const OPERATOR_FIELD_LABELS: Record<OperatorField, string> = {
  companyName: "company name",
  companyNumber: "company number",
  address: "registered address",
  contactEmail: "contact email",
  icoNumber: "ICO registration number",
};
