# IEM–UEM Grant-in-Aid Portal — Backend

Express + MongoDB backend for the Grant-in-Aid portal. It serves the REST API
under `/api/v1` and the canonical server-rendered EJS UI (admin, faculty,
reviewer), plus Server-Sent Events (SSE) notifications.

## Requirements

- Node.js 20+
- MongoDB (Atlas or self-hosted)
- An SMTP account (Gmail by default) **or** a Resend API key
- An AWS S3 bucket for documents and profile images

## Getting started

```bash
npm install
cp .env.example .env   # then fill in the values (see below)
npm run dev            # nodemon app.js
npm start              # production: node app.js
```

The server refuses to start if required configuration is missing
(`validateConfig()` in `server/constants.js`). In production the failure is
strict; in development only `MONGODB_URI` and `ACCESS_TOKEN_SECRET` are required.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | production | Set to `production` when deployed. |
| `PORT` | no | HTTP port (default `8000`). |
| `MONGODB_URI` | **yes** | MongoDB connection string. |
| `ACCESS_TOKEN_SECRET` | **yes** | JWT signing secret (use 32+ random chars). |
| `ACCESS_TOKEN_EXPIRY` | no | JWT lifetime (default `1d`). |
| `APP_BASE_URL` | production | Public base URL used in emails/links. |
| `OTP_HASH_SECRET` | production | Secret used to hash login OTPs. |
| `BOOTSTRAP_ADMIN_SECRET` | no | One-time secret for bootstrapping the first admin. |
| `MAIL_PROVIDER` | no | `smtp` (default) or `resend`. |
| `EMAIL_USER` / `EMAIL_PASS` | SMTP | Gmail address and app password. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Resend | Required when `MAIL_PROVIDER=resend`. |
| `OTP_EXPIRY_MINUTES` | no | OTP validity window (default `5`). |
| `AWS_REGION` | production | S3 region. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | production | S3 credentials. |
| `AWS_S3_BUCKET` | production | S3 bucket name. |
| `TRUST_PROXY` | production | Number of proxy hops (e.g. `1` behind Nginx). |
| `DNS_SERVERS` | no | Comma-separated custom DNS resolvers (leave empty in production). |
| `LOG_MAX_BYTES` / `LOG_MAX_FILES` | no | Log rotation size/count (default 10 MB / 5). |
| `ADMIN_RESET_PASSWORD_URL`, `FACULTY_RESET_PASSWORD_URL`, `REVIEWER_RESET_PASSWORD_URL`, `REVIEWER_LOGIN_URL` | no | Front-end URLs used in emails. |

## Operational notes

- **Logs** are written to `logs/access.log` and `logs/console.log` and rotate by
  size (`LOG_MAX_BYTES` × `LOG_MAX_FILES`). Tokens in query strings are redacted
  in access logs. Admins can tail them via `GET /logs` and `GET /console-logs`
  (`?lines=N`).
- **Health check**: `GET /health` and `GET /api/health` return `200` when MongoDB
  is connected and `503` otherwise.
- **Email delivery** is durable: messages are written to the `EmailOutbox`
  collection and retried by a background worker with exponential backoff.
  OTP emails are delivered immediately because they are time-sensitive.
- **File uploads** are validated by both extension and file signature, capped at
  10 MB per file / 5 files per request, encrypted with SSE-S3, and old documents
  are removed from S3 when replaced.
- **Document URLs are stored in their public S3 URL form.** The bucket (or a
  CloudFront distribution in front of it) must therefore allow public reads for
  the document links returned by the API to work. Email attachments use
  short-lived signed URLs regardless of the bucket policy.
- **Notifications use in-memory SSE connections.** This is supported for a single
  app instance. If the app is ever scaled horizontally, replace the in-memory
  client registry with Redis pub/sub.
- **Optimistic concurrency** is enabled on applications; conflicting updates
  return HTTP `409`.

## Production deployment

`.github/workflows/deploy.yaml` provisions the app on the server. Add the
following GitHub Actions secrets before deploying:

`MONGODB_URI`, `ACCESS_TOKEN_SECRET`, `ACCESS_TOKEN_EXPIRY`, `APP_BASE_URL`,
`OTP_HASH_SECRET`, `BOOTSTRAP_ADMIN_SECRET`, `MAIL_PROVIDER`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `EMAIL_USER`, `EMAIL_PASS`,
`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`,
`ADMIN_RESET_PASSWORD_URL`, `FACULTY_RESET_PASSWORD_URL`,
`REVIEWER_RESET_PASSWORD_URL`, `REVIEWER_LOGIN_URL`.

Nginx is configured with `client_max_body_size 60m`, forwarded client IP
headers, and SSE-friendly buffering/timeouts.

## Maintenance scripts

```bash
npm run seed:admin
npm run seed:faculty-csv
npm run backfill:application-ids[:dry]
npm run backfill:rejection-notifications[:dry]
```
