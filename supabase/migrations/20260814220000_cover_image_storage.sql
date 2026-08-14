-- Storage bucket for catalog cover/back images, replacing raw URL text
-- fields in admin.html's catalog form with real uploads. Public read
-- (covers need to be servable to every visitor), admin-only write —
-- same is_admin()-gated pattern as every other admin action, just
-- expressed as storage.objects RLS policies instead of a table policy.

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

create policy "covers are publicly readable"
  on storage.objects
  for select
  to public
  using (bucket_id = 'covers');

create policy "admins can upload covers"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'covers' and public.is_admin());

create policy "admins can update covers"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'covers' and public.is_admin());

create policy "admins can delete covers"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'covers' and public.is_admin());
