import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CookieJar } from "tough-cookie";
import { z } from "zod";
import { TOKEN_CACHE_DIR, TOKEN_CACHE_FILE } from "../config.js";

const cachedTokenSchema = z.object({
  accessToken: z.string(),
  expiresAt: z.number(),
  email: z.string(),
  // Auth0 session cookies (jar.toJSON()) — used for silent re-auth.
  // Optional for backwards compatibility with v0.1.0 caches.
  cookies: z.unknown().optional(),
});

export type CachedToken = z.infer<typeof cachedTokenSchema>;

const dir = () => join(homedir(), TOKEN_CACHE_DIR);
const file = () => join(dir(), TOKEN_CACHE_FILE);

export async function loadToken(): Promise<CachedToken | null> {
  try {
    const raw = await readFile(file(), "utf8");
    const parsed = cachedTokenSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveToken(t: CachedToken): Promise<void> {
  await mkdir(dir(), { recursive: true, mode: 0o700 });
  await writeFile(file(), JSON.stringify(t, null, 2), { mode: 0o600 });
}

export async function clearToken(): Promise<void> {
  try {
    await unlink(file());
  } catch {
    // ignore
  }
}

export function isExpired(t: CachedToken, skewSeconds = 30): boolean {
  return Date.now() >= t.expiresAt - skewSeconds * 1000;
}

export function jarFromCached(t: CachedToken): CookieJar | null {
  if (!t.cookies || typeof t.cookies !== "object") return null;
  try {
    return CookieJar.fromJSON(JSON.stringify(t.cookies));
  } catch {
    return null;
  }
}
