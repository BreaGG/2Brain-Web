# 2Brain

A second brain you can see. Every page of the wiki is a point in the head; every passage of every page runs down the spine and out along the nerves, in the order it was written. Links between pages are drawn as lines.

## The interface (v2)

- **Rail** (left): Brain, Navigator, Numbers, Timeline, You, Lab, Review, Files, Learn and Add, plus search (`⌘K`), a small map of your groups and three health figures (sorted, linked, to review).
- **Brain**: a three.js point cloud. Drag to turn, scroll to zoom, right-drag to move, point at a dot to see its note, click to open it, double-click to clear.
- **View panel** (sliders icon, or `V`): colour theme, data colours (Default, Lava, Ocean, Forest, Aurora, Mono, Sunset), Form (anatomy ↔ layout), table builder, notes / record / ghost links, group by folder / domain / type, split, labels, hide unsorted, turning and speed, links, brain outline and point size. Settings are remembered per browser.
- **Legend** (bottom): every group with its notes · record counts. Click to light a group, shift-click to add one.
- **Activity** (bottom right): notes per month; drag to light a period.
- **Panes**: Navigator (folders, types, months and every note), Numbers, Timeline, You (hubs and what to work on next), Lab (table builder, gesture control, link analysis), Review (ghost links, orphans, missing fields), Files, Learn and Add.
- **Reader**: opening a note shows it beside the brain and lights it and its neighbours. Its URL is `/wiki/<folder>/<slug>`.

The previous interface is kept untouched in [`_backup/ui-v1/`](_backup/ui-v1/README.md).

## Data

The wiki is read from a GitHub repository (`wiki/**/*.md`):

```bash
GITHUB_OWNER=…   # owner of the wiki repository
GITHUB_REPO=…    # repository name
GITHUB_TOKEN=…   # token with read access
```

Without these variables the app shows a built-in sample wiki, so it can run locally with no setup.

A note is read like this:

```markdown
# Title

**Type:** concept | person | source-summary | synthesis
**Domain:** research / reading
**Sources:** [[a-source]]
**Last updated:** 2026-11-17

Body with [[links]] to other notes.
```

## Development

```bash
npm install
npm run dev
```
