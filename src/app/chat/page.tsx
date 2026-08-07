import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ChatView } from "@/components/ChatView";
import { sendChatMessageAction } from "@/app/chat/actions";
import type { ChatMessageView } from "@/lib/types";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_text")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const { data: history } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("member_id", user.id)
    .order("created_at", { ascending: true })
    .limit(50);

  const messages: ChatMessageView[] = (history ?? []).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  return <ChatView initialMessages={messages} onSend={sendChatMessageAction} />;
}
