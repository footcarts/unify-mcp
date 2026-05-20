# unify-mcp

Use Claude to query and update your [Unify GTM](https://unifygtm.com) CRM. ~45 tools for people, companies, sequences, audiences, plays, lists, notes, and tasks.

Sign in with your Unify account — no API keys, no admin setup, no env vars. The first time a Unify tool runs, `unify-mcp` opens a sign-in page in your default browser, hands the credentials directly to Unify, and caches the result locally. The token auto-refreshes silently for ~30 days, so you sign in once a month.

## Try these prompts (after install)

> "Find people from Acme Corp in Unify and show me their sequence status"
> "Add the latest 50 new appraisal leads to my 'High Priority' list"
> "Show me funnel metrics for the Outbound Q2 sequence"
> "Anyone who finished the appraisal sequence without replying — pull them up so I can mark dead"
> "Post a note on this person's Unify record summarizing the call I just had"

## Install

```bash
npm install -g unify-mcp
```

## Add to Claude Code

```bash
claude mcp add unify -- unify-mcp
```

That's it. The first Unify tool you trigger will open a sign-in page in your browser. Submit your Unify email + password, the tab confirms, and the original tool call retries automatically.

## Add to Claude Desktop

Edit `claude_desktop_config.json`:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "unify": {
      "command": "unify-mcp"
    }
  }
}
```

Restart Claude. Same browser-based sign-in on first use.

> **Don't have a Unify password?** If you sign in with Google or another SSO, click **Reset Password** on the [Unify login page](https://app.unifygtm.com), set one, and use it in the form. SSO and a password can coexist.

## CLI commands

```bash
unify-mcp                    # run MCP stdio server (default — used by Claude)
unify-mcp login              # terminal-prompt for email/password, cache token
unify-mcp login --web        # open the browser sign-in page (same flow as in-Claude)
unify-mcp whoami             # show cached token email + remaining TTL
unify-mcp logout             # delete cached token + credentials
unify-mcp serve [--port N]   # run MCP over HTTP with OAuth (see below)
```

The cached token + saved credentials live at `~/.unify-mcp/` (mode 600).

## HTTP transport (optional)

For clients that prefer the streamable-HTTP MCP transport with OAuth, run:

```bash
unify-mcp serve                 # listens on http://127.0.0.1:53274
unify-mcp serve --port 9000     # custom port
```

Register with Claude Code:

```bash
claude mcp add --transport http unify http://127.0.0.1:53274/mcp
```

The first request triggers the standard OAuth dance — Claude opens the browser, you sign in to Unify, the server mints a bearer token, and subsequent requests carry it. Bearer tokens last 30 days; revoking from the `/mcp` panel also clears the underlying Unify session.

The server is single-user, bound to loopback only. Run it under `launchd`/`systemd` if you want it always-on; otherwise stdio mode is simpler.

## How auth works

Unify uses Auth0. Auth0's SPA client doesn't issue refresh tokens, so the access token has a 15-minute TTL. To avoid making you sign in 96 times a day, `unify-mcp` also caches Auth0's session cookies (~30-day lifetime) and uses Auth0's silent re-auth flow (`prompt=none`) under the hood. Result: sign in once, stay signed in ~30 days, no password prompt.

When the session cookie itself expires, the next tool call pops the browser sign-in page again. Submit, done for another month.

The browser sign-in form is served by a one-shot HTTP server `unify-mcp` spins up on `127.0.0.1` (random port, single-use CSRF token in the URL, server self-destructs after a successful submit). Your password goes from the browser → local `unify-mcp` process → `auth.unifygtm.com`. It never touches Claude, Anthropic, or any third party.

## Model-callable auth (fallback)

The server also exposes `unify_login` and `unify_logout` as MCP tools. If the browser flow can't open for some reason (headless container, no GUI), Claude can call `unify_login` with credentials you paste into the chat. Generally not needed — the browser flow is the primary path.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Tool fails with `401` or `"Run unify-mcp login"` mid-conversation | The next tool call will pop the browser sign-in page automatically. If it doesn't, run `unify-mcp login` in a terminal, then `/mcp` in Claude to reconnect. |
| Browser didn't open | The console prints a `http://127.0.0.1:<port>/login/<token>` URL — open it manually. |
| `Auth0: invalid password` | Double-check your password at app.unifygtm.com. If you use SSO, click **Reset Password** there, set one, then try again. |
| `Auth0: MFA required, not supported` | This MCP doesn't support MFA-protected Auth0 logins. Ask your Unify admin to disable MFA for your account, or open an issue. |
| Just changed your Unify password | `unify-mcp logout` and trigger any Unify tool — the sign-in page reopens. |
| `npm install -g` permission errors | Install Node via `brew install node` (which sets up a user-owned npm prefix), or use `npx unify-mcp` in your Claude config: `{ "command": "npx", "args": ["-y", "--prefer-online", "unify-mcp"] }` |

## Tool surface

- **Auth**: `unify_login`, `unify_logout`
- **People**: `search_unify_people`, `get_unify_person`, `list_unify_person_notes`, `list_unify_person_sequence_enrollments`, `list_unify_person_opportunities`, `list_unify_person_exclusions`, `list_unify_person_lists`
- **Companies**: `search_unify_companies`, `get_unify_company`
- **Sequences**: list, get definition, get funnel metrics, list enrollments, get per-step execution, check replies, count-for-action (dry run), bulk-unenroll, list background actions
- **Audiences**: list, get filter definition + linked plays, list members, count
- **Lists**: list, list members, add/remove people or companies (static membership)
- **Plays**: list, get definition, trigger for object ids
- **Notes**: get current draft, publish a note
- **Tasks**: create task, get unseen count
- **Bulk import**: `upload_unify_csv` (people or companies → creates List + records), `preview_unify_csv_upload` (validate column→field mapping before committing). Enrichment off by default.
- **Schema introspection**: list object types, sample records to discover fields
- **Workspace**: current user, mailboxes, snippets, folders

## Privacy

This MCP communicates only between your machine and Unify (`auth.unifygtm.com`, `app-api.unifygtm.com`). No telemetry. Your password and token never leave your disk.

## Not yet supported

- Manual sequence enrollment (use the Unify UI)
- Sending one-off email
- Opt-out / suppression list edits
- Sequence pause/resume

## Disclaimer

`unify-mcp` is an unaffiliated, community-maintained tool. "Unify" and "Unify GTM" are trademarks of their respective owners.
