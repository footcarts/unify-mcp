import { randomBytes } from "node:crypto";
import type { Response } from "express";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { clearCredentials } from "../auth/credentials.js";
import { clearToken } from "../auth/token-cache.js";
import {
  getBearer,
  getClient,
  peekAuthCode,
  revokeBearer,
  saveBearer,
  saveClient,
  takeAuthCode,
} from "./storage.js";

/**
 * Pending OAuth authorize requests, keyed by a server-issued session id. The
 * /authorize handler stores the request here and redirects the browser to the
 * Unify sign-in form (/login/:sessionId). When the form is submitted, we look
 * the params back up and complete the OAuth dance by redirecting to the
 * client's redirect_uri with an authorization code.
 *
 * In-memory only — these only need to survive a single browser round-trip, and
 * persisting them to disk would just leak short-lived state.
 */
export interface PendingAuthorize {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
}

const pending = new Map<string, PendingAuthorize>();

const PENDING_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const BEARER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function randomId(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function stashPending(p: PendingAuthorize): string {
  const id = randomId();
  pending.set(id, p);
  setTimeout(() => pending.delete(id), PENDING_TTL_MS).unref();
  return id;
}

export function popPending(id: string): PendingAuthorize | undefined {
  const p = pending.get(id);
  if (p) pending.delete(id);
  return p;
}

class ClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string) {
    return await getClient(clientId);
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ) {
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: randomId(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    await saveClient(full);
    return full;
  }
}

export class UnifyOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new ClientsStore();

  /**
   * Begin the authorize flow: stash the OAuth params (client, redirect_uri,
   * state, code_challenge), then redirect the browser to our login form. The
   * form POST handler will mint the auth code and redirect back to the client.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const sessionId = stashPending({ client, params });
    res.redirect(`/login/${sessionId}`);
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const rec = await peekAuthCode(authorizationCode);
    if (!rec) throw new Error("invalid_grant: unknown authorization code");
    return rec.codeChallenge;
  }

  /**
   * Exchange an auth code for an access token. The code was minted server-side
   * when the user submitted the login form (which also persisted the underlying
   * Unify token to the disk cache). The bearer we issue here is just a key for
   * Claude Code to present on subsequent MCP requests.
   */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const rec = await takeAuthCode(authorizationCode);
    if (!rec) throw new Error("invalid_grant: unknown authorization code");
    if (rec.clientId !== client.client_id) {
      throw new Error("invalid_grant: code issued to different client");
    }
    if (redirectUri && rec.redirectUri !== redirectUri) {
      throw new Error("invalid_grant: redirect_uri mismatch");
    }

    const token = randomId(32);
    const expiresAt = Date.now() + BEARER_TTL_MS;
    await saveBearer({
      token,
      clientId: client.client_id,
      email: rec.email,
      expiresAt,
    });

    return {
      access_token: token,
      token_type: "Bearer",
      expires_in: Math.floor(BEARER_TTL_MS / 1000),
    };
  }

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    // We don't issue refresh tokens. Bearers last 30 days; that's plenty for
    // a localhost MCP. When they expire, Claude Code will re-run /authorize.
    throw new Error("invalid_grant: refresh tokens not supported");
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const rec = await getBearer(token);
    if (!rec) throw new Error("invalid_token");
    if (rec.expiresAt <= Date.now()) {
      await revokeBearer(token);
      throw new Error("invalid_token: expired");
    }
    return {
      token,
      clientId: rec.clientId,
      scopes: [],
      expiresAt: Math.floor(rec.expiresAt / 1000),
      extra: { email: rec.email },
    };
  }

  /**
   * Revoke: delete the bearer mapping AND clear the underlying Unify token
   * cache. This is what wires "Clear authentication" in the /mcp panel to a
   * real logout — next tool call will pop the browser sign-in page again.
   */
  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    await revokeBearer(request.token);
    // Single-user local server: revoking any bearer means the user wants out.
    // Drop the on-disk Unify token + saved credentials too.
    await clearToken();
    await clearCredentials();
  }
}

export const CODE_TTL = CODE_TTL_MS;
