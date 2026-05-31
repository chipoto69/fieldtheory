# Field Theory Raycast Extension

The Raycast extension is a launcher and read-only operator surface for the
Field Theory CLI. It wraps `ft` instead of linking directly to local stores.

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

If Raycast cannot find the CLI, set the `ft binary` preference to an absolute
path such as `/opt/homebrew/bin/ft`.

