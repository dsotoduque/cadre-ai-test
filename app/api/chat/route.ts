import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendMessage, ConversationNotFoundError } from "@/modules/chat/application/send-message";

const requestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await sendMessage(parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof ConversationNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("POST /api/chat failed:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
