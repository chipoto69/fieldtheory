# Field Theory Raycast Extension

The Raycast extension is a launcher and read-only operator surface for the
Field Theory CLI. It wraps `ft` instead of linking directly to local stores.
Capture, export, Hermes, GBrain, wiki, Vercel, and other write flows stay out
of the default Raycast command list unless the operator explicitly chooses a
write command.

## Commands

| Command | Backing CLI | Role |
|---|---|---|
| Search Bookmarks | `ft search <query> --json` | Search local X/Twitter bookmarks |
| Operator Suite | `ft suite status --json` | Show operator surfaces and workflow gates |
| Run Field Theory Command | curated `ft ... --json` commands | Quick health checks |

## Scaffold

Refresh the extension files from the CLI templates:

```bash
ft suite raycast scaffold --out ./raycast/fieldtheory --force
```

Then run it with Raycast:

```bash
cd raycast/fieldtheory
npm install
npm run dev
```

Milestone 1 release checks must prove the checked-in extension and CLI scaffold
agree, then run:

```bash
npm --prefix raycast/fieldtheory run lint
npm --prefix raycast/fieldtheory run build
```

If the local machine lacks Raycast tooling, record that as a release blocker
instead of silently skipping the check.

If Raycast cannot find the CLI, set the `ft binary` preference to an absolute
path such as `/opt/homebrew/bin/ft`.
