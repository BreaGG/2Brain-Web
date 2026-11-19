# 2Brain

A second brain you can see. Every page of the wiki is a point on the cortex of a real brain; every passage of every page runs from the brainstem down the spinal cord and out along the nerves, in the order it was written. Links between pages are drawn as lines.

## The interface (v2)

- **Rail** (left): Brain, Today (what you wrote today, or on your last day of writing, lit in the brain, with the week at a glance), Navigator, Numbers, Timeline, You, Lab, Review, Files, Learn and Add, plus search (`⌘K`), a small map of your groups and three health figures (sorted, linked, to review).
- **Brain**: a three.js point cloud. Drag to turn, scroll to zoom, right-drag to move, point at a dot to see its note, click to open it, double-click to clear.
- **View panel** (sliders icon, or `V`): colour themes as small previews, data colours as swatches (Default, Lava, Ocean, Forest, Aurora, Mono, Sunset), Form (anatomy ↔ layout), table builder, notes / record / ghost links, group by folder / domain / type, split, labels, hide unsorted, turning and speed, links, tracts, scaffold (faint threads through the passages of each note, along the nerves), brain outline and point size. Settings are remembered per browser.
- **Cosmos** (galaxy icon next to the brain button, or `C`): a purely visual form where every section of the wiki is a galaxy (spiral, barred spiral or elliptical, by size) round the general index. Each galaxy turns on its own axis while the ring of galaxies turns slowly round the centre; streams of light join the sections that link to each other most, and now and then a shooting star crosses.
- **Legend** (bottom): every group with its notes · record counts. Click to light a group, shift-click to add one.
- **Activity** (bottom right): notes per month; drag to light a period.
- **Panes**: Navigator (folders, types, months and every note), Numbers, Timeline, You (hubs and what to work on next), Lab (table builder, gesture control, link analysis), Review (ghost links, orphans, missing fields), Files, Learn and Add.
- **Reader**: opening a note shows it beside the brain and lights it and its neighbours. Its URL is `/wiki/<folder>/<slug>`.

The previous interface is kept untouched in [`_backup/ui-v1/`](_backup/ui-v1/README.md).

## Anatomy credit

The brain and the nervous system are drawn on real anatomy: [`public/anatomy/atlas.bin`](public/anatomy/ATTRIBUTION.md) holds 20,000 points on a human brain and 25,211 points on the brainstem, spinal cord and nerves. They come from [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy) (CC BY-SA 4.0), built on BodyParts3D © The Database Center for Life Science (CC BY-SA 2.1 Japan), with point layouts derived by [mindcorpus](https://mindcorpus.org) (CC BY-SA 4.0). That file stays under CC BY-SA 4.0; see [`public/anatomy/ATTRIBUTION.md`](public/anatomy/ATTRIBUTION.md).

## Data

The wiki is read from a GitHub repository (`wiki/**/*.md`):

```bash
GITHUB_OWNER=…   # owner of the wiki repository
GITHUB_REPO=…    # repository name
GITHUB_TOKEN=…   # token with read access
```

Without these variables the app shows a built-in sample wiki, so it can run locally with no setup.

### Seeing changes straight away

The site checks the wiki for changes every minute, and only downloads notes that are new or edited. To see a push at once:

- press **Sync** at the bottom of the left rail (in **More** on a phone), or run *Sync with GitHub* from ⌘K; or
- add a webhook to the wiki repository (**Settings → Webhooks → Add webhook**): payload URL `https://<your-site>/api/revalidate`, content type `application/json`, the secret you put in `WIKI_WEBHOOK_SECRET`, event *Just the push event*. Every push then shows up in the brain within seconds.

```bash
WIKI_WEBHOOK_SECRET=…   # any long secret, the same one you give the webhook
```

### Writing new notes from the web

**Add → Write a new note** saves a note straight to the wiki repository: the Markdown file and the line that lists it in its folder's `index.md` go in as **one commit** (a new folder also gets an index, linked from `wiki/index.md`). The note appears in the brain at once and opens.

Writing is off until you set one more variable:

```bash
WIKI_WRITE_KEY=…   # any long secret; you type it once in the form and it is remembered on that device
```

`GITHUB_TOKEN` then needs **write access to the repository's contents** (a fine-grained token with *Contents: Read and write* on that one repository). The key is checked on the server; the token never reaches the browser.

A note is read like this:

```markdown
# Title

**Type:** concept | person | source-summary | synthesis
**Domain:** research / reading
**Sources:** [[a-source]]
**Last updated:** 2026-11-17

Body with [[links]] to other notes.
```

### Editing notes from the web

With writing turned on (the same `WIKI_WRITE_KEY` and token as above), every note in the reader has an **Edit** button. It opens the same editor as a new note, filled with the note as it is: title, type, domain, sources and body. **Save changes** writes it back in one commit, sets "Last updated" to today and, when the title changed, updates the note's line in its folder index. Fields you did not touch (and any others, such as "Created") are kept exactly as written. Notes with tables or HTML open in Markdown mode so they come back unchanged. If the file changed on GitHub after you opened the editor, nothing is written and you are asked to sync and redo the edit.

## Development

```bash
npm install
npm run dev
```
