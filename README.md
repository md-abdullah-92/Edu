# EduPrepX

MongoDB-backed course management and online examination MVP using Next.js App Router.

## Run locally

1. Install Node.js 20.9+ and MongoDB (local or hosted).
2. Copy `.env.example` to `.env.local` and set:
   - `MONGODB_URI` to the MongoDB connection string.
   - `SESSION_SECRET` to a random secret of at least 32 characters.
   - Optionally override `NEXT_PUBLIC_WHATSAPP_NUMBER` in international digits. The default admin contact is `01825261654`.
3. Install dependencies and start the app:

   ```sh
   npm install
   npm run dev
   ```

4. Set `GMAIL_USER` to the Gmail address used to send verification emails and `GMAIL_APP_PASSWORD` to its Google App Password. Do not use your regular Gmail password.
5. Create the first administrator from a trusted local shell. Set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` (at least 8 characters) in `.env.local`, then run `npm run admin:create`. Admin accounts cannot self-register. Demo credentials should not be reused for a Google account or public deployment.
6. Open `http://localhost:3000`. Students register with their email; an OTP is emailed before account creation. Login uses email and password.

For databases created before exam attempt history and GridFS course covers were added, run `npm run db:migrate-exam-attempts` before deploying the update. The migration replaces the old one-result-per-student indexes, backfills existing result metadata, and moves any legacy base64 cover images into GridFS.


## Implemented

- Email/password login, email-OTP-verified student registration, hashed passwords and signed HttpOnly session cookies.
- Gmail SMTP OTP delivery with 10-minute expiry, a 60-second resend cooldown, up to five sends per hour, and a five-attempt verification limit.
- Admin course create/edit/publish, fees, payment instructions and compressed JPEG/PNG/WebP cover images.
- Admin student account activation/deactivation.
- Student bKash/Nagad transaction submission with globally unique transaction IDs and pending/approved/rejected review records. Submission is not payment verification; an Admin must manually verify and approve before access is granted.
- PDF study-material uploads stored in MongoDB GridFS with a URL/reference on the material record, plus external links and API-level approved-enrollment checks.
- MCQ authoring with four options per question, optional negative marking, explanations, and configurable first/highest/latest-attempt leaderboards.
- Server-timed exams with auto-submit, unanswered-question scoring, question navigation, full attempt history, immediate result breakdowns, and answer explanations.
- Admin dashboard metrics, student listing, payment queue, and exam results.

## Scope and deployment notes

This first release records payment information only. It does not collect money, contact bKash/Nagad, or automatically verify a transaction. Connect an authorized merchant gateway separately before enabling real payment processing.

Course cover image bytes are stored in MongoDB GridFS; the course document stores a stable `/api/courses/:id/cover` URL, file ID, and content type. Uploads are limited to JPEG, PNG, or WebP images up to 5 MB after browser-side resizing. Study-material PDFs use a separate MongoDB GridFS bucket, with a URL/reference stored on the material record; uploads are limited to 20 MB and served only to admins or students with approved course enrollment. External study-material URLs must use HTTP or HTTPS.

Before public deployment, use a managed MongoDB database, HTTPS, a strong per-environment session secret, backups, rate limiting on authentication and exam endpoints, and production monitoring. Seed data is not included; dashboard metrics reflect actual database records.
