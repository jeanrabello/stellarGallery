import config from "@config/api";
import { EmailService } from "./types";
import { MockEmailService } from "./mock";
import { SesEmailService } from "./ses";

let instance: EmailService | null = null;

export const getEmailService = (): EmailService => {
  if (instance) return instance;
  const { enabled, region, endpoint, from, accessKeyId, secretAccessKey } =
    config.email;
  if (enabled && from && region) {
    instance = new SesEmailService({
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
      from,
    });
  } else {
    instance = new MockEmailService();
  }
  return instance;
};

export * from "./types";
