-- Multi-tenancy, phase 4: platform admin moves onto the mapping table.
--
-- `users.is_admin` was never written by anything — the only admin login mints a
-- token from env credentials with no users row at all. But it *was* copied into
-- every OTP-issued session token, and the admin gate trusted that claim, so it
-- was a dormant second path into /admin: one `UPDATE users SET is_admin = true`
-- on a customer's row would have granted the portal with no deploy and no admin
-- password. Dropping the column removes the path rather than renaming it.
--
-- Afterwards super-admin comes from exactly two places: an active `super_admin`
-- row in user_member_mapping, or the env-credential break-glass token.
--
-- ORDERING: grant the first named super_admin (phase 8, or by hand) before
-- retiring the break-glass credential. Do not do both in one deploy.

ALTER TABLE "users" DROP COLUMN IF EXISTS "is_admin";
