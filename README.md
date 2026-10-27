# PYQ Cloud

Mobile-first Next.js PWA for exam practice. The app uses the supplied Cloud.ai mark, Figma-exported UI assets, dark style-guide tokens, and Cloudy mascot animations.

## Run

```sh
npm install
cp .env.example .env.local
npm run dev
```

Required client variables are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Supabase and questions

- Initial schema and RLS policies: `supabase/migrations/20261016000100_initial_schema.sql`.
- The supplied 2026 JSON contains 99 MCQs. The app loads the question bank from Supabase; the JSON file is only an admin import source.
- Admin question workspace: `/admin`. Add questions, review the bank, import the source JSON, or remove unused questions.
- Admins can search by question/topic/exam, filter by subject and year, edit individual questions, and bulk import JSON or CSV files (up to 500 questions per upload). CSV headers: `subject,year,topic,exam,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,question_number`; `correct_option` accepts `0`–`3` or `A`–`D`.
- Admin music controls enable or disable the focus loop, set a same-origin `/audio/...` path or HTTPS audio URL, and adjust volume. Apply `supabase/migrations/20261027000100_app_settings.sql` before saving music changes.
- The SQL Editor fallback import is `supabase/seed_pyq_2026.sql`. It is idempotent and uses stable source-derived IDs. The source has no question number 64; no question is invented.
- Apply `supabase/admin_question_permissions.sql` in the target project if its `service_role` table grants do not already permit the server-side admin actions.

To enable the admin API, set server-only `SUPABASE_SECRET_KEY` and at least one of `PYQ_ADMIN_EMAILS` or `PYQ_ADMIN_PHONES` in the deployment environment. Email and phone allowlists accept comma-separated values; phone numbers are matched by digits, and ten-digit Indian numbers are normalized with country code `91`. The server verifies each bearer token with Supabase and requires the matching email or phone to be confirmed before allowing question or music changes. Keep the secret key out of all `NEXT_PUBLIC_` variables and source control. Add the same allowlist variables to the hosting provider before deploying.

## Supplied assets

- `public/brand/cloud-ai-logo.png`: Cloud.ai mark rendered from the supplied logo PDF.
- `public/mascot-lottie/`: Cloudy idle, reading, meditation, happy, and sad animations. Meditation screen plays the meditation animation and respects reduced-motion preferences.
- `public/data/pyq-2026-practice.json`: normalized question data used as a browser fallback.
- `public/data/pyq-2026.json`: unchanged source JSON for admin import.

## Launch readiness

Run `npm run build` before deployment. Production still needs a production Supabase project with admin secrets and redirect/storage/auth settings configured. The delivered question file has 99 questions while the client brief estimates a 3,000–5,000 question bank. Payments and push delivery need the client-selected vendors, credentials, and live webhook/sending configuration; these integrations cannot be enabled from this project alone. Confirm legal/privacy copy, billing prices, notification consent, and the remaining client-approved screen/content scope before public launch.

For temporary static sign-in, set `NEXT_PUBLIC_AUTH_DEMO_MODE=true`: phone verification accepts `123456`; Google and email sign-in create device-local demo accounts (Google uses `pyqcloud@gmail.com`). Demo profiles and attempts stay on that device and do not create verified Supabase users or sync as user data. Set `NEXT_PUBLIC_DEMO_ADMIN_PHONES` to allow local admin previews for demo phone numbers. The preview reads its initial question bank from Supabase, but all question/catalog/music changes are saved in browser storage only. Real admin writes still require a verified Supabase session and the server-only `PYQ_ADMIN_PHONES`/`PYQ_ADMIN_EMAILS` allowlist. Keep static sign-in temporary; for synced accounts, turn it off and configure real Supabase phone and Google providers.

## Install on a phone

Deploy the app over HTTPS, then open the deployed URL on the phone. In Android Chrome, open the browser menu and choose **Install app** or **Add to Home screen**. On iPhone, open the URL in Safari, tap **Share**, then **Add to Home Screen**. The app includes a manifest, app icons, and an offline shell; browser install prompts depend on the browser and device. Open `/admin` in a browser for the admin panel; the installed app also exposes its admin entry from the menu for signed-in admins.
