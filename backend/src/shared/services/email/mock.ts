import { EmailService, EmailMessage, EmailSendResult } from "./types";
import { renderEmail, recipientOf } from "./templates";

export class MockEmailService implements EmailService {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const rendered = renderEmail(message);
    const to = recipientOf(message);
    console.log(
      `[EMAIL-MOCK] kind=${message.kind} to=${to} subject="${rendered.subject}"`,
    );
    // Log payload too so QA can copy invite links etc.
    console.log(`[EMAIL-MOCK] payload=${JSON.stringify(message.payload)}`);
    return { sent: false };
  }
}
