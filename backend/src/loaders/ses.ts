import {
  SESClient,
  ListIdentitiesCommand,
  VerifyEmailIdentityCommand,
} from "@aws-sdk/client-ses";
import config from "@config/api";

// LocalStack (and AWS SES sandbox) rejects SendEmail when the sender
// identity isn't verified. In production AWS, identities must be verified
// through the console/SDK with a DNS or email confirmation step — we don't
// auto-create those.
//
// This bootstrap only runs against custom endpoints (LocalStack/dev) to
// keep dev frictionless. It is idempotent and never throws.
export const ensureSesIdentity = async () => {
  const { enabled, endpoint, from, region, accessKeyId, secretAccessKey } =
    config.email;
  if (!enabled || !endpoint || !from) return;

  const bareEmail = (() => {
    const match = from.match(/<([^>]+)>/);
    return (match ? match[1] : from).trim();
  })();
  if (!bareEmail || !bareEmail.includes("@")) return;

  const client = new SESClient({
    region,
    endpoint,
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });

  try {
    const list = await client.send(
      new ListIdentitiesCommand({ IdentityType: "EmailAddress" }),
    );
    if (list.Identities?.includes(bareEmail)) return;
  } catch {
    // ignore — try to create anyway
  }

  try {
    await client.send(
      new VerifyEmailIdentityCommand({ EmailAddress: bareEmail }),
    );
    console.log(`Verified SES email identity "${bareEmail}" on ${endpoint}`);
  } catch (err: any) {
    console.warn(
      `Could not verify SES identity ${bareEmail} on ${endpoint}:`,
      err?.message || err,
    );
  }
};
