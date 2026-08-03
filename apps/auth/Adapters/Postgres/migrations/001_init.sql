-- Auth persons store: one row per person (email = username) + hashed password,
-- roles in a person_roles join table (User, Administrator), and a sessions table
-- holding persisted refresh tokens (hashed) so sign-ins survive redeploys.
-- Password hashing and token issuance land in the auth backend (issue #149);
-- this migration just stands up the schema. Runs in the `auth` schema (the
-- role's search_path), so tables are unqualified.
CREATE TABLE IF NOT EXISTS persons (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS person_roles (
  person_id text NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  role      text NOT NULL,
  PRIMARY KEY (person_id, role)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         text PRIMARY KEY,
  person_id  text NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_person_id_idx ON sessions (person_id);
