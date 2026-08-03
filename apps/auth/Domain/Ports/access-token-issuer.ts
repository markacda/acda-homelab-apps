/** The identity claims carried by an access token: the person id + their roles. */
export interface AccessTokenClaims {
  sub: string;
  roles: string[];
}

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
