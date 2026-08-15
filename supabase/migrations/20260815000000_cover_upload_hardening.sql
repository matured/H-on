-- Security hardening pass: the covers bucket (T for cover image upload)
-- had no server-side file type/size limit — admin.html's file input used
-- accept="image/*" client-side, which is a UX hint, not enforcement.
-- Anyone with write access to the bucket (currently just admins, but this
-- is the actual enforcement boundary, not the client-side accept filter)
-- could otherwise upload arbitrarily large or non-image files.

update storage.buckets
set
  file_size_limit = 8388608, -- 8 MiB, generous for a magazine cover scan
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'covers';
