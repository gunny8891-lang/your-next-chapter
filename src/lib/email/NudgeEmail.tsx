import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text, Button } from "@react-email/components";
import { T, CATEGORY_COLOR } from "@/lib/theme";

export type NudgeActivity = {
  title: string;
  category: string;
  address: string | null;
};

export function NudgeEmail({
  message,
  activity,
  siteUrl,
}: {
  message: string;
  activity: NudgeActivity;
  siteUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>{message}</Preview>
      <Body style={{ backgroundColor: T.bg, fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px" }}>
          <Text style={{ color: T.accent, fontSize: 13, fontWeight: 700, letterSpacing: 0.5, margin: "0 0 4px" }}>
            JUST FOR YOU
          </Text>
          <Heading style={{ fontFamily: "Georgia, serif", color: T.ink, fontSize: 22, margin: "0 0 18px" }}>
            A thought for today
          </Heading>

          <Text style={{ fontSize: 15.5, color: T.ink, lineHeight: 1.6, margin: "0 0 20px" }}>{message}</Text>

          <Section
            style={{
              background: T.surface,
              border: `1px solid ${T.line}`,
              borderRadius: 14,
              padding: "16px 18px",
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.3,
                color: CATEGORY_COLOR[activity.category] ?? T.primary,
                margin: "0 0 6px",
              }}
            >
              {activity.category.toUpperCase()}
            </Text>
            <Heading as="h3" style={{ fontFamily: "Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 6px" }}>
              {activity.title}
            </Heading>
            {activity.address && (
              <Text style={{ fontSize: 13.5, color: T.inkSoft, margin: 0 }}>{activity.address}</Text>
            )}
          </Section>

          <Button
            href={`${siteUrl}/chat`}
            style={{
              background: T.primary,
              color: "#fff",
              padding: "13px 24px",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-block",
              marginTop: 8,
            }}
          >
            Ask your concierge
          </Button>

          <Hr style={{ borderColor: T.line, margin: "28px 0 16px" }} />
          <Text style={{ fontSize: 12, color: T.inkSoft, margin: 0 }}>
            Your Next Chapter · You&apos;ll get at most one of these a week.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
