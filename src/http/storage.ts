import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { TOKEN_CACHE_DIR } from "../config.js";

/**
 * Persistent on-disk store for OAuth state. Keyed at ~/.unify-mcp/oauth.json
 * with mode 0600. Persists across server restarts so the user doesn't have to
 * re-authenticate every time `unify-mcp serve` reboots.
 */

export interface AuthCodeRecord {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  email: string;
  /** epoch ms */
  expiresAt: number;
}

export interface BearerRecord {
  token: string;
  clientId: string;
  email: string;
  /** epoch ms */
  expiresAt: number;
}

interface OAuthState {
  clients: Record<string, OAuthClientInformationFull>;
  codes: Record<string, AuthCodeRecord>;
  bearers: Record<string, BearerRecord>;
}

const FILE = "oauth.json";
const dir = () => join(homedir(), TOKEN_CACHE_DIR);
const file = () => join(dir(), FILE);

const empty = (): OAuthState => ({ clients: {}, codes: {}, bearers: {} });

let cached: OAuthState | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<OAuthState> {
  if (cached) return cached;
  try {
    const raw = await readFile(file(), "utf8");
    const parsed = JSON.parse(raw) as Partial<OAuthState>;
    cached = {
      clients: parsed.clients ?? {},
      codes: parsed.codes ?? {},
      bearers: parsed.bearers ?? {},
    };
  } catch {
    cached = empty();
  }
  return cached;
}

async function persist(): Promise<void> {
  const state = cached ?? empty();
  // Serialize writes so concurrent mutations don't clobber each other.
  writeQueue = writeQueue.then(async () => {
    await mkdir(dir(), { recursive: true, mode: 0o700 });
    await writeFile(file(), JSON.stringify(state, null, 2), { mode: 0o600 });
  });
  return writeQueue;
}

function sweepExpired(state: OAuthState): void {
  const now = Date.now();
  for (const [k, v] of Object.entries(state.codes)) {
    if (v.expiresAt <= now) delete state.codes[k];
  }
  for (const [k, v] of Object.entries(state.bearers)) {
    if (v.expiresAt <= now) delete state.bearers[k];
  }
}

// ── Clients ───────────────────────────────────────────────────────────────

export async function getClient(
  clientId: string
): Promise<OAuthClientInformationFull | undefined> {
  const s = await load();
  return s.clients[clientId];
}

export async function saveClient(
  client: OAuthClientInformationFull
): Promise<void> {
  const s = await load();
  s.clients[client.client_id] = client;
  await persist();
}

// ── Auth codes ────────────────────────────────────────────────────────────

export async function saveAuthCode(code: AuthCodeRecord): Promise<void> {
  const s = await load();
  sweepExpired(s);
  s.codes[code.code] = code;
  await persist();
}

export async function takeAuthCode(
  code: string
): Promise<AuthCodeRecord | undefined> {
  const s = await load();
  sweepExpired(s);
  const rec = s.codes[code];
  if (!rec) return undefined;
  delete s.codes[code];
  await persist();
  return rec;
}

export async function peekAuthCode(
  code: string
): Promise<AuthCodeRecord | undefined> {
  const s = await load();
  sweepExpired(s);
  return s.codes[code];
}

// ── Bearer tokens ─────────────────────────────────────────────────────────

export async function saveBearer(bearer: BearerRecord): Promise<void> {
  const s = await load();
  sweepExpired(s);
  s.bearers[bearer.token] = bearer;
  await persist();
}

export async function getBearer(
  token: string
): Promise<BearerRecord | undefined> {
  const s = await load();
  sweepExpired(s);
  return s.bearers[token];
}

export async function revokeBearer(token: string): Promise<void> {
  const s = await load();
  if (s.bearers[token]) {
    delete s.bearers[token];
    await persist();
  }
}

export async function revokeAllBearers(): Promise<void> {
  const s = await load();
  s.bearers = {};
  await persist();
}
