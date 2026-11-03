import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';

// Deriva a chave scrypt de forma assincrona, evitando bloquear o event loop.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const JWT_ALG = 'HS256';
const JWT_EXPIRATION = '7d';

/** Gera o hash scrypt de uma senha no formato "saltHex:hashHex". */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plain, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

/** Confere a senha contra o hash armazenado em tempo constante. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(plain, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

/** Claims que o token de acesso carrega. */
export interface TokenClaims {
  /** Id do usuario (subject do JWT). */
  sub: string;
  /** Id da empresa (tenant). */
  tid: string;
  /** Papel do usuario. */
  role: string;
}

/** Assina um JWT HS256 com validade de sete dias. */
export async function signToken(claims: TokenClaims, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ tid: claims.tid, role: claims.role })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(key);
}

/** Valida um JWT e devolve as claims; lanca se invalido, adulterado ou expirado. */
export async function verifyToken(token: string, secret: string): Promise<TokenClaims> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key);

  const sub = payload.sub;
  const tid = payload['tid'];
  const role = payload['role'];
  if (!sub || typeof tid !== 'string' || typeof role !== 'string') {
    throw new Error('Token sem as claims obrigatorias');
  }

  return { sub, tid, role };
}
