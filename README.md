# dsh-terminal-keypad

A floating, translucent keypad over the DSH Web terminal.

```
      ┌─────┬─────┬─────┐
      │ Tab │  ↑  │  |  │
      ├─────┼─────┼─────┤
      │  ←  │ Esc │  →  │
      ├─────┼─────┼─────┘
      │Ctrl │  ↓  │
      └─────┴─────┘
```

- The four arrow keys form a plus around **Esc**.
- **Tab** sits in the upper-left corner, **|** in the upper-right, **Ctrl** in the lower-left.
- **Ctrl** is sticky: tap it (it highlights), then tap an arrow to send Ctrl+Arrow, tap `|` to send `0x1c` (Ctrl+\), or type a character into the focused terminal and it arrives as the matching control byte (c → `0x03`, m → `0x0d`, z → `0x1a`, …). Tap it again to disarm; it disarms after one use.

The pad appears only while a terminal screen is on screen, floats against the
terminal's lower-right corner, stays inside the visual viewport when the phone's
soft keyboard opens, and writes through the public Client terminal service
(`ctx.webTerminals.view(...).write(...)`), so it never allocates a second
terminal attachment.

## Install

```sh
plugin_manager install_bundle target=/absolute/path/to/terminal-keypad
```

The bundle inserts one Host row (`terminal-keypad`) and one Client half that
registers into `shell.overlay`.

## Layout and behaviour notes

- Input is sent as raw terminal bytes (`ESC [ A`… for the arrows), so it works
  in a plain shell, readline and vim; a full-screen app in DECCKM accepts the
  SS3 variants too, which are not produced here.
- Writes are ignored while another page owns the terminal's input attachment —
  the terminal's own "take control" contract.
- The pad follows `--dsw-alias-*` theme tokens, so it matches light, dark and
  user token overrides.
