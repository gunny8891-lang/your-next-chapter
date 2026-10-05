import { Hr, Text } from "@react-email/components";
import { T } from "@/lib/theme";
import type { EmailFooter } from "@/lib/email/footer";

const small = { fontSize: 12, color: T.inkSoft, lineHeight: 1.6, margin: "0 0 6px" } as const;
const link = { color: T.inkSoft, textDecoration: "underline" } as const;

/** The bottom of a plan or reminder email: why it came, how to stop it, who sent it. Plain, readable and never hidden. */
export function EmailFooterBlock({ footer }: { footer: EmailFooter }) {
  return (
    <>
      <Hr style={{ borderColor: T.line, margin: "28px 0 16px" }} />
      <Text style={small}>{footer.reason}</Text>
      <Text style={small}>
        {footer.unsubscribeUrl && (
          <>
            <a href={footer.unsubscribeUrl} style={link}>
              Stop these emails
            </a>
            {" · "}
          </>
        )}
        <a href={footer.preferencesUrl} style={link}>
          Email settings
        </a>
        {" · "}
        <a href={footer.privacyUrl} style={link}>
          Privacy notice
        </a>
      </Text>
      <Text style={small}>Lark Hour{footer.senderLine ? ` · ${footer.senderLine}` : ""}</Text>
    </>
  );
}
