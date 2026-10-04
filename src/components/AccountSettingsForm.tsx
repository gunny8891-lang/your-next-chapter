"use client";

import { useState } from "react";
import { Button, Card, CheckboxField, ErrorNote, Field, Notice, Page, PageHeader, SectionTitle, SelectField, TextareaField } from "@/components/ui";
import { AdminLinks } from "@/components/AdminLinks";
import { logout } from "@/app/auth/actions";
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

const BUDGET_OPTIONS = [
  { value: "low", label: "Keep costs low" },
  { value: "medium", label: "A moderate budget" },
  { value: "high", label: "Happy to spend more" },
];

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
  planError,
  deleteError,
  onSave,
  onDeleteAccount,
}: {
  email: string;
  firstName: string;
  profile: Profile;
  subscription: Subscription;
  isAdmin: boolean;
  saved: boolean;
  planError?: string;
  deleteError?: string;
  onSave: (formData: FormData) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [goals, setGoals] = useState<string[]>(profile.goals);

  const radiusKm = profile.travel_radius_km;
  const radiusIsOffered = radiusKm === null || RADIUS_OPTIONS.some((o) => o.km === radiusKm);

  const toggleGoal = (tag: string, on: boolean) => setGoals((current) => (on ? [...new Set([...current, tag])] : current.filter((t) => t !== tag)));

  return (
    <Page>
      <PageHeader title="Account" lead="Your details, and how we choose things for you." />

      {saved && !planError && (
        <div className={styles.notice}>
          <Notice>Your details are saved and this week has been refreshed to match.</Notice>
        </div>
      )}
      {saved && planError && (
        <div className={styles.notice}>
          <Notice tone="info">
            Your details are saved, but we couldn&apos;t refresh this week&apos;s plan just now ({planError}). It will refresh by itself next Sunday.
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
              label="Where should we look?"
              name="location_text"
              defaultValue={profile.location_text ?? ""}
              placeholder="e.g. Bath, Somerset"
              hint="Changing this changes where your ideas are chosen from."
            />
            <SelectField label="How far are you happy to go?" name="travel_radius_km" defaultValue={radiusKm ?? ""}>
              {radiusKm === null && <option value="">Not set</option>}
              {RADIUS_OPTIONS.map((o) => (
                <option key={o.km} value={o.km}>
                  {o.label}
                </option>
              ))}
              {!radiusIsOffered && <option value={radiusKm ?? ""}>About {radiusKm} km</option>}
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
            <SelectField label="Budget" name="budget_band" defaultValue={profile.budget_band ?? ""}>
              <option value="">No preference</option>
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
            : "You haven't subscribed."}
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
