import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const SALT_BYTES = 16;
const HASH_BYTES = 64;

export const hashPassword = (plainPassword: string): string => {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hash = scryptSync(plainPassword, salt, HASH_BYTES).toString('hex');
  return `${salt}:${hash}`;
};

export const verifyPassword = (plainPassword: string, storedHash: string): boolean => {
  const normalizedStored = String(storedHash ?? '').trim();
  if (!normalizedStored) {
    return false;
  }

  if (!normalizedStored.includes(':')) {
    const storedBuffer = Buffer.from(normalizedStored);
    const plainBuffer = Buffer.from(plainPassword);
    if (storedBuffer.length !== plainBuffer.length) {
      return false;
    }
    return timingSafeEqual(storedBuffer, plainBuffer);
  }

  const [salt, hash] = normalizedStored.split(':');
  if (!salt || !hash) {
    return false;
  }

  const computed = scryptSync(plainPassword, salt, HASH_BYTES);
  const provided = Buffer.from(hash, 'hex');

  if (provided.length !== computed.length) {
    return false;
  }

  return timingSafeEqual(provided, computed);
};
