"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import { T } from "@/lib/theme";
import type { ChatMessageView } from "@/lib/types";

const SUGGESTIONS = ["What's on today?", "Find something nearby this afternoon", "What's planned this week?"];

export function ChatView({
  initialMessages,
  onSend,
}: {
  initialMessages: ChatMessageView[];
  onSend: (question: string) => Promise<{ error: string | null; reply?: string }>;
}) {
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const nextLocalId = useRef(0);
  const makeLocalId = () => `local-${nextLocalId.current++}`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    setError(null);
    setDraft("");
    const userMessage: ChatMessageView = { id: makeLocalId(), role: "user", content: trimmed };
    setMessages((m) => [...m, userMessage]);

    startTransition(async () => {
      const result = await onSend(trimmed);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.reply) {
        setMessages((m) => [...m, { id: makeLocalId(), role: "assistant", content: result.reply! }]);
      }
    });
  };

  return (
    <div style={{ minHeight: "100%", background: T.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ background: T.primary, padding: "18px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/week" style={{ color: "#EAE3D0", fontSize: 12.5, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            <ArrowLeft size={14} /> This Week
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MessageCircle size={15} color="#fff" />
            <span style={{ fontFamily: "Georgia, serif", fontSize: 16, color: "#fff" }}>Ask your concierge</span>
          </div>
          <span style={{ width: 74 }} />
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: 640, width: "100%", margin: "0 auto", padding: "20px 20px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <p style={{ color: T.inkSoft, fontSize: 14.5, marginBottom: 16 }}>
              Ask me what&apos;s on, or find something to do nearby.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.line}`,
                    borderRadius: 20,
                    padding: "8px 16px",
                    fontSize: 13.5,
                    color: T.ink,
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "80%",
                background: m.role === "user" ? T.primary : T.surface,
                color: m.role === "user" ? "#fff" : T.ink,
                border: m.role === "user" ? "none" : `1px solid ${T.line}`,
                borderRadius: 16,
                padding: "10px 14px",
                fontSize: 14.5,
                lineHeight: 1.45,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {isPending && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: "10px 14px", fontSize: 14.5, color: T.inkSoft }}>
              Thinking…
            </div>
          </div>
        )}

        {error && <p style={{ color: "#B0562F", fontSize: 12.5 }}>{error}</p>}

        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, background: T.surface, padding: "12px 20px" }}>
        <form
          style={{ maxWidth: 640, margin: "0 auto", display: "flex", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a question…"
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 12,
              border: `1px solid ${T.line}`,
              fontSize: 14.5,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={isPending || !draft.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              border: "none",
              background: T.accent,
              color: "#fff",
              cursor: isPending || !draft.trim() ? "default" : "pointer",
              opacity: isPending || !draft.trim() ? 0.6 : 1,
            }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
