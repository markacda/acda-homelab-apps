import { jwtVerify } from 'jose';

// Access-token verification — the single implementation the whole homelab shares:
// the auth app's JoseTokenIssuer.verify (apps/auth/Adapters/Jwt/jose-token-issuer.ts)
// delegates here too. Access tokens are HS256 JWTs carrying the person id as `sub`
// and their `roles`. Pinning the algorithm to HS256 rejects alg-confusion attacks; a
// bad signature, expiry, or malformed token throws so the middleware answers 401.

const ALG = 'HS256';

/** Identity claims carried by an access token: the person id + their roles. */
export interface AuthClaims {
  sub: string;
  roles: string[];
}

/** Verifies a raw token string into claims, or throws when it is missing/invalid/expired. */
export type TokenVerifier = (token: string) => Promise<AuthClaims>;

/** Build a jose-backed HS256 verifier bound to the given shared secret. */
export function joseVerifier(secret: Uint8Array): TokenVerifier {
  return async (token: string): Promise<AuthClaims> => {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    const sub = payload.sub;
    if (!sub) throw new Error('Access token is missing a subject.');
    const roles = (payload as { roles?: unknown }).roles;
    return {
      sub,
      roles: Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [],
    };
  };
}
