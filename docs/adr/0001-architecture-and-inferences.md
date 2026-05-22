# ADR 0001 — Architecture decisions and inferences

Status: accepted
Date: 2026-05-21

## Context

The task asked to build a Next.js gallery app with a Fastify backend (starting from `jeanrabello/fastify-base-api`), MongoDB persistence, S3 storage (LocalStack for local), shadcn/ui + dnd-kit on the frontend, pastel palette, Docker for local and production. Authentication that we don't have credentials for can be mocked.

## Decisions

1. **Backend baseline**: started from the cloned `fastify-base-api` template but **stripped its translation / response-translator / CustomError-with-paths layers** and the AbstractController/UseCase scaffolding to keep development velocity reasonable. Preserved core: Fastify 5 + TypeScript + Zod type provider + JWT auth + Mongo + Swagger + rate-limit + Dockerfile (multi-stage) + path aliases. Module style was simplified to per-feature `*.routes.ts` files; the original template can still be added back later for richer ergonomics.

2. **Database**: kept MongoDB (the template's choice). Collections: `users`, `groups`, `albums`, `photos`, `invites`, `share_tokens`. Album/photo ordering is implemented with a numeric `position` field updated via bulk write on reorder.

3. **Google OAuth**: **MOCKED** (`GOOGLE_MOCK_ENABLED=true` by default). The `/api/auth/google` endpoint accepts a body with `{email, name, googleId}` (or a non-verified base64 idToken payload). No real Google credentials are required to demo the flow. To switch to real OAuth one would replace the mock with `google-auth-library` `OAuth2Client.verifyIdToken`.

4. **Email for invites**: **MOCKED** — instead of sending real email (no SMTP creds), the `/api/invites/send` endpoint creates the invite, logs the invitation link to the server stdout (prefix `[INVITE-EMAIL-MOCK]`), and returns the link + `joinCode` to the caller so the UI can show/copy it.

5. **S3**: AWS SDK v3 (`@aws-sdk/client-s3`) against LocalStack on `:4566`. Bucket auto-created on boot with a `s3:GetObject` public-read policy so uploaded photos can be served directly to `<img src>` without signed URLs. For production one should swap public-read for signed URLs.

6. **Sharing private albums with third parties**: opaque share tokens (`crypto.randomBytes(24)`) are created per album. The token can be passed as `?token=<t>` query or `x-share-token: <t>` header to the public endpoint `GET /api/public/albums/:albumId` which returns the album + photo URLs as JSON. Tokens are revokable. Only the album owner (private/user-owned albums) can create them, per the requirement.

7. **Reordering**: client-side dnd-kit emits the new ordered ids. The backend trusts the request (server only restricts to albums/photos visible to the requesting user) and rewrites `position` in a single bulkWrite.

8. **Frontend stack**: Next.js 15 App Router + Tailwind + shadcn/ui + dnd-kit + React Query. Token storage in `localStorage` for simplicity (mock-grade auth). Pastel palette: blush, mint, lavender, peach, sky.

9. **Production Dockerfiles**: multi-stage, non-root user. `docker-compose.yml` is the dev orchestration; `docker-compose.prod.yml` builds production targets. Mongo + LocalStack are containerized too.

10. **No tests**: scope is large enough that we focused on shipping the working features end-to-end. Test scaffolding from the template was removed to keep dependencies lean.

## Consequences

- The backend is intentionally smaller and easier to read than the original template. Trade-off: no i18n responses and no AbstractController inheritance — domain handlers are just plain async functions.
- Anyone can mint a `/auth/google` session with arbitrary email — acceptable only because mock is the explicit default. Toggle `GOOGLE_MOCK_ENABLED=false` and wire `google-auth-library` for real use.
- Public album photos via LocalStack rely on the bucket policy granting `GetObject`. In real AWS, prefer pre-signed URLs.
