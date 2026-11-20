# One Cloudflare account per project

By default `wrangler login` is one login for the whole computer.
To tie a project to its own account, without login/logout:

## 1. API token -> .env
Dashboard -> My Profile -> API Tokens -> Create Token ->
template "Edit Cloudflare Workers".
Add permission "D1: Edit" if the project uses D1.
Account Resources: only this account.

Create `.env` in the project root (copy `.env.example`):

    CLOUDFLARE_API_TOKEN=<token>

`.env` must be in `.gitignore`.

## 2. Check
In the project folder:

    npx wrangler whoami

Must show "logged in with an API Token" and the right account.

## Notes
- Worker secrets for local dev stay in `.dev.vars`, not in `.env`.
- With a token in `.env`, `wrangler login` in that folder is refused.
  That is expected: the token wins.
- Old global login is not needed anymore. Optional: `npx wrangler logout`
  after all projects have their own `.env`.
