import { EmailMessage, GroupInvitePayload } from "./types";

const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const groupInvite = (p: GroupInvitePayload) => {
  const subject = `${p.inviterName} te convidou para o grupo "${p.groupName}" no Stellar Gallery`;
  const text = [
    `Olá!`,
    ``,
    `${p.inviterName} convidou você para entrar no grupo "${p.groupName}" no Stellar Gallery.`,
    ``,
    `Aceite o convite abrindo este link:`,
    p.inviteLink,
    ``,
    `Ou entre manualmente com o código: ${p.joinCode}`,
    ``,
    `Se você não esperava este convite, pode ignorar este e-mail.`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #2b1d3a;">
      <h2 style="margin: 0 0 12px;">Você foi convidado(a) ✨</h2>
      <p style="margin: 0 0 12px;">
        <strong>${escape(p.inviterName)}</strong> te convidou para o grupo
        <strong>${escape(p.groupName)}</strong> no Stellar Gallery.
      </p>
      <p style="margin: 0 0 20px;">
        <a href="${escape(p.inviteLink)}"
           style="display: inline-block; background: hsl(286 55% 62%); color: #fff; padding: 10px 18px; border-radius: 12px; text-decoration: none; font-weight: 600;">
          Aceitar convite
        </a>
      </p>
      <p style="margin: 0 0 8px; font-size: 14px;">
        Ou cole o código abaixo na tela de "Entrar com código":
      </p>
      <p style="margin: 0 0 24px;">
        <code style="background: #fff7d6; padding: 6px 10px; border-radius: 6px; font-size: 16px;">${escape(p.joinCode)}</code>
      </p>
      <p style="margin: 0; font-size: 12px; color: #7a6a8a;">
        Não esperava este convite? Pode ignorar este e-mail.
      </p>
    </div>
  `.trim();

  return { subject, text, html };
};

export const renderEmail = (msg: EmailMessage) => {
  switch (msg.kind) {
    case "group-invite":
      return groupInvite(msg.payload);
  }
};

export const recipientOf = (msg: EmailMessage): string => {
  switch (msg.kind) {
    case "group-invite":
      return msg.payload.to;
  }
};
