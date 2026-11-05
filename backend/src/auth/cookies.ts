import type { CookieOptions, Response } from 'express';
import type { IssuedTokens } from './auth.service.js';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
// Carries no secret: lets the frontend proxy tell "probably logged in" from "never logged in"
// (the refresh cookie itself is only sent to /api/auth).
export const SESSION_MARKER_COOKIE = 'forkan_session';
export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const base = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
});

// The refresh token is only ever sent to the auth endpoints.
const refreshOptions = (): CookieOptions => ({ ...base(), path: '/api/auth' });

export function setAuthCookies(res: Response, tokens: IssuedTokens) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base(), path: '/', maxAge: ACCESS_TTL_MS });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...refreshOptions(), maxAge: REFRESH_TTL_MS });
  res.cookie(SESSION_MARKER_COOKIE, '1', { ...base(), path: '/', maxAge: REFRESH_TTL_MS });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...base(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, refreshOptions());
  res.clearCookie(SESSION_MARKER_COOKIE, { ...base(), path: '/' });
}
