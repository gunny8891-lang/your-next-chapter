import Link from "next/link";
import { resendConfirmation } from "@/app/auth/actions";
import { Button } from "@/components/ui";
import { maskEmail } from "@/lib/auth/pendingEmail";
import styles from "@/components/AuthPage.module.css";

/**
 * What to do when the confirmation email has not come: it can take a few minutes, it may be in the spam or junk folder, and
 * it can be sent again. The address is shown masked, so the person can see which one it went to without it being read out.
 */
export function ResendConfirmation({ email }: { email: string | null }) {
  return (
    <div className={styles.help}>
      <p>
        {email ? <>We sent it to <strong>{maskEmail(email)}</strong>. </> : null}
        It can take a few minutes. Please look in your <strong>spam or junk folder</strong> too: it comes from Lark Hour, and
        the first message from a new sender is sometimes put there.
      </p>
      {email ? (
        <form action={resendConfirmation}>
          <Button type="submit" variant="secondary" fullWidth>
            Send it again
          </Button>
        </form>
      ) : (
        <p>
          If it still hasn&apos;t come, go back and sign up again with the same email address, and we&apos;ll send a new link.
          <Link href="/signup" className={styles.helpLink}>
            Sign up again
          </Link>
        </p>
      )}
    </div>
  );
}
