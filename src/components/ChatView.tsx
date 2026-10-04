"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SendHorizontal } from "lucide-react";
import { Chip, ErrorNote } from "@/components/ui";
import type { ChatMessageView } from "@/lib/types";
import styles from "@/components/Chat.module.css";

const SUGGESTIONS = ["What's on today?", "Find something nearby this afternoon", "What's planned this week?"];

/**
 * The concierge: a quiet conversation. Replies sit on the page as plain text from
 * the concierge; what the member says is set apart in green. No avatars, no
 * "assistant" framing: it reads as a person you can ask.
 */
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
    // CSS cannot switch off a script's smooth scrolling, so ask the browser whether to animate.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
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
    <div className={styles.page}>
      <div className={styles.thread}>
        <header className={styles.header}>
          <h1 className={styles.title}>Concierge</h1>
          <p className={styles.lead}>Ask what&apos;s on, or for something to do nearby.</p>
        </header>

        {messages.length === 0 && (
          <div className={styles.suggestions} role="group" aria-label="Things you could ask">
            {SUGGESTIONS.map((s) => (
              <Chip key={s} selected={false} onClick={() => submit(s)}>
                {s}
              </Chip>
            ))}
          </div>
        )}

        <ol className={styles.messages} aria-label="Conversation">
          {messages.map((m) => (
            <li key={m.id} className={m.role === "user" ? styles.mine : styles.theirs}>
              <span className="sr-only">{m.role === "user" ? "You: " : "Concierge: "}</span>
              {m.content}
            </li>
          ))}
        </ol>

        <div aria-live="polite">
          {isPending && <p className={styles.waiting}>One moment…</p>}
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>

        <div ref={bottomRef} />
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <div className={styles.composerInner}>
          <label htmlFor="ask" className="sr-only">
            Your message
          </label>
          <input
            id="ask"
            className={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask anything…"
            autoComplete="off"
          />
          <button type="submit" className={styles.send} disabled={isPending || !draft.trim()} aria-label="Send">
            <SendHorizontal size={22} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
