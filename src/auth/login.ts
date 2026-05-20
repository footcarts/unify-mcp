import axios from "axios";
import crypto from "node:crypto";
import { CookieJar } from "tough-cookie";
import { z } from "zod";
import {
  AUTH0_AUDIENCE,
  AUTH0_CLIENT_ID,
  AUTH0_DOMAIN,
  AUTH0_REDIRECT_URI,
  AUTH0_SCOPE,
} from "../config.js";

const b64url = (b: Buffer) =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
});

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  cookieJar: CookieJar;
}

interface RequestInit {
  method: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
}

async function jarReq(jar: CookieJar, url: string, init: RequestInit) {
  const cookieHeader = await jar.getCookieString(url);
  const r = await axios({
    method: init.method,
    url,
    headers: {
      ...(init.headers ?? {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    data: init.body,
    maxRedirects: 0,
    validateStatus: () => true,
  });
  const sc = r.headers["set-cookie"];
  if (sc) for (const c of sc) await jar.setCookie(c, url);
  return r;
}

function buildAuthorizeUrl(
  challenge: string,
  state: string,
  nonce: string,
  prompt?: string,
  organization?: string
) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: AUTH0_CLIENT_ID,
    redirect_uri: AUTH0_REDIRECT_URI,
    audience: AUTH0_AUDIENCE,
    scope: AUTH0_SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  if (prompt) params.set("prompt", prompt);
  if (organization) params.set("organization", organization);
  return `https://${AUTH0_DOMAIN}/authorize?${params.toString()}`;
}

/**
 * Inspect an Auth0 access token and decide whether it has the `org_id` claim
 * Unify's API requires. Returns:
 *   { ok: true } — token has org_id, ready to use
 *   { ok: false, only_org_id } — token is missing org_id but the user belongs to
 *     exactly one org; caller should re-authorize with `organization=<id>`
 *   { ok: false } — token is missing org_id and user is in 0 or 2+ orgs; can't fix
 *     automatically.
 */
function inspectOrgClaim(
  accessToken: string
):
  | { ok: true }
  | { ok: false; only_org_id?: string; count?: number; reason: string } {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString()
    ) as Record<string, unknown>;
    if (typeof payload.org_id === "string" && payload.org_id.length > 0) {
      return { ok: true };
    }
    const om = payload["https://unifygtm.com/org_membership"] as
      | { count?: number; only_org_id?: string }
      | undefined;
    if (om && om.count === 1 && typeof om.only_org_id === "string") {
      return { ok: false, only_org_id: om.only_org_id, count: 1, reason: "missing org_id, single org available" };
    }
    return {
      ok: false,
      count: om?.count,
      reason: `token missing org_id claim (org_membership count=${om?.count ?? "?"})`,
    };
  } catch (err) {
    return { ok: false, reason: `failed to parse token: ${(err as Error).message}` };
  }
}

/**
 * Given an access token that lacks `org_id` and a cookie jar from a successful
 * login, run a silent /authorize?prompt=none&organization=<id> to mint a fresh
 * token with the org baked in. Throws if Auth0 won't issue an org-scoped token
 * silently (in which case the caller should surface a clear error).
 */
async function reauthForOrg(
  jar: CookieJar,
  organization: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const sentState = b64url(crypto.randomBytes(16));
  const nonce = b64url(crypto.randomBytes(16));

  let url = buildAuthorizeUrl(challenge, sentState, nonce, "none", organization);
  let code = "";
  let returnedState = "";
  for (let i = 0; i < 10; i++) {
    const r = await jarReq(jar, url, { method: "GET" });
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      const next = new URL(r.headers.location, url).toString();
      if (next.startsWith(AUTH0_REDIRECT_URI)) {
        const u = new URL(next);
        const err = u.searchParams.get("error");
        if (err) {
          throw new Error(
            `Auth0 organization re-auth failed: ${err} (${u.searchParams.get("error_description") ?? ""})`
          );
        }
        code = u.searchParams.get("code") ?? "";
        returnedState = u.searchParams.get("state") ?? "";
        if (code) break;
        throw new Error("Auth0 organization re-auth: callback missing code");
      }
      url = next;
      continue;
    }
    throw new Error(
      `Auth0 organization re-auth: unexpected status ${r.status} (last URL ${url})`
    );
  }
  if (!code) throw new Error("Auth0 organization re-auth: no code");
  if (returnedState !== sentState) {
    throw new Error("Auth0 organization re-auth: state mismatch (CSRF)");
  }
  return await exchangeCode(code, verifier);
}

async function exchangeCode(code: string, verifier: string): Promise<LoginResult["accessToken"] extends string ? { accessToken: string; expiresIn: number } : never> {
  const r = await axios({
    method: "POST",
    url: `https://${AUTH0_DOMAIN}/oauth/token`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: AUTH0_CLIENT_ID,
      code,
      redirect_uri: AUTH0_REDIRECT_URI,
      code_verifier: verifier,
    }).toString(),
    validateStatus: () => true,
  });
  if (r.status !== 200) {
    const err =
      typeof r.data === "object" && r.data !== null
        ? (r.data as { error?: unknown }).error
        : undefined;
    throw new Error(
      `Auth0 token exchange failed (status ${r.status}${err ? `, error=${String(err)}` : ""})`
    );
  }
  const parsed = tokenResponseSchema.safeParse(r.data);
  if (!parsed.success) {
    throw new Error(`Auth0 token exchange returned unexpected shape`);
  }
  return { accessToken: parsed.data.access_token, expiresIn: parsed.data.expires_in };
}

/**
 * Full Auth0 Universal Login (Authorization Code + PKCE) without a browser.
 * Replays the form-post flow with a cookie jar; returns access token + the jar
 * so callers can persist Auth0's session cookies for silent re-auth.
 */
export async function loginWithPassword(
  username: string,
  password: string
): Promise<LoginResult> {
  const jar = new CookieJar();
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const sentState = b64url(crypto.randomBytes(16));
  const nonce = b64url(crypto.randomBytes(16));

  let url = buildAuthorizeUrl(challenge, sentState, nonce);
  let stateParam = "";
  for (let i = 0; i < 10; i++) {
    const r = await jarReq(jar, url, { method: "GET" });
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      url = new URL(r.headers.location, url).toString();
      if (url.includes("/u/login/identifier")) {
        stateParam = new URL(url).searchParams.get("state") ?? "";
        break;
      }
      continue;
    }
    throw new Error(`Auth0 /authorize: unexpected status ${r.status} (last URL ${url})`);
  }
  if (!stateParam) throw new Error("Auth0 /authorize: did not reach login page");

  await jarReq(jar, `https://${AUTH0_DOMAIN}/u/login/identifier`, {
    method: "POST",
    body: new URLSearchParams({ state: stateParam, username }).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });

  url = `https://${AUTH0_DOMAIN}/u/login/password`;
  let opts: RequestInit = {
    method: "POST",
    body: new URLSearchParams({ state: stateParam, username, password }).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  };
  let code = "";
  let returnedState = "";
  for (let i = 0; i < 12; i++) {
    const r = await jarReq(jar, url, opts);
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      const next = new URL(r.headers.location, url).toString();
      if (next.startsWith(AUTH0_REDIRECT_URI)) {
        code = new URL(next).searchParams.get("code") ?? "";
        returnedState = new URL(next).searchParams.get("state") ?? "";
        if (code) break;
      }
      url = next;
      opts = { method: "GET" };
      continue;
    }
    if (r.status === 200 && url.includes("/u/login/password")) {
      throw new Error("Auth0: invalid password (or stale session — try `unify-mcp login` again)");
    }
    if (r.status === 200 && url.includes("/u/mfa")) {
      throw new Error("Auth0: MFA required, not supported by this client");
    }
    throw new Error(`Auth0 password POST: unexpected status ${r.status} (last URL ${url})`);
  }
  if (!code) throw new Error("Auth0: did not receive authorization code");
  if (returnedState !== sentState) {
    throw new Error("Auth0: state mismatch on callback (CSRF guard)");
  }

  let { accessToken, expiresIn } = await exchangeCode(code, verifier);

  // Unify's API requires an `org_id` top-level claim in the JWT. Auth0 only
  // bakes that claim in when /authorize includes an `organization` param —
  // which we don't know until we've decoded the first token. So after the
  // initial login, decode the token, find the user's only_org_id, and silent-
  // re-authorize with `organization=<id>` to mint a properly scoped token.
  const inspect = inspectOrgClaim(accessToken);
  if (!inspect.ok) {
    if (inspect.only_org_id) {
      const r = await reauthForOrg(jar, inspect.only_org_id);
      accessToken = r.accessToken;
      expiresIn = r.expiresIn;
    } else {
      throw new Error(
        `Login succeeded but token is missing the org_id claim ${
          inspect.count === 0
            ? "(user is not a member of any Unify organization)"
            : inspect.count && inspect.count > 1
              ? `(user is in ${inspect.count} orgs; multi-org selection not yet supported — set UNIFY_ORG_ID to pick one)`
              : `(${inspect.reason})`
        }`
      );
    }
  }

  return { accessToken, expiresIn, cookieJar: jar };
}

/**
 * Silent re-auth using the persisted cookie jar from a previous login.
 * Hits /authorize?prompt=none — Auth0 either returns a fresh code immediately
 * (session cookie still valid) or sends us back to /u/login/identifier
 * (session expired — caller should fall back to full U/P login).
 *
 * Returns null if silent re-auth isn't possible (session expired).
 */
export async function silentReauth(
  jar: CookieJar,
  organization?: string
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const sentState = b64url(crypto.randomBytes(16));
  const nonce = b64url(crypto.randomBytes(16));

  let url = buildAuthorizeUrl(challenge, sentState, nonce, "none", organization);
  let code = "";
  let returnedState = "";
  for (let i = 0; i < 10; i++) {
    const r = await jarReq(jar, url, { method: "GET" });
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      const next = new URL(r.headers.location, url).toString();
      // If Auth0 redirects to login screens, our session cookie isn't accepted.
      if (next.includes("/u/login/") || next.includes("/login?")) return null;
      if (next.startsWith(AUTH0_REDIRECT_URI)) {
        const u = new URL(next);
        // Auth0 returns ?error=login_required when prompt=none can't auth silently.
        if (u.searchParams.get("error")) return null;
        code = u.searchParams.get("code") ?? "";
        returnedState = u.searchParams.get("state") ?? "";
        if (code) break;
        return null;
      }
      url = next;
      continue;
    }
    return null;
  }
  if (!code || returnedState !== sentState) return null;

  try {
    const r = await exchangeCode(code, verifier);
    // If we already passed `organization`, the token has org_id baked in. If
    // not, we may need to re-auth with the org. Don't recurse forever.
    if (organization) return r;
    const inspect = inspectOrgClaim(r.accessToken);
    if (inspect.ok) return r;
    if (inspect.only_org_id) {
      try {
        return await reauthForOrg(jar, inspect.only_org_id);
      } catch {
        return null;
      }
    }
    return r;
  } catch {
    return null;
  }
}
