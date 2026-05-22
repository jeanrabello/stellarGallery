import {
  SESClient,
  SendEmailCommand,
  type SESClientConfig,
} from "@aws-sdk/client-ses";
import { EmailService, EmailMessage, EmailSendResult } from "./types";
import { renderEmail, recipientOf } from "./templates";

export interface SesEmailServiceConfig {
  region: string;
  from: string;
  /** When set, points the client at LocalStack (or any custom endpoint). */
  endpoint?: string;
  /** Static credentials (LocalStack uses any non-empty pair). Production
   * usually relies on the default provider chain (IAM role, env, etc.). */
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class SesEmailService implements EmailService {
  private readonly client: SESClient;
  private readonly from: string;

  constructor(config: SesEmailServiceConfig) {
    const clientConfig: SESClientConfig = { region: config.region };
    if (config.endpoint) clientConfig.endpoint = config.endpoint;
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }
    this.client = new SESClient(clientConfig);
    this.from = config.from;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const rendered = renderEmail(message);
    const to = recipientOf(message);

    const out = await this.client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: rendered.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: rendered.html, Charset: "UTF-8" },
            Text: { Data: rendered.text, Charset: "UTF-8" },
          },
        },
      }),
    );

    return { sent: true, providerMessageId: out.MessageId };
  }
}
