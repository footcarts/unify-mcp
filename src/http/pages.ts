/**
 * Shared HTML for the Unify sign-in form and success page. Used by both the
 * standalone CLI browser-login flow and the OAuth authorize flow.
 */

export function loginPage(opts: { formAction: string; error?: string }): string {
  const errBlock = opts.error
    ? `<div class="error">${escapeHtml(opts.error)}</div>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sign in to Unify</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f6f7f9; margin: 0; min-height: 100vh;
    display: grid; place-items: center; padding: 24px; color: #111;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1115; color: #eee; }
    .card { background: #1a1d24; border-color: #2a2f3a; }
    input { background: #0f1115; color: #eee; border-color: #2a2f3a; }
  }
  .card {
    width: 100%; max-width: 380px; background: #fff;
    border: 1px solid #e3e6eb; border-radius: 12px; padding: 28px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.06);
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.sub { color: #6b7280; font-size: 13px; margin: 0 0 20px; }
  label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; }
  input {
    width: 100%; padding: 10px 12px; font-size: 14px;
    border: 1px solid #d1d5db; border-radius: 8px; margin-bottom: 14px;
    background: #fff; color: inherit;
  }
  input:focus { outline: 2px solid #3b82f6; outline-offset: -1px; border-color: transparent; }
  button {
    width: 100%; padding: 11px; font-size: 14px; font-weight: 600;
    background: #111; color: #fff; border: 0; border-radius: 8px; cursor: pointer;
  }
  button:hover { background: #000; }
  button:disabled { opacity: 0.6; cursor: wait; }
  .error {
    background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
    padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 14px;
  }
  @media (prefers-color-scheme: dark) {
    .error { background: #2a1414; border-color: #5a2020; color: #fca5a5; }
    button { background: #f3f4f6; color: #111; }
  }
  .footer { font-size: 12px; color: #6b7280; margin-top: 16px; text-align: center; }
  a { color: inherit; }
</style>
</head>
<body>
  <form class="card" method="POST" action="${escapeHtml(opts.formAction)}" autocomplete="on"
        onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Signing in…'">
    <h1>Sign in to Unify</h1>
    <p class="sub">This page is served by <code>unify-mcp</code> on your machine. Your password is sent only to Unify.</p>
    ${errBlock}
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="username" required autofocus />
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />
    <button type="submit">Sign in</button>
    <div class="footer">
      No password? <a href="https://app.unifygtm.com" target="_blank">Reset it on Unify</a>.
    </div>
  </form>
</body>
</html>`;
}

export function successPage(opts: { email: string; autoClose?: boolean }): string {
  const closeScript = opts.autoClose
    ? `<script>setTimeout(() => { try { window.close(); } catch (e) {} }, 1200);</script>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Signed in</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f6f7f9; margin: 0; min-height: 100vh;
    display: grid; place-items: center; padding: 24px; color: #111;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1115; color: #eee; }
    .card { background: #1a1d24; border-color: #2a2f3a; }
  }
  .card {
    width: 100%; max-width: 380px; background: #fff;
    border: 1px solid #e3e6eb; border-radius: 12px; padding: 28px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.06); text-align: center;
  }
  .check {
    width: 44px; height: 44px; border-radius: 50%;
    background: #dcfce7; color: #166534;
    display: grid; place-items: center; margin: 0 auto 12px;
    font-size: 22px; font-weight: 700;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { color: #6b7280; font-size: 13px; margin: 4px 0 0; }
</style>
${closeScript}
</head>
<body>
  <div class="card">
    <div class="check">&#10003;</div>
    <h1>Signed in</h1>
    <p>${escapeHtml(opts.email)}</p>
    <p>You can close this tab and return to Claude.</p>
  </div>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;"
    : c === "<" ? "&lt;"
    : c === ">" ? "&gt;"
    : c === '"' ? "&quot;"
    : "&#39;"
  );
}
