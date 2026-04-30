# unify-mcp

Use Claude to query and update your [Unify GTM](https://unifygtm.com) CRM. ~45 tools for people, companies, sequences, audiences, plays, lists, notes, and tasks.

Log in once with your Unify email/password. No API keys, no admin setup. Token cached locally; auto-refreshes silently for ~30 days.

## Try these prompts (after install)

> "Find people from Acme Corp in Unify and show me their sequence status"
> "Add the latest 50 new appraisal leads to my 'High Priority' list"
> "Show me funnel metrics for the Outbound Q2 sequence"
> "Anyone who finished the appraisal sequence without replying — pull them up so I can mark dead"
> "Post a note on this person's Unify record summarizing the call I just had"

## Install

```bash
npm install -g unify-mcp
unify-mcp login
```

`unify-mcp login` prompts for your Unify email + password. The token is cached at `~/.unify-mcp/token.json` (mode 600).

> **Don't have a Unify password?** If you sign in with Google or another SSO, click **Reset Password** on the [Unify login page](https://app.unifygtm.com), set one, and use it here. SSO and a password can coexist.

Verify:
```bash
unify-mcp whoami
```

## Add to Claude Code

```bash
claude mcp add unify -- unify-mcp
```

That's it. No secrets in Claude config.

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

Restart Claude.

## CLI commands

```bash
unify-mcp login    # prompt for email/password, cache token
unify-mcp whoami   # show cached token email + remaining TTL
unify-mcp logout   # delete cached token
unify-mcp          # run MCP stdio server (default — used by Claude)
```

## How auth works

Unify uses Auth0. Auth0's SPA client doesn't issue refresh tokens, so the access token has a 15-minute TTL. To avoid making you log in 96 times a day, this MCP also caches Auth0's session cookies (~30-day lifetime) and uses Auth0's silent re-auth flow (`prompt=none`) under the hood. Result: you log in once, stay logged in for ~30 days, no password prompt.

When the session cookie itself expires, you'll see `"Run unify-mcp login"` — re-run the command, you're done for another month.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Tool fails with `401` or `"Run unify-mcp login"` mid-conversation | Open a terminal, run `unify-mcp login`. Then `/mcp` in Claude to reconnect (or restart Claude). |
| `Auth0: invalid password` | Double-check your password at app.unifygtm.com. If you use SSO, click **Reset Password** there, set one, then `unify-mcp login`. |
| `Auth0: MFA required, not supported` | This MCP doesn't support MFA-protected Auth0 logins. Ask your Unify admin to disable MFA for your account, or open an issue. |
| Just changed your Unify password | `unify-mcp logout && unify-mcp login` |
| `npm install -g` permission errors | Install Node via `brew install node` (which sets up a user-owned npm prefix), or use `npx unify-mcp` in your Claude config: `{ "command": "npx", "args": ["-y", "--prefer-online", "unify-mcp"] }` |

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

This MCP communicates only between your machine and Unify (`auth.unifygtm.com`, `app-api.unifygtm.com`). No telemetry. Your token never leaves your disk.


## Not yet supported

- Manual sequence enrollment (use the Unify UI)
- Sending one-off email
- Opt-out / suppression list edits
- Sequence pause/resume

## Disclaimer

`unify-mcp` is an unaffiliated, community-maintained tool. "Unify" and "Unify GTM" are trademarks of their respective owners.
