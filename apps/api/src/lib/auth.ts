import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { HttpError } from './errors.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-secret-change-me';
const TOKEN_TTL = '30d';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(playerId: string): string {
  return jwt.sign({ sub: playerId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Reads and verifies the bearer token, returning the player id it was issued for. */
export function requireAuth(req: Request): string {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return payload.sub;
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired, sign in again');
  }
}
