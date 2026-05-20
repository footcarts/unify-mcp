# unify-mcp

Use Claude to query and update your [Unify GTM](https://unifygtm.com) CRM. ~45 tools for people, companies, sequences, audiences, plays, lists, notes, and tasks.

Sign in with your Unify account — no API keys, no admin setup, no env vars.

## Install

```bash
npx -y unify-mcp install
```

That one command:
- installs `unify-mcp` globally (if not already)
- sets it up as a background service (`launchd` on macOS, `systemd --user` on Linux)
- registers it with Claude Code (`claude mcp add --transport http unify http://127.0.0.1:53274/mcp --scope user`)

Open Claude → `/mcp` → click **Authenticate**. Your browser opens, you sign in to Unify, done. Token lasts ~30 days; **Clear authentication** in `/mcp` does a real logout.

## Try these prompts

> "Find people from Acme Corp in Unify and show me their sequence status"
> "Add the latest 50 new appraisal leads to my 'High Priority' list"
> "Show me funnel metrics for the Outbound Q2 sequence"
> "Anyone who finished the appraisal sequence without replying — pull them up so I can mark dead"
> "Post a note on this person's Unify record summarizing the call I just had"

> **Don't have a Unify password?** If you sign in with Google or another SSO, click **Reset Password** on the [Unify login page](https://app.unifygtm.com), set one, and use it in the form. SSO and a password can coexist.

## Uninstall

```bash
unify-mcp uninstall
```

Stops the service, removes the plist/unit, and unregisters the MCP from Claude.

## Add to Claude Desktop (manual)

`unify-mcp install` only registers with Claude Code. For Claude Desktop, run the installer first (to get the service running), then edit `claude_desktop_config.json`:
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

Restart Claude.

## CLI reference

```bash
unify-mcp install            # one-command install (service + Claude registration)
unify-mcp uninstall          # reverse install
unify-mcp                    # run server in the foreground (port 53274)
unify-mcp serve --port N     # foreground, custom port
unify-mcp login              # CLI sign-in (skip the browser)
unify-mcp whoami             # show cached token email + remaining TTL
unify-mcp logout             # clear cached token + saved credentials
```

The cached token, credentials, and OAuth state live at `~/.unify-mcp/` (mode 600).

## How auth works

Unify uses Auth0. Auth0's SPA client doesn't issue refresh tokens, so the access token has a 15-minute TTL. To avoid making you sign in 96 times a day, `unify-mcp` also caches Auth0's session cookies (~30-day lifetime) and uses Auth0's silent re-auth flow (`prompt=none`) under the hood. Result: sign in once, stay signed in ~30 days, no password prompt.

When the session cookie itself expires, the next OAuth handshake pops the browser sign-in page again. Submit, done for another month.

The browser sign-in form is served by `unify-mcp` on `127.0.0.1` (loopback only). Your password goes from the browser → local `unify-mcp` process → `auth.unifygtm.com`. It never touches Claude, Anthropic, or any third party.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Authenticate` button doesn't show in `/mcp` | Confirm the service is up: `curl http://127.0.0.1:53274/healthz` should return `ok`. If not, `launchctl list \| grep unify-mcp` (macOS) or `systemctl --user status unify-mcp` (Linux). |
| Claude can't connect | Service isn't running. macOS: `launchctl load ~/Library/LaunchAgents/com.unify-mcp.plist`. Linux: `systemctl --user start unify-mcp`. |
| `Auth0: invalid password` | Double-check your password at app.unifygtm.com. If you use SSO, click **Reset Password** there, set one, then sign in again. |
| `Auth0: MFA required, not supported` | This MCP doesn't support MFA-protected Auth0 logins. Ask your Unify admin to disable MFA for your account, or open an issue. |
| Just changed your Unify password | Click **Clear authentication** in `/mcp`, or `unify-mcp logout`. Next tool call re-runs the OAuth flow. |
| Port 53274 already taken | `unify-mcp install --port N` (then re-register with the new URL). |
| `npm install -g` permission errors | Install Node via `brew install node` (which sets up a user-owned npm prefix), or use a Node version manager. |

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
- Windows auto-install (run `unify-mcp` manually + `claude mcp add` for now)

## Disclaimer

`unify-mcp` is an unaffiliated, community-maintained tool. "Unify" and "Unify GTM" are trademarks of their respective owners.
