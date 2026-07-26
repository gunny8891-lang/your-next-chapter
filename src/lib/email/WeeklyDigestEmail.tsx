import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text, Button } from "@react-email/components";
import { T, CATEGORY_COLOR } from "@/lib/theme";

export type DigestItem = {
  day: string;
  title: string;
  category: string;
  time: string;
  location: string;
  cost: string;
  why: string;
};

export type DigestSurprise = {
  title: string;
  location: string;
  cost: string;
  why: string;
} | null;

export function WeeklyDigestEmail({
  locationLabel,
  items,
  surprise,
  siteUrl,
}: {
  locationLabel: string;
  items: DigestItem[];
  surprise: DigestSurprise;
  siteUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Your Perfect Week is ready</Preview>
      <Body style={{ backgroundColor: T.bg, fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px" }}>
          <Text style={{ color: T.accent, fontSize: 13, fontWeight: 700, letterSpacing: 0.5, margin: "0 0 4px" }}>
            YOUR PERFECT WEEK
          </Text>
          <Heading style={{ fontFamily: "Georgia, serif", color: T.ink, fontSize: 26, margin: "0 0 24px" }}>
            {locationLabel}
          </Heading>

          {items.map((item) => (
            <Section
              key={`${item.day}-${item.title}`}
              style={{
                background: T.surface,
                border: `1px solid ${T.line}`,
                borderRadius: 14,
                padding: "16px 18px",
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  color: CATEGORY_COLOR[item.category] ?? T.primary,
                  margin: "0 0 6px",
                }}
              >
                {item.day.toUpperCase()} · {item.category.toUpperCase()}
              </Text>
              <Heading as="h3" style={{ fontFamily: "Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 6px" }}>
                {item.title}
              </Heading>
              <Text style={{ fontSize: 13.5, color: T.inkSoft, margin: "0 0 8px" }}>
                {item.time} · {item.location} · {item.cost}
              </Text>
              <Text style={{ fontSize: 13.5, color: T.ink, margin: 0, lineHeight: 1.5 }}>{item.why}</Text>
            </Section>
          ))}

          {surprise && (
            <Section
              style={{
                background: T.accentSoft,
                border: `1.5px solid ${T.accent}`,
                borderRadius: 14,
                padding: "16px 18px",
                marginBottom: 20,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: T.accent, margin: "0 0 6px" }}>
                SURPRISE ME — THIS WEEK
              </Text>
              <Heading as="h3" style={{ fontFamily: "Georgia, serif", fontSize: 17, color: T.ink, margin: "0 0 6px" }}>
                {surprise.title}
              </Heading>
              <Text style={{ fontSize: 13.5, color: T.inkSoft, margin: 0 }}>
                {surprise.location} · {surprise.cost}
              </Text>
            </Section>
          )}

          <Button
            href={`${siteUrl}/week`}
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
            Open your week
          </Button>

          <Hr style={{ borderColor: T.line, margin: "28px 0 16px" }} />
          <Text style={{ fontSize: 12, color: T.inkSoft, margin: 0 }}>
            Your Next Chapter · Manage your preferences anytime in Account settings.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
