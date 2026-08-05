import type { AuthClaims } from '../../../Common/auth/index.ts';

/**
 * The identity claims carried by an access token: the person id + their roles.
 * Aliased to @homelab/auth's AuthClaims (an identical shape) so the issuer here and
 * the verifiers in every consuming app share a single definition.
 */
export type AccessTokenClaims = AuthClaims;

/**
 * Port for the short-lived access token (a signed JWT in the default adapter).
 * The signing scheme and secret live in the Adapters layer; the domain only issues
 * a token for a set of claims and verifies one back into those claims. `verify`
 * throws an UnauthorizedError when the token is missing, malformed, tampered, or
 * expired.
 */
export interface AccessTokenIssuer {
  issue(claims: AccessTokenClaims): Promise<string>;
  verify(token: string): Promise<AccessTokenClaims>;
}
