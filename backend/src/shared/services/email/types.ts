// Catalog of transactional emails. Add a new entry here when introducing
// welcome/password-reset/etc. and the provider only needs to render the new
// kind.
export type EmailKind = "group-invite";

export interface GroupInvitePayload {
  to: string;
  groupName: string;
  inviterName: string;
  inviteLink: string;
  joinCode: string;
}

export type EmailMessage = {
  kind: "group-invite";
  payload: GroupInvitePayload;
};

export interface EmailService {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface EmailSendResult {
  // false when the provider intentionally skipped (e.g. mock in dev). The
  // caller can decide to still surface the invite link in the API response.
  sent: boolean;
  providerMessageId?: string;
}
