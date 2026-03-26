import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

    return `${salt}:${derivedKey.toString('hex')}`;
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    const [salt, storedHash] = passwordHash.split(':');
    if (!salt || !storedHash) {
      return false;
    }

    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    const storedBuffer = Buffer.from(storedHash, 'hex');

    if (derivedKey.length !== storedBuffer.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, storedBuffer);
  }
}
