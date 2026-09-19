import { createHmac, timingSafeEqual } from 'node:crypto';

export function hmacSha256Hex(secret: string, body: Buffer): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Verifies a "sha256=<hex>" style signature header, timing-safe. */
export function verifyHmacSignature(
  secret: string,
  body: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;
  const expected = `sha256=${hmacSha256Hex(secret, body)}`;
  const provided = Buffer.from(signatureHeader);
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}
