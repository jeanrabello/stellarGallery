import { EmailService, EmailMessage, EmailSendResult } from "./types";
import { renderEmail, recipientOf } from "./templates";

export class ResendEmailService implements EmailService {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const rendered = renderEmail(message);
    const to = recipientOf(message);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Resend failed (${res.status}): ${detail || res.statusText}`,
      );
    }

    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, providerMessageId: body?.id };
  }
}
