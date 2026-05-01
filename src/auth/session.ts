import { CookieJar } from "tough-cookie";
import { ENV_LOGIN_PASS, ENV_LOGIN_USER } from "../config.js";
import { loadCredentials, saveCredentials } from "./credentials.js";
import { loginWithPassword, silentReauth } from "./login.js";
import {
  CachedToken,
  isExpired,
  jarFromCached,
  loadToken,
  saveToken,
} from "./token-cache.js";

let inFlight: Promise<string> | null = null;

/** Returns a fresh access token, transparently refreshing if cached one is expired. */
export async function getAccessToken(): Promise<string> {
  const cached = await loadToken();
  if (cached && !isExpired(cached)) return cached.accessToken;

  if (inFlight) return inFlight;
  inFlight = doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Force a re-auth (e.g. on 401). Dedupes concurrent calls. */
export async function forceReauth(): Promise<string> {
  if (inFlight) return inFlight;
  inFlight = doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRefresh(): Promise<string> {
  // Try silent re-auth via persisted Auth0 session cookies first — works for ~30 days
  // until the session cookie expires, no password needed.
  const cached = await loadToken();
  const jar = cached ? jarFromCached(cached) : null;
  if (jar) {
    const result = await silentReauth(jar);
    if (result) {
      const next: CachedToken = {
        accessToken: result.accessToken,
        expiresAt: Date.now() + result.expiresIn * 1000,
        email: cached?.email ?? "",
        cookies: jar.toJSON(),
      };
      await saveToken(next);
      return result.accessToken;
    }
  }
  // Fall back to full U/P login.
  return doFullLogin();
}

/**
 * Sentinel error: caller should prompt the user for credentials (e.g. via
 * MCP elicitation) and retry by calling `interactiveLogin(email, password)`.
 */
export class CredentialsRequired extends Error {
  constructor() {
    super("Unify credentials required");
    this.name = "CredentialsRequired";
  }
}

async function doFullLogin(): Promise<string> {
  // Priority: env vars → saved credentials file → ask the user
  const envUser = process.env[ENV_LOGIN_USER];
  const envPass = process.env[ENV_LOGIN_PASS];
  let user = envUser;
  let pass = envPass;
  if (!user || !pass) {
    const saved = await loadCredentials();
    if (saved) {
      user = saved.email;
      pass = saved.password;
    }
  }
  if (!user || !pass) {
    throw new CredentialsRequired();
  }
  const { accessToken, expiresIn, cookieJar } = await loginWithPassword(user, pass);
  const next: CachedToken = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    email: user,
    cookies: cookieJar.toJSON(),
  };
  await saveToken(next);
  return accessToken;
}

/**
 * Used by `unify-mcp login` and the in-chat elicitation flow. Performs a full
 * U/P login and persists the credentials so future session expiries can
 * silently re-auth without prompting the user again.
 */
export async function interactiveLogin(
  user: string,
  pass: string
): Promise<{ email: string; expiresIn: number }> {
  const { accessToken, expiresIn, cookieJar } = await loginWithPassword(user, pass);
  const next: CachedToken = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    email: user,
    cookies: cookieJar.toJSON(),
  };
  await saveToken(next);
  await saveCredentials({ email: user, password: pass });
  return { email: user, expiresIn };
}

export type { CookieJar };
