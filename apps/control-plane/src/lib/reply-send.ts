import type { CommentReply } from "@cmd/db";

/**
 * Pluggable "send a reply" adapter. v1 (the only supported mode) is manual
 * copy-to-clipboard — there's no comment-reply API in use, so replies are
 * always handed back for one-click manual posting.
 */

export interface SendResult {
  /** Whether the reply was dispatched programmatically (vs. handed back to copy). */
  sent: boolean;
  via: "manual_copy";
  /** Text to copy/post manually. */
  text?: string;
  message?: string;
}

export async function sendReply(reply: Pick<CommentReply, "platform" | "draftReply" | "externalId">): Promise<SendResult> {
  return { sent: false, via: "manual_copy", text: reply.draftReply };
}
