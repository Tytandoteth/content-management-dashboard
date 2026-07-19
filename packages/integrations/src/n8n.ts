import type { DomainEvent } from "@cmd/contracts";

/**
 * Helper for the control plane to push drained OutboxEvents to n8n webhooks.
 *
 * The control plane is the emitter; n8n is the first consumer. Each event type
 * maps to an n8n webhook path; n8n workflows decide what to do (e.g. on
 * `content.approved`, call the Postiz API to schedule the post).
 */
export interface N8nDispatcherOptions {
  /** Base URL of n8n webhooks, e.g. https://flows.your-domain.com/webhook */
  webhookBaseUrl: string;
  /** Shared secret sent as a header so n8n can verify the caller. */
  signingToken?: string;
  fetchImpl?: typeof fetch;
}

export class N8nDispatcher {
  private readonly webhookBaseUrl: string;
  private readonly signingToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: N8nDispatcherOptions) {
    this.webhookBaseUrl = options.webhookBaseUrl.replace(/\/$/, "");
    this.signingToken = options.signingToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Map an event type to its n8n webhook path (kebab of the dotted type). */
  pathFor(eventType: string): string {
    return `/${eventType.replace(/\./g, "-")}`;
  }

  /** Deliver one event. Throws on non-2xx so the outbox can retry. */
  async dispatch(event: DomainEvent): Promise<void> {
    const res = await this.fetchImpl(
      `${this.webhookBaseUrl}${this.pathFor(event.type)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.signingToken
            ? { "x-cmd-signature": this.signingToken }
            : {}),
        },
        body: JSON.stringify(event),
      },
    );
    if (!res.ok) {
      throw new Error(`n8n webhook ${event.type} failed: ${res.status}`);
    }
  }
}
