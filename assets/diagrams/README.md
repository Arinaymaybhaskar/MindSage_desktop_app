# Diagrams

Every diagram in the README is generated from a [D2](https://d2lang.com) source
file in [src/](src/). The `.svg` files next to this README are build output.
**Edit the `.d2` source and re-render; never hand-edit the SVG.**

Each source is rendered twice, once per colour scheme, because GitHub's light
and dark themes are independent of the viewer's operating system preference.
The README pairs them with `<picture>`:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/diagrams/chat-dark.svg">
  <img alt="..." src="./assets/diagrams/chat.svg">
</picture>
```

## Rendering

Install the D2 CLI (v0.7.1 or newer), then from the repository root:

```bash
for f in assets/diagrams/src/*.d2; do
  name=$(basename "$f" .d2)
  d2 --theme=0   --layout=dagre --pad=40 "$f" "assets/diagrams/$name.svg"
  d2 --theme=200 --layout=dagre --pad=40 "$f" "assets/diagrams/$name-dark.svg"
done
```

Theme 0 is D2's neutral light theme and 200 is Dark Mauve. Keep both in step:
a source rendered into only one of them leaves the README half-updated.

## Layout notes

Two D2 behaviours are worth knowing before editing these files, because both
produce a diagram that compiles cleanly and looks wrong.

- **Edges that cross into a nested child override `direction`.** An edge
  written as `main.data -> sqlite` makes D2 abandon the top-level `direction:
  down` and lay the whole diagram out in one very wide row. Connect containers
  to containers (`main -> sqlite`) and keep child-level edges inside a single
  container. This is why [src/architecture.d2](src/architecture.d2) has no
  cross-container child edges.
- **`direction` inside a container is ignored by the dagre engine.** To arrange
  a container's children horizontally, set `grid-columns` on the container
  rather than `direction: right`.

`dagre` is the layout engine for all of these. `elk` produces noticeably
narrower and taller output on the same sources.

## Keeping them honest

These diagrams describe real code paths and are only useful while that stays
true. Each source names the files it was derived from in a comment at the top.
When you change one of those files, check the diagram in the same pull request.
