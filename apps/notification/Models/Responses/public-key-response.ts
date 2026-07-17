/** Response body of `GET /api/push/public-key`. */
export interface PublicKeyResponse {
  /** The VAPID public key clients pass as `applicationServerKey` when subscribing. */
  publicKey: string;
}
