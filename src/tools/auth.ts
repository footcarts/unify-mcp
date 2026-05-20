import { z } from "zod";
import { clearCredentials } from "../auth/credentials.js";
import { interactiveLogin } from "../auth/session.js";
import { clearToken } from "../auth/token-cache.js";
import { define } from "./types.js";

export const unifyLogin = define({
  name: "unify_login",
  description:
    "Sign in to Unify with email and password. Call this when a Unify tool returns a 'credentials required' error. Ask the user for their Unify email and password first (do not invent them). On success the token is cached at ~/.unify-mcp/ and silently refreshes for ~30 days, so this only needs to be called once.",
  schema: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
  isMutation: true,
  handler: async ({ email, password }) => {
    const { expiresIn } = await interactiveLogin(email, password);
    return {
      ok: true,
      email,
      tokenTtlSeconds: expiresIn,
      message: `Signed in as ${email}. Retry the previous tool call.`,
    };
  },
});

export const unifyLogout = define({
  name: "unify_logout",
  description:
    "Clear cached Unify authentication. Deletes the cached access token and saved credentials from ~/.unify-mcp/. The next Unify tool call will pop the browser sign-in page. Note: if UNIFY_LOGIN_USER / UNIFY_LOGIN_PASS env vars are set in the MCP config, they will silently re-authenticate — remove those from the MCP config first if you want logout to stick.",
  schema: z.object({}),
  isMutation: true,
  handler: async () => {
    await clearToken();
    await clearCredentials();
    return {
      ok: true,
      message:
        "Cleared cached token and credentials. The next Unify tool call will prompt for sign-in.",
    };
  },
});
