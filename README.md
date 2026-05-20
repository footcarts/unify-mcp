# unify-mcp

Use Claude to query and update your [Unify GTM](https://unifygtm.com) CRM. ~45 tools for people, companies, sequences, audiences, plays, lists, notes, and tasks.

Sign in with your Unify account — no API keys, no admin setup, no env vars. `unify-mcp` runs as a local HTTP server, Claude connects via OAuth, and the first request opens a browser sign-in page. The token auto-refreshes silently for ~30 days, so you sign in roughly once a month.

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

## Run the server

In a long-lived terminal (or under launchd / systemd — see below):

```bash
unify-mcp
```

It binds to `http://127.0.0.1:53274` on loopback only. Use `--port N` to override.

## Add to Claude Code

```bash
claude mcp add --transport http unify http://127.0.0.1:53274/mcp
```

Open `/mcp` in Claude → you'll see an **Authenticate** button. Click it. Your browser opens to a Unify sign-in form served by the local `unify-mcp` process. Submit your email + password, the tab confirms, Claude is now signed in. Bearer token lasts 30 days. Hit **Clear authentication** in `/mcp` to log out — it wipes both the bearer and the underlying Unify session.

## Add to Claude Desktop

Edit `claude_desktop_config.json`:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "unify": {
      "url": "http://127.0.0.1:53274/mcp"
    }
  }
}
```

Restart Claude. Same OAuth flow on first use.

> **Don't have a Unify password?** If you sign in with Google or another SSO, click **Reset Password** on the [Unify login page](https://app.unifygtm.com), set one, and use it in the form. SSO and a password can coexist.

## Keep the server running

`unify-mcp` is a normal Node process. Pick whichever is easiest:

**macOS — launchd** (`~/Library/LaunchAgents/com.unify-mcp.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.unify-mcp</string>
  <key>ProgramArguments</key>
  <array><string>/usr/local/bin/unify-mcp</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/unify-mcp.log</string>
  <key>StandardErrorPath</key><string>/tmp/unify-mcp.err</string>
</dict></plist>
```

Then `launchctl load ~/Library/LaunchAgents/com.unify-mcp.plist`. Adjust the path to wherever `which unify-mcp` says it lives.

**Linux — systemd user unit** (`~/.config/systemd/user/unify-mcp.service`):

```ini
[Unit]
Description=unify-mcp HTTP MCP server

[Service]
ExecStart=/usr/local/bin/unify-mcp
Restart=always

[Install]
WantedBy=default.target
```

Then `systemctl --user enable --now unify-mcp`.

**Quick & dirty**: just `nohup unify-mcp >/tmp/unify-mcp.log 2>&1 &` and forget it.

## CLI commands

```bash
unify-mcp                    # run HTTP MCP server (default port 53274)
unify-mcp serve --port 9000  # custom port
unify-mcp login              # terminal-prompt for email/password (skip the browser)
unify-mcp whoami             # show cached token email + remaining TTL
unify-mcp logout             # delete cached token + credentials
```

The cached token + credentials + OAuth state live at `~/.unify-mcp/` (mode 600).

## How auth works

Unify uses Auth0. Auth0's SPA client doesn't issue refresh tokens, so the access token has a 15-minute TTL. To avoid making you sign in 96 times a day, `unify-mcp` also caches Auth0's session cookies (~30-day lifetime) and uses Auth0's silent re-auth flow (`prompt=none`) under the hood. Result: sign in once, stay signed in ~30 days, no password prompt.

When the session cookie itself expires, the next OAuth handshake pops the browser sign-in page again. Submit, done for another month.

The browser sign-in form is served by `unify-mcp` on `127.0.0.1` (loopback only). Your password goes from the browser → local `unify-mcp` process → `auth.unifygtm.com`. It never touches Claude, Anthropic, or any third party.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Authenticate` button doesn't show | Make sure you registered with `--transport http` and that `unify-mcp` is running (`curl http://127.0.0.1:53274/healthz` should return `ok`). |
| Claude can't connect | The server isn't running. Start it with `unify-mcp`. Check `lsof -iTCP:53274 -sTCP:LISTEN`. |
| `Auth0: invalid password` | Double-check your password at app.unifygtm.com. If you use SSO, click **Reset Password** there, set one, then sign in again. |
| `Auth0: MFA required, not supported` | This MCP doesn't support MFA-protected Auth0 logins. Ask your Unify admin to disable MFA for your account, or open an issue. |
| Just changed your Unify password | Click **Clear authentication** in `/mcp`, or `unify-mcp logout`. Next tool call re-runs the OAuth flow. |
| Port 53274 already taken | Run `unify-mcp --port N` and re-register with the new URL. |
| `npm install -g` permission errors | Install Node via `brew install node` (which sets up a user-owned npm prefix), or run `npx unify-mcp` instead. |

## Tool surface

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

This MCP communicates only between your machine and Unify (`auth.unifygtm.com`, `app-api.unifygtm.com`). No telemetry. Your password and tokens never leave your disk.

## Not yet supported

- Manual sequence enrollment (use the Unify UI)
- Sending one-off email
- Opt-out / suppression list edits
- Sequence pause/resume

## Disclaimer

`unify-mcp` is an unaffiliated, community-maintained tool. "Unify" and "Unify GTM" are trademarks of their respective owners.
