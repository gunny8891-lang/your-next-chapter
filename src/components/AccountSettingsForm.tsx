"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { Button, Card, CheckboxField, ErrorNote, Field, Notice, Page, PageHeader, SectionTitle, SelectField, TextareaField } from "@/components/ui";
import { AdminLinks } from "@/components/AdminLinks";
import { logout } from "@/app/auth/actions";
import { LOCATION_HINT_ACCOUNT, LOCATION_LABEL, LOCATION_PLACEHOLDER } from "@/lib/geo/locationCopy";
import { BUDGET_CHOICES } from "@/lib/onboarding/choices";
import styles from "@/components/Account.module.css";

type Profile = {
  location_text: string | null;
  travel_radius_km: number | null;
  budget_band: string | null;
  dietary_preferences: string | null;
  mobility_notes: string | null;
  drives: boolean | null;
  uses_public_transport: boolean | null;
  interests: string[];
  goals: string[];
};

type Subscription = { plan: string; status: string; renewal_date: string | null } | null;

/** The same four answers as onboarding, so "how far" means the same thing everywhere. Stored as kilometres. */
const RADIUS_OPTIONS = [
  { km: 1, label: "Walking distance only" },
  { km: 5, label: "Up to 3 miles" },
  { km: 16, label: "Up to 10 miles" },
  { km: 40, label: "I'm happy to travel further" },
];

/** A distance that is not one of the offered ones (set another way) shown in miles, as everything else here is. */
export function unofferedRadiusLabel(km: number | null): string {
  if (km === null) return "Not set";
  const miles = Math.max(1, Math.round(km / 1.609));
  return `About ${miles} ${miles === 1 ? "mile" : "miles"}`;
}

/** The same wording and values as the set-up question, so the two cannot drift apart. */
const BUDGET_OPTIONS = BUDGET_CHOICES.map((c) => ({ value: c.band, label: c.label }));

/** The reasons onboarding offers, stored as tags. Any other tag already on a profile is kept as it is. */
const GOAL_OPTIONS = [
  { tag: "meet_people", label: "Meeting new people" },
  { tag: "fitness", label: "Staying active" },
  { tag: "learn_something_new", label: "Learning something new" },
  { tag: "give_back", label: "Giving back locally" },
];

export function AccountSettingsForm({
  email,
  firstName,
  profile,
  subscription,
  isAdmin,
  saved,
  planRebuilt,
  planError,
  deleteError,
  onSave,
  onDeleteAccount,
  onClearLearning,
  emailPrefs,
  onSaveEmailPrefs,
  calendar,
  calendarNotice,
  onDisconnectCalendar,
}: {
  email: string;
  firstName: string;
  profile: Profile;
  subscription: Subscription;
  isAdmin: boolean;
  saved: boolean;
  /** True when saving also built a fresh plan for the week (only when something that shapes it changed). */
  planRebuilt?: boolean;
  planError?: string;
  deleteError?: string;
  onSave: (formData: FormData) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onClearLearning: () => Promise<{ error: string | null }>;
  emailPrefs: { weeklyPlan: boolean; reminders: boolean };
  onSaveEmailPrefs: (prefs: { weeklyPlan: boolean; reminders: boolean }) => Promise<{ error: string | null }>;
  /** Null when Google Calendar is not switched on: the section then does not appear. */
  calendar: { connected: boolean } | null;
  calendarNotice?: string;
  onDisconnectCalendar: () => Promise<{ error: string | null }>;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [goals, setGoals] = useState<string[]>(profile.goals);
  const [clearStep, setClearStep] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [clearError, setClearError] = useState<string | null>(null);
  const [weeklyPlanEmail, setWeeklyPlanEmail] = useState(emailPrefs.weeklyPlan);
  const [remindersEmail, setRemindersEmail] = useState(emailPrefs.reminders);
  const [emailStep, setEmailStep] = useState<"idle" | "busy" | "saved">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  const saveEmailPrefs = async () => {
    setEmailStep("busy");
    setEmailError(null);
    const res = await onSaveEmailPrefs({ weeklyPlan: weeklyPlanEmail, reminders: remindersEmail });
    if (res.error) {
      setEmailError(res.error);
      setEmailStep("idle");
    } else setEmailStep("saved");
  };

  const [calendarConnected, setCalendarConnected] = useState(calendar?.connected ?? false);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const disconnectCalendar = async () => {
    setCalendarBusy(true);
    setCalendarError(null);
    const res = await onDisconnectCalendar();
    if (res.error) setCalendarError(res.error);
    else setCalendarConnected(false);
    setCalendarBusy(false);
  };

  const clearLearning = async () => {
    setClearStep("busy");
    setClearError(null);
    const res = await onClearLearning();
    if (res.error) {
      setClearError(res.error);
      setClearStep("confirm");
    } else setClearStep("done");
  };

  const radiusKm = profile.travel_radius_km;
  const radiusIsOffered = radiusKm === null || RADIUS_OPTIONS.some((o) => o.km === radiusKm);

  const toggleGoal = (tag: string, on: boolean) => setGoals((current) => (on ? [...new Set([...current, tag])] : current.filter((t) => t !== tag)));

  return (
    <Page>
      <PageHeader title="Account" lead="Your details, and how we choose things for you." />

      {saved && !planError && (
        <div className={styles.notice}>
          <Notice>{planRebuilt ? "Your details are saved and we've built a fresh plan for this week. Outings you'd already said yes to are still there." : "Your details are saved."}</Notice>
        </div>
      )}
      {saved && planError && (
        <div className={styles.notice}>
          <Notice tone="info">
            Your details are saved, but we couldn&apos;t refresh this week&apos;s plan just now. You can try again from My week, and next week&apos;s plan will be made for you on Sunday.
          </Notice>
        </div>
      )}

      <form action={onSave} className={styles.form}>
        <Card padding="lg">
          <fieldset className={styles.group}>
            <legend className={styles.legend}>About you</legend>
            <Field label="Email" name="email_display" value={email} disabled readOnly hint="This is how you log in." />
            <Field label="First name" name="first_name" defaultValue={firstName} autoComplete="given-name" maxLength={40} hint="So we can say hello." />
          </fieldset>
        </Card>

        <Card padding="lg">
          <fieldset className={styles.group}>
            <legend className={styles.legend}>Where and how far</legend>
            <Field
              label={LOCATION_LABEL}
              name="location_text"
              defaultValue={profile.location_text ?? ""}
              placeholder={LOCATION_PLACEHOLDER}
              hint={LOCATION_HINT_ACCOUNT}
              autoComplete="address-level2"
            />
            <SelectField label="How far are you happy to go?" name="travel_radius_km" defaultValue={radiusKm ?? ""}>
              {radiusKm === null && <option value="">Not set</option>}
              {RADIUS_OPTIONS.map((o) => (
                <option key={o.km} value={o.km}>
                  {o.label}
                </option>
              ))}
              {!radiusIsOffered && <option value={radiusKm ?? ""}>{unofferedRadiusLabel(radiusKm)}</option>}
            </SelectField>
            <fieldset className={styles.checks}>
              <legend className={styles.checksLegend}>How you usually get about</legend>
              <CheckboxField name="drives" label="I drive" defaultChecked={profile.drives === true} />
              <CheckboxField name="uses_public_transport" label="I use buses or trains" defaultChecked={profile.uses_public_transport === true} />
              <p className={styles.hint}>This helps us work out how long it will take you to get somewhere.</p>
            </fieldset>
            <TextareaField
              label="Anything we should know about getting around?"
              name="mobility_notes"
              defaultValue={profile.mobility_notes ?? ""}
              placeholder="e.g. I prefer level ground, no long walks"
            />
          </fieldset>
        </Card>

        <Card padding="lg">
          <fieldset className={styles.group}>
            <legend className={styles.legend}>What you like</legend>
            <Field
              label="Things you enjoy"
              name="interests"
              defaultValue={profile.interests.join(", ")}
              placeholder="e.g. gardening, history, walking, grandchildren"
              hint="Separate with commas."
            />
            <fieldset className={styles.checks}>
              <legend className={styles.checksLegend}>What would make this next chapter feel worthwhile?</legend>
              {GOAL_OPTIONS.map((g) => (
                <CheckboxField key={g.tag} label={g.label} checked={goals.includes(g.tag)} onChange={(e) => toggleGoal(g.tag, e.target.checked)} />
              ))}
              {/* What is saved: the ticked reasons, and any other tag already on the profile (it stays in the list). */}
              <input type="hidden" name="goals" value={goals.join(", ")} />
            </fieldset>
            <SelectField label="What usually feels comfortable to spend?" name="budget_band" defaultValue={profile.budget_band ?? ""}>
              <option value="">Not set</option>
              {BUDGET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectField>
            <Field
              label="Food preferences"
              name="dietary_preferences"
              defaultValue={profile.dietary_preferences ?? ""}
              placeholder="e.g. vegetarian, no shellfish"
            />
          </fieldset>
        </Card>

        <Button type="submit" fullWidth>
          Save changes
        </Button>
      </form>

      <section aria-labelledby="plan" className={styles.section}>
        <SectionTitle id="plan">Your plan</SectionTitle>
        <p className={styles.plain}>
          {subscription
            ? `${subscription.plan} plan, ${subscription.status}${subscription.renewal_date ? `, renews ${subscription.renewal_date}` : ""}.`
            : "Lark Hour is free while we're testing it."}
        </p>
      </section>

      <section aria-labelledby="learned" className={styles.section}>
        <SectionTitle id="learned">What we&apos;ve learned about you</SectionTitle>
        <p className={styles.plain}>
          To choose well for you, we note which ideas you open, save and plan, how they went when you tell us, and how you say you feel each day. How you feel on a given day is only used that day, and is
          deleted after a week. None of it is shared or used for advertising. You can clear it all whenever you like.
        </p>
        {clearError && <ErrorNote>{clearError}</ErrorNote>}
        {clearStep === "done" && <Notice>Cleared. We&apos;ll start learning afresh from here.</Notice>}
        {clearStep === "idle" || clearStep === "done" ? (
          <Button variant="secondary" onClick={() => setClearStep("confirm")}>
            Clear what we&apos;ve learned
          </Button>
        ) : (
          <div className={`${styles.deleteForm} ync-appear`} role="group" aria-label="Confirm clearing what we have learned">
            <p className={styles.plain}>Your suggestions will be less personal for a while. Your plans, saved ideas, goals and people are not affected.</p>
            <div className={styles.deleteButtons}>
              <Button loading={clearStep === "busy"} onClick={clearLearning}>
                Yes, clear it
              </Button>
              <Button variant="quiet" onClick={() => setClearStep("idle")}>
                Keep it
              </Button>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="emails-title" id="emails" className={styles.section}>
        <SectionTitle id="emails-title">Emails</SectionTitle>
        <p className={styles.plain}>Choose which emails you would like. Emails about your account, such as confirming your address or resetting a password, always arrive.</p>
        {emailError && <ErrorNote>{emailError}</ErrorNote>}
        {emailStep === "saved" && <Notice>Saved.</Notice>}
        <div className={styles.checks}>
          <CheckboxField
            label="My weekly plan, on Sunday evening"
            checked={weeklyPlanEmail}
            onChange={(e) => {
              setWeeklyPlanEmail(e.target.checked);
              setEmailStep("idle");
            }}
          />
          <CheckboxField
            label="The occasional reminder, at most once a week"
            checked={remindersEmail}
            onChange={(e) => {
              setRemindersEmail(e.target.checked);
              setEmailStep("idle");
            }}
          />
        </div>
        <Button variant="secondary" loading={emailStep === "busy"} onClick={saveEmailPrefs}>
          Save email choices
        </Button>
      </section>

      {calendar && (
        <section aria-labelledby="calendar-title" id="calendar" className={styles.section}>
          <SectionTitle id="calendar-title">Google Calendar</SectionTitle>
          {calendarNotice === "connected" && <Notice>Connected. You can now add outings to your calendar from My Week.</Notice>}
          {calendarNotice === "declined" && <Notice tone="info">No problem: nothing was connected.</Notice>}
          {(calendarNotice === "error" || calendarNotice === "unavailable") && <ErrorNote>We couldn&apos;t connect your calendar just now. Please try again.</ErrorNote>}
          {calendarError && <ErrorNote>{calendarError}</ErrorNote>}
          <p className={styles.plain}>
            Add your planned outings to Google Calendar. We make a separate calendar called &ldquo;Lark Hour&rdquo; and can only add to and change that one. We can&apos;t see anything else in your
            calendar.
          </p>
          {calendarConnected ? (
            <>
              <p className={styles.plain}>
                <CalendarCheck size={18} aria-hidden="true" style={{ verticalAlign: "-3px", marginRight: 6 }} />
                Connected.
              </p>
              <Button variant="secondary" loading={calendarBusy} onClick={disconnectCalendar}>
                Disconnect
              </Button>
              <p className={styles.plain}>The calendar and the outings already in it stay in your Google account, and you can delete them there.</p>
            </>
          ) : (
            <Button href="/api/calendar/connect" prefetch={false} variant="secondary">
              Connect Google Calendar
            </Button>
          )}
        </section>
      )}

      <section aria-labelledby="feedback" className={styles.section}>
        <SectionTitle id="feedback">Tell us what you think</SectionTitle>
        <p className={styles.plain}>
          Lark Hour is new, and what you tell us shapes it. If something is confusing, broken or missing, or an idea was a good one, write to{" "}
          <a href="mailto:hello@larkhour.com?subject=Lark%20Hour%20feedback" className={styles.textLink}>
            hello@larkhour.com
          </a>
          . A real person reads every message.
        </p>
      </section>

      <section aria-labelledby="legal" className={styles.section}>
        <SectionTitle id="legal">Privacy and terms</SectionTitle>
        <p className={styles.plain}>
          Read our <Link href="/privacy" className={styles.textLink}>privacy notice</Link> for what we keep and why, and our <Link href="/terms" className={styles.textLink}>terms of use</Link>.
        </p>
      </section>

      <form action={logout} className={styles.section}>
        <Button type="submit" variant="secondary" fullWidth>
          Log out
        </Button>
      </form>

      {isAdmin && <AdminLinks />}

      <section aria-labelledby="delete" className={`${styles.section} ${styles.danger}`}>
        <SectionTitle id="delete">Delete my account</SectionTitle>
        <p className={styles.plain}>
          This permanently deletes your account and everything with it: your details, your plans and what we have learned about what you like. It can&apos;t be undone.
        </p>

        {deleteError && <ErrorNote>{deleteError}</ErrorNote>}

        {!showDeleteConfirm ? (
          <Button variant="secondary" onClick={() => setShowDeleteConfirm(true)}>
            Delete my account and data
          </Button>
        ) : (
          <form action={onDeleteAccount} className={`${styles.deleteForm} ync-appear`}>
            <Field
              label="Type DELETE to confirm"
              name="confirm_delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
            />
            <div className={styles.deleteButtons}>
              <Button type="submit" variant="danger" disabled={confirmText !== "DELETE"}>
                Permanently delete
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setConfirmText("");
                }}
              >
                Keep my account
              </Button>
            </div>
          </form>
        )}
      </section>
    </Page>
  );
}
