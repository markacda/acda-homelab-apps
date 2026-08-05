import { SignJWT } from 'jose';
import { joseVerifier, type TokenVerifier } from '../../../Common/auth/index.ts';
import type { AccessTokenClaims, AccessTokenIssuer } from '../../Domain/Ports/access-token-issuer.ts';
import { UnauthorizedError } from '../../Domain/Exceptions/unauthorized-error.ts';

// AccessTokenIssuer backed by `jose` (pure-ESM, no native build). Access tokens are
// HS256 JWTs carrying the person id as `sub` and their `roles`, signed with the
// self-provisioned secret. Verification delegates to @homelab/auth's shared
// joseVerifier (the same code every consuming app runs), and any failure (bad
// signature, expired, malformed, missing subject) becomes an UnauthorizedError so
// the error filter answers 401.

const ALG = 'HS256';

export class JoseTokenIssuer implements AccessTokenIssuer {
  private readonly secret: Uint8Array;
  private readonly ttl: string;
  private readonly verifier: TokenVerifier;

  /** @param ttl expiry as a jose duration string (e.g. '7d'). */
  constructor(secret: Uint8Array, ttl = '7d') {
    this.secret = secret;
    this.ttl = ttl;
    this.verifier = joseVerifier(secret);
  }

  async issue(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ roles: claims.roles })
      .setProtectedHeader({ alg: ALG })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(this.ttl)
      .sign(this.secret);
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    try {
      return await this.verifier(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired token.');
    }
  }
}
