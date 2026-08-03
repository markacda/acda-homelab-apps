/**
 * Port for password hashing. The concrete algorithm (scrypt, bcrypt, …) lives in
 * the Adapters layer; the domain only knows it can turn a plaintext password into
 * an opaque, self-describing hash string and later verify a candidate against it.
 */
export interface PasswordHasher {
  /** Hash a plaintext password into a self-contained, storable string. */
  hash(plain: string): Promise<string>;
  /** Constant-time-verify a candidate password against a stored hash. */
  verify(plain: string, storedHash: string): Promise<boolean>;
}
