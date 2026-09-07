/**
 * Maqsad: LTI 1.3 uchun JWT (RS256) primitivlari — Node `crypto` asosida,
 * qo'shimcha kutubxonasiz (§16: soxta/ortiqcha bog'liqlik yo'q).
 *
 * Platforma `id_token` ni o'z maxfiy kaliti bilan imzolaydi; biz uning JWKS
 * dagi ochiq kaliti bilan tekshiramiz. O'z kalitimiz (tool key) esa JWKS
 * endpointida e'lon qilinadi va kelajakda AGS/Deep Linking so'rovlarini
 * imzolash uchun ishlatiladi.
 */

import { createHash, createPublicKey, createSign, createVerify, type KeyObject } from 'node:crypto';

export interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

export interface DecodedJwt {
  header: JwtHeader;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
}

export interface RsaJwk {
  kty: 'RSA';
  n: string;
  e: string;
  kid?: string;
  alg?: string;
  use?: string;
}

export function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

/** JWT ni qismlarga ajratadi; buzilgan tokenda `Error('jwt_malformed')`. */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('jwt_malformed');
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  let header: JwtHeader;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(headerPart).toString('utf8')) as JwtHeader;
    payload = JSON.parse(base64UrlDecode(payloadPart).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('jwt_malformed');
  }
  if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
    throw new Error('jwt_malformed');
  }

  return {
    header,
    payload,
    signingInput: `${headerPart}.${payloadPart}`,
    signature: base64UrlDecode(signaturePart),
  };
}

/** RS256 imzosini JWK ochiq kaliti bilan tekshiradi. */
export function verifyRs256(decoded: DecodedJwt, jwk: RsaJwk): boolean {
  if (decoded.header.alg !== 'RS256') return false;
  let key: KeyObject;
  try {
    key = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
  } catch {
    return false;
  }
  const verifier = createVerify('RSA-SHA256');
  verifier.update(decoded.signingInput);
  verifier.end();
  try {
    return verifier.verify(key, decoded.signature);
  } catch {
    return false;
  }
}

/** RS256 bilan imzolangan JWT yaratadi (testlar va tool → platforma so'rovlari uchun). */
export function signRs256(
  payload: Record<string, unknown>,
  privateKey: KeyObject,
  kid: string,
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  signer.end();
  return `${header}.${body}.${signer.sign(privateKey).toString('base64url')}`;
}

/** Ochiq kalitni JWK ko'rinishiga o'giradi. */
export function publicJwkFromKey(key: KeyObject): RsaJwk {
  const publicKey = key.type === 'public' ? key : createPublicKey(key);
  const exported = publicKey.export({ format: 'jwk' }) as { n?: string; e?: string };
  if (!exported.n || !exported.e) throw new Error('jwk_export_failed');
  return { kty: 'RSA', n: exported.n, e: exported.e };
}

/** RFC 7638 thumbprint — barqaror `kid` (kalit o'zgarmasa `kid` ham o'zgarmaydi). */
export function jwkThumbprint(jwk: RsaJwk): string {
  const canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return createHash('sha256').update(canonical).digest('base64url');
}

/** JWKS dan `kid` bo'yicha kalit; `kid` bo'lmasa — yagona RSA kalit. */
export function selectJwk(keys: RsaJwk[], kid: string | undefined): RsaJwk | undefined {
  const rsaKeys = keys.filter((key) => key.kty === 'RSA' && key.n && key.e);
  if (kid) return rsaKeys.find((key) => key.kid === kid);
  return rsaKeys.length === 1 ? rsaKeys[0] : undefined;
}
