-- Group 4.1 — what an application may carry.
--
-- The privacy model makes the application flow deliberately asymmetric: an
-- applicant may send a message and styled credits, and nothing else. No
-- attachments, no other actions. The employer reads those two things and, if
-- interested, clicks through to the full profile.
--
-- applications.cover_note already exists and is the message. This adds the
-- styled credits alongside it.
--
-- The HTML is sanitized server-side (src/lib/sanitize.ts) before it ever
-- reaches this column, because the employer's applicant view renders it with
-- dangerouslySetInnerHTML. Storing raw user HTML here would make every
-- employer's screen an XSS target.
--
-- No GRANT is needed: privileges are held at table level and applications was
-- already granted select/insert/update to authenticated in
-- 20260801000004_group1_data_foundation.sql.

alter table public.applications
  add column credits_html text;

comment on column public.applications.cover_note is
  'The applicant''s message. Plain text — rendered as text, never as HTML.';

comment on column public.applications.credits_html is
  'Sanitized HTML credits pasted at apply time. A snapshot: editing the '
  'profile later does not rewrite past applications.';
