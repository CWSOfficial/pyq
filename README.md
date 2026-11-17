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
- Profile roles: apply `supabase/migrations/20261117212824_profile_roles.sql` before deploying role-based admin authorization. New profiles default to `user`; set a verified account's `public.profiles.role` to `admin` in the Supabase Table Editor to grant access.
- The app loads the question bank from Supabase. Admin uploads accept JSON or CSV and save imported questions to Supabase.
- Admin question workspace: `/admin`. Add questions, review the bank, import a supplied JSON or CSV file, or remove unused questions.
- Admins can search by question/topic/exam, filter by subject and year, edit individual questions, and bulk import JSON or CSV files (up to 500 questions per upload). CSV headers: `subject,year,topic,exam,prompt,option_a,option_b,option_c,option_d,correct_option,explanation,question_number`; `correct_option` accepts `0`–`3` or `A`–`D`.
- Admin music controls enable or disable the focus loop, set a same-origin `/audio/...` path or HTTPS audio URL, and adjust volume. Apply `supabase/migrations/20261027000100_app_settings.sql` before saving music changes.
- Apply `supabase/admin_question_permissions.sql` in the target project if its `service_role` table grants do not already permit the server-side admin actions.

The admin API checks the authenticated user's `role` in `public.profiles` on every request and requires a verified email or phone. Keep the server-only `SUPABASE_SECRET_KEY` out of all `NEXT_PUBLIC_` variables and source control. Admin grants are stored in Supabase, not a deployment allowlist.

## Supplied assets

- `public/brand/cloud-ai-logo.png`: Cloud.ai mark rendered from the supplied logo PDF.
- `public/mascot-lottie/`: Cloudy idle, reading, meditation, happy, and sad animations. Meditation screen plays the meditation animation and respects reduced-motion preferences.

## Launch readiness

Run `npm run build` before deployment. Production still needs a production Supabase project with admin secrets and redirect/storage/auth settings configured. Payments and push delivery need the client-selected vendors, credentials, and live webhook/sending configuration; these integrations cannot be enabled from this project alone. Confirm legal/privacy copy, billing prices, notification consent, and the remaining client-approved screen/content scope before public launch.


All question, profile, bookmark, note, habit, attempt, and test-result data is loaded from and saved to the configured Supabase project. Sign-up and sign-in use Supabase Auth; phone OTP test numbers must be configured in Supabase Auth settings.
## Install on a phone

Deploy the app over HTTPS, then open the deployed URL on the phone. In Android Chrome, open the browser menu and choose **Install app** or **Add to Home screen**. On iPhone, open the URL in Safari, tap **Share**, then **Add to Home Screen**. The app includes a manifest, app icons, and an offline shell; browser install prompts depend on the browser and device. Open `/admin` in a browser for the admin panel; the installed app also exposes its admin entry from the menu for signed-in admins.
