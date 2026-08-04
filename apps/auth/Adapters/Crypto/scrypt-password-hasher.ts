import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PasswordHasher } from '../../Domain/Ports/password-hasher.ts';

// PasswordHasher backed by Node's built-in scrypt (a memory-hard KDF), so there
// is no native addon to compile — it builds and runs identically on the Pi's
// ARM64 image. The stored value is self-describing: `scrypt$<saltHex>$<hashHex>`,
// so verification re-derives with the embedded salt and compares in constant time.

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const PREFIX = 'scrypt';

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const derived = (await scryptAsync(plain, salt, KEY_BYTES)) as Buffer;
    return `${PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  async verify(plain: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== PREFIX) return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length === 0 || expected.length === 0) return false;
    const derived = (await scryptAsync(plain, salt, expected.length)) as Buffer;
    // Both buffers are the same length here, so timingSafeEqual is safe to call.
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }
}
