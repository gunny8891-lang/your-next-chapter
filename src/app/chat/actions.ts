"use server";

import { createClient } from "@/utils/supabase/server";
import { answerChatQuestion, type ChatHistoryMessage } from "@/lib/chat/agent";

export async function sendChatMessageAction(
  question: string
): Promise<{ error: string | null; reply?: string }> {
  const trimmed = question.trim();
  if (!trimmed) return { error: "Message is empty" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: historyRows } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("member_id", user.id)
    .order("created_at", { ascending: true })
    .limit(20);

  const { error: insertUserError } = await supabase
    .from("chat_messages")
    .insert({ member_id: user.id, role: "user", content: trimmed });
  if (insertUserError) return { error: insertUserError.message };

  let reply: string;
  try {
    reply = await answerChatQuestion(supabase, user.id, trimmed, (historyRows ?? []) as ChatHistoryMessage[]);
  } catch {
    reply = "Sorry, I'm having trouble answering right now — please try again in a moment.";
  }

  await supabase.from("chat_messages").insert({ member_id: user.id, role: "assistant", content: reply });

  return { error: null, reply };
}
