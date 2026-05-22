import config from "@config/api";
import { EmailService } from "./types";
import { MockEmailService } from "./mock";
import { ResendEmailService } from "./resend";

let instance: EmailService | null = null;

export const getEmailService = (): EmailService => {
  if (instance) return instance;
  const { apiKey, from, enabled } = config.email;
  if (enabled && apiKey) {
    instance = new ResendEmailService(apiKey, from);
  } else {
    instance = new MockEmailService();
  }
  return instance;
};

export * from "./types";
