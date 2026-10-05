import { confirmUnsubscribeAction } from "@/app/unsubscribe/actions";
import { AuthLink, AuthLinks, AuthPage } from "@/components/AuthPage";
import { Button, ErrorNote } from "@/components/ui";
import { KIND_LABEL } from "@/lib/email/unsubscribe";
import { readUnsubscribeLink } from "@/lib/email/unsubscribeApply";

export const metadata = { title: "Stop these emails" };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string; failed?: string }> }) {
  const { token, done, failed } = await searchParams;
  const link = readUnsubscribeLink(token);

  if (!link) {
    return (
      <AuthPage title="That link isn't valid" lead="It may be incomplete. You can change which emails you get any time in Account.">
        <AuthLinks>
          <AuthLink href="/account#emails">Go to email settings</AuthLink>
        </AuthLinks>
      </AuthPage>
    );
  }

  const { name } = KIND_LABEL[link.kind];

  if (done) {
    return (
      <AuthPage title="You've been unsubscribed" lead={`We won't send you ${name} any more. Changed your mind? You can turn them back on any time in Account.`}>
        <AuthLinks>
          <AuthLink href="/account#emails">Email settings</AuthLink>
          <AuthLink href="/">Back to the start</AuthLink>
        </AuthLinks>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Stop these emails?" lead={`You'll no longer get ${name}. Everything else carries on as before, and the app itself is not affected.`}>
      <form action={confirmUnsubscribeAction}>
        {failed && <ErrorNote>We couldn&apos;t do that just now. Please try again.</ErrorNote>}
        <input type="hidden" name="token" value={token} />
        <Button type="submit" fullWidth>
          Yes, stop these emails
        </Button>
      </form>
      <AuthLinks>
        <AuthLink href="/">No, keep them</AuthLink>
      </AuthLinks>
    </AuthPage>
  );
}
