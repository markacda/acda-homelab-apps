import { SignJWT, jwtVerify } from 'jose';
import type { AccessTokenClaims, AccessTokenIssuer } from '../../Domain/Ports/access-token-issuer.ts';
import { UnauthorizedError } from '../../Domain/Exceptions/unauthorized-error.ts';

// AccessTokenIssuer backed by `jose` (pure-ESM, no native build). Access tokens are
// HS256 JWTs carrying the person id as `sub` and their `roles`, signed with the
// self-provisioned secret. `verify` maps any jose failure (bad signature, expired,
// malformed) to an UnauthorizedError so the error filter answers 401.

const ALG = 'HS256';

export class JoseTokenIssuer implements AccessTokenIssuer {
  private readonly secret: Uint8Array;
  private readonly ttl: string;

  /** @param ttl expiry as a jose duration string (e.g. '7d'). */
  constructor(secret: Uint8Array, ttl = '7d') {
    this.secret = secret;
    this.ttl = ttl;
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
    let sub: string | undefined;
    let roles: unknown;
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: [ALG] });
      sub = payload.sub;
      roles = (payload as { roles?: unknown }).roles;
    } catch {
      throw new UnauthorizedError('Invalid or expired token.');
    }
    if (!sub) throw new UnauthorizedError('Invalid or expired token.');
    return {
      sub,
      roles: Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [],
    };
  }
}
