# dsh-terminal-keypad

English | [中文](README.zh.md)

A floating, almost transparent keypad for the DSH Web terminal. It supplies the
keys a phone's soft keyboard does not have — **Esc**, **Tab**, **Ctrl**, **`|`**
and the four arrow keys — and turns an outward slide on an arrow into
**Home / End / Page Up / Page Down**.

![The keypad floating over a bash terminal on a phone, just above the soft keyboard](doc/Screenshot_2026-11-14.jpg)

## Layout

```
      ┌─────┬─────┬─────┐
      │ Tab │  ▲  │  |  │
      ├─────┼─────┼─────┤
      │  ◀  │ Esc │  ▶  │
      ├─────┼─────┼─────┤
      │Ctrl │  ▼  │ ⠿   │
      └─────┴─────┴─────┘
```

The four arrow keys form a plus around **Esc**. **Tab** sits in the upper-left
corner, **`|`** in the upper-right, **Ctrl** in the lower-left, and the
lower-right cell is the drag grip.

## What each cell does

| Cell | Tap / press | Hold | Slide outward, then release |
|---|---|---|---|
| **▲ ▼ ◀ ▶** | send the arrow (`ESC[A`…`ESC[D`) | repeat the arrow | **Page Up / Page Down / Home / End** |
| **Esc** | send `ESC` | — | — |
| **Tab** | send a tab | — | — |
| **`\|`** | send `\|` | — | — |
| **Ctrl** | arm the sticky Control modifier | — | — |
| **⠿** | — | drag the pad | — |

### Arrows repeat while held

A held arrow sends once, waits **420 ms**, then repeats with a period that
starts at **160 ms** and accelerates by 15% per repeat until it reaches
**80 ms**, where it stays. Releasing — or the window losing focus, the page
being hidden, or the pad unmounting — stops the repeat immediately.

### Slide an arrow outward for a function key

Touch an arrow and slide at least **13 px** in that arrow's own direction:

| From | Sends |
|---|---|
| ▲ | **Page Up** (`ESC[5~`) |
| ▼ | **Page Down** (`ESC[6~`) |
| ◀ | **Home** (`ESC[H`) |
| ▶ | **End** (`ESC[F`) |

The key swaps its glyph for the function key's name while it is slid out, and
sends on release. The arrow itself is delayed by a **90 ms** grace period so a
deliberate slide never first sends the arrow — in a shell a stray `↑` rewrites
the command line from history; a slide that begins after the grace has elapsed
may still send one arrow before the function key.

### Ctrl is sticky

Tap **Ctrl** (it highlights, `aria-pressed="true"`) and the next key is sent
with the Control modifier:

- a pad key: **Ctrl+Arrow** (`ESC[1;5A`…) or **Ctrl+`|`** (`0x1C`, the byte
  Ctrl+\ produces);
- a character typed into the focused terminal: converted to its control byte —
  `c` → `0x03`, `d` → `0x04`, `m` → `0x0D`, `z` → `0x1A`, `[` → `ESC`, `]` →
  `0x1D`, `^` → `0x1E`, `_` → `0x1F`, `@` → `0x00`, `?` → `0x7F`.

Ctrl disarms after one use; tap it again to cancel. Typing anywhere outside the
terminal is never touched.

### Drag it anywhere

Press the **⠿** grip and drag. The pad follows the pointer, is clamped inside the
visible area (including above the soft keyboard), and remembers its offset from
the terminal's lower-right corner in `localStorage`, so it reopens where you
left it.

## Appearance

The pad is meant to sit on top of live terminal text without hiding it:

- each key is a **24% theme-token tint** with no backdrop blur, so the text
  behind stays readable;
- the glyph is fully opaque with a small background-colored halo;
- the outline is **82%** of `--dsw-alias-border-l2`;
- everything follows `--dsw-alias-*` tokens, so light, dark and user token
  overrides all apply.

The pad is 118 × 118 px (36 px cells, 5 px gaps). It appears only while a
terminal screen is actually visible on the page, floats against that terminal's
lower-right corner by default, and disappears again when the terminal is hidden
or another right-sidebar tab is active.

## Install

The package is a DSH bundle; install the directory into the current profile:

```text
plugin_manager  action=install_bundle  target=/absolute/path/to/terminal-keypad
```

The result reports `application: applied` and adds `dsh-terminal-keypad` to the
profile's bundles. The profile links this directory, so **moving the folder
breaks the install** — reinstall from the new path if you move it.

Remove it with:

```text
plugin_manager  action=remove_bundle  target=dsh-terminal-keypad
```

## How it works

- `index.js` is the Host half (an empty `apply()`), only so the bundle row has a
  Host activation. All behavior lives in `client.js`.
- `client.js` registers one entry into the `shell.overlay` slot (id
  `terminal-keypad`) and portals its DOM to `document.body`: the overlay layer
  is `z-index: 20`, below a fullscreen right-sidebar panel at `z-index: 40`.
- Input goes through the public Client terminal service,
  `ctx.webTerminals.view(sessionId, tabId, contentId).write(data)`. It reuses the
  cached view the sidebar's terminal body already owns, so no second attachment
  competes for the terminal; writes are silently dropped while another page owns
  input (the terminal's own "take control" contract).
- Visibility and position come from measuring the live `.xterm` screen
  (`getBoundingClientRect` intersected with the visual viewport, then
  `elementFromPoint` probes) on gestures and a 500 ms poll. Collapsing and
  reopening the right sidebar therefore always brings the pad back.

## Tuning

All knobs are constants at the top of `client.js`:

| Constant | Value | Meaning |
|---|---|---|
| `CELL` / `GAP` / `INSET` | 36 / 5 / 12 | cell size, gap and default inset, in px |
| `TAP_GRACE` | 90 ms | delay before an arrow sends, so a slide can replace it |
| `SWIPE_DISTANCE` | 13 px | outward travel that turns an arrow into its function key |
| `REPEAT_DELAY` | 420 ms | delay before a held arrow starts repeating |
| `REPEAT_START` / `REPEAT_MIN` | 160 / 80 ms | first repeat period / fastest period |
| `REPEAT_ACCEL` | 0.85 | period multiplier per repeat |
| `OFFSET_KEY` | `dsh-terminal-keypad:offset.v1` | `localStorage` key of the drag offset |

## Files

| File | Purpose |
|---|---|
| `client.js` | the whole feature: pad, gestures, input |
| `index.js` | Host activation stub |
| `cordis.patch.yml` | inserts the `terminal-keypad` Host row |
| `package.json` | manifest and `dsh.client` declaration |
| `locale/en.json`, `locale/zh.json` | Plugin Manager title and description |
| `icon.svg` | plugin icon |
| `doc/Screenshot_2026-11-14.jpg` | the screenshot above |

## License

MIT — see [LICENSE](LICENSE).
