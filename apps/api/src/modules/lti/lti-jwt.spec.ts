import { generateKeyPairSync } from 'node:crypto';
import {
  decodeJwt,
  jwkThumbprint,
  publicJwkFromKey,
  selectJwk,
  signRs256,
  verifyRs256,
} from './lti-jwt';

describe('lti-jwt', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicJwkFromKey(publicKey);
  const kid = jwkThumbprint(jwk);

  it('imzolangan tokenni o`sha ochiq kalit bilan tasdiqlaydi', () => {
    const token = signRs256(
      { iss: 'https://platform.test', sub: 'u1', nonce: 'n' },
      privateKey,
      kid,
    );
    const decoded = decodeJwt(token);

    expect(decoded.header).toEqual({ alg: 'RS256', typ: 'JWT', kid });
    expect(decoded.payload.sub).toBe('u1');
    expect(verifyRs256(decoded, jwk)).toBe(true);
  });

  it('o`zgartirilgan payload yoki boshqa kalit rad etiladi', () => {
    const token = signRs256({ sub: 'u1' }, privateKey, kid);
    const [header, , signature] = token.split('.') as [string, string, string];
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin' })).toString('base64url');
    const forged = decodeJwt(`${header}.${forgedPayload}.${signature}`);
    expect(verifyRs256(forged, jwk)).toBe(false);

    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(verifyRs256(decodeJwt(token), publicJwkFromKey(other.publicKey))).toBe(false);
  });

  it('alg RS256 bo`lmasa tekshiruv o`tmaydi (alg=none hujumi)', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url');
    const decoded = decodeJwt(`${header}.${payload}.AA`);
    expect(verifyRs256(decoded, jwk)).toBe(false);
  });

  it('buzuq token aniq xatolik beradi', () => {
    expect(() => decodeJwt('abc')).toThrow('jwt_malformed');
    expect(() => decodeJwt('a.b.c')).toThrow('jwt_malformed');
  });

  it('kalit `kid` bo`yicha tanlanadi, kid bo`lmasa faqat yagona kalit', () => {
    const keys = [
      { ...jwk, kid },
      {
        ...publicJwkFromKey(generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey),
        kid: 'other',
      },
    ];
    expect(selectJwk(keys, kid)?.kid).toBe(kid);
    expect(selectJwk(keys, 'missing')).toBeUndefined();
    expect(selectJwk(keys, undefined)).toBeUndefined();
    expect(selectJwk([jwk], undefined)).toBe(jwk);
  });
});
