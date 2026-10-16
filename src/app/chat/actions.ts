"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { conciergeReply, type ChatHistoryMessage } from "@/lib/chat/agent";
import type { ToolAction } from "@/lib/chat/calendarTools";
import { chatMessage, classifyAiFailure } from "@/lib/ai/unavailable";
import { alreadyOfferedSupport, assessCare, supportFooter, urgentReply } from "@/lib/chat/care";

export async function sendChatMessageAction(
  question: string
): Promise<{ error: string | null; reply?: string; actions?: ToolAction[] }> {
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

  const history = (historyRows ?? []) as ChatHistoryMessage[];
  const care = assessCare(trimmed);
  // Someone who has said they want to die or harm themselves is not answered by the model, nor made to wait for it.
  // Someone bereaved, lonely or low is answered with care, and told once (not on every message) who can listen.
  const note = care.level === "support" && !alreadyOfferedSupport(history) ? `\n\n${supportFooter(care.topics)}` : "";

  let reply: string;
  let actions: ToolAction[] = [];
  if (care.level === "urgent") {
    reply = urgentReply();
  } else {
    try {
      const answered = await conciergeReply(supabase, user.id, trimmed, history, care);
      reply = answered.reply + note;
      actions = answered.actions;
    } catch (err) {
      // The member gets a kind sentence for what happened; the real reason is in the usage log and the server log.
      // If they had just shared something painful, the numbers still go with it.
      reply = chatMessage(classifyAiFailure(err)) + note;
    }
  }

  await supabase.from("chat_messages").insert({ member_id: user.id, role: "assistant", content: reply });

  // Something put in their plan or calendar: the screens that show it are fresh the next time they look.
  if (actions.length > 0) {
    revalidatePath("/week");
    revalidatePath("/today");
  }

  return { error: null, reply, actions };
}
