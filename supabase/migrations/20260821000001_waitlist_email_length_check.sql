-- waitlist_requests.email (20260817000000) only had a format check, not a
-- length cap, unlike its siblings name (<=200) and note (<=2000) on the
-- same table — an anon submitter could satisfy the regex with an
-- arbitrarily long string and have it render, uncapped, in the admin
-- waitlist panel (20260821000000_admin_list_waitlist.sql). 320 matches the
-- RFC 5321 maximum email length.
--
-- Added NOT VALID: table's been publicly insertable since 20260817000000,
-- so a plain ADD CONSTRAINT (which scans and validates every existing row
-- by default) could abort this migration on deploy if any row already
-- exceeds 320 chars. NOT VALID skips that scan and enforces the check on
-- new/updated rows only — existing rows get validated separately, once,
-- outside migration-apply time, so a bad historical row can't block ship.

alter table public.waitlist_requests
  add constraint waitlist_requests_email_length
  check (char_length(email) <= 320) not valid;
