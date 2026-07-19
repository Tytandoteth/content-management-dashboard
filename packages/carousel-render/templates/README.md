# templates/

Installed carousel template packs live here, one folder per pack. This folder
is gitignored on purpose: purchased packs must not be committed to public
forks of this repo (only this README is tracked).

## Install a pack

1. Unzip the pack folder into `templates/`, e.g. `templates/my-pack/`.
2. From the repo root, run `pnpm templates:sync`.
3. Restart the dev server (or rebuild) to pick up the change.

## Uninstall a pack

1. Delete the pack's folder from `templates/`.
2. Re-run `pnpm templates:sync`.

See [../../docs/templates.md](../../docs/templates.md) for the full authoring
guide, including the `defineCarouselTemplate` contract and how the sync script
validates and registers a pack.
