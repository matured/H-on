-- waitlist_requests.email (20260817000000) only had a format check, not a
-- length cap, unlike its siblings name (<=200) and note (<=2000) on the
-- same table — an anon submitter could satisfy the regex with an
-- arbitrarily long string and have it render, uncapped, in the admin
-- waitlist panel (20260821000000_admin_list_waitlist.sql). 320 matches the
-- RFC 5321 maximum email length.

alter table public.waitlist_requests
  add constraint waitlist_requests_email_length
  check (char_length(email) <= 320);
