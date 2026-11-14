/**
 * Terminal keypad — a translucent floating pad over the DSH Web terminal.
 *
 * A phone (or a keyboard without a numeric pad) has no comfortable Escape,
 * Tab, Ctrl, pipe or arrow keys while a terminal has focus. This Client-half
 * plugin floats a small keypad in the lower-right corner of the visible
 * terminal screen and writes the bytes a terminal expects through the public
 * Client terminal service.
 *
 * The pad is the requested plus: the four arrow keys surround Esc, and the
 * free corners hold Tab (upper left), | (upper right) and Ctrl (lower left).
 * Ctrl is a sticky modifier: arm it, then press an arrow to send the
 * Ctrl+Arrow sequence (or | to send 0x1c, the byte Ctrl+\ produces).
 *
 * Input goes through `ctx.webTerminals.view(sessionId, tabId, contentId)`, the
 * same cached view the sidebar's terminal body owns, so no second attachment
 * competes for the terminal. The pad renders through a body portal because the
 * `shell.overlay` layer (z-index 20) sits below a fullscreen right panel
 * (z-index 40).
 */
window.__ModuleLoader__.load({
  id: 'dsh-terminal-keypad',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement

    /** Locale namespace of this seat's copy. */
    const NS = 'terminalKeypad'

    /** Simplified Chinese copy. */
    const zh = {
      label: '终端按键面板',
      'aria.escape': 'Esc 键（按住拖动可移动面板）',
      'aria.tab': 'Tab 键',
      'aria.control': 'Ctrl 修饰键，先按它，再按方向键、符号键或直接敲字母',
      'aria.enter': '回车键',
      'aria.symbol': '符号 {symbol}，上滑可选择其它终端符号',
      'aria.symbolMenu': '选择终端符号',
      'aria.up': '上方向键',
      'aria.down': '下方向键',
      'aria.left': '左方向键',
      'aria.right': '右方向键',
      'aria.home': 'Home 键（行首）',
      'aria.end': 'End 键（行尾）',
      'aria.pageup': 'Page Up 键（上翻页）',
      'aria.pagedown': 'Page Down 键（下翻页）',
    }

    /** English copy. */
    const en = {
      label: 'Terminal keypad',
      'aria.escape': 'Escape; hold and drag to move the keypad',
      'aria.tab': 'Tab',
      'aria.control': 'Control modifier: arm it, then press an arrow, the symbol key, or type a character',
      'aria.enter': 'Enter',
      'aria.symbol': 'Symbol {symbol}; slide up to pick another terminal symbol',
      'aria.symbolMenu': 'Choose a terminal symbol',
      'aria.up': 'Arrow up',
      'aria.down': 'Arrow down',
      'aria.left': 'Arrow left',
      'aria.right': 'Arrow right',
      'aria.home': 'Home (start of line)',
      'aria.end': 'End (end of line)',
      'aria.pageup': 'Page Up',
      'aria.pagedown': 'Page Down',
    }

    /** Solid triangles, so the arrow keys stay crisp at any font or zoom. */
    const ARROW_PATHS = {
      up: 'M8 3.2 13.2 12.4H2.8Z',
      down: 'M8 12.8 2.8 3.6h10.4Z',
      left: 'M3.2 8 12.4 2.8v10.4Z',
      right: 'M12.8 8 3.6 13.2V2.8Z',
    }

    /** One keypad cell: what the user reads, its accessible name, and its bytes. */
    const KEYS = {
      tab: { text: 'Tab', label: 'aria.tab', plain: '\t', ctrl: '\t' },
      up: { arrow: true, label: 'aria.up', key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, plain: '\u001b[A', ctrl: '\u001b[1;5A' },
      pipe: { symbol: true, label: 'aria.symbol' },
      left: { arrow: true, label: 'aria.left', key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, plain: '\u001b[D', ctrl: '\u001b[1;5D' },
      escape: { text: 'Esc', label: 'aria.escape', plain: '\u001b', ctrl: '\u001b' },
      right: { arrow: true, label: 'aria.right', key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, plain: '\u001b[C', ctrl: '\u001b[1;5C' },
      control: { text: 'Ctrl', label: 'aria.control', sticky: true },
      enter: { icon: 'enter', label: 'aria.enter', plain: '\r' },
      down: { arrow: true, label: 'aria.down', key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, plain: '\u001b[B', ctrl: '\u001b[1;5B' },
    }

    /** The plus: arrows around Esc; Tab, the symbol key and Ctrl in the corners, Enter last. */
    const LAYOUT = [
      ['tab', 'up', 'pipe'],
      ['left', 'escape', 'right'],
      ['control', 'down', 'enter'],
    ]

    /** Cell size, gap and inset from the terminal's lower-right corner, in CSS pixels. */
    const CELL = 36
    const GAP = 5
    const INSET = 12
    /** Rendered square of the pad, used to keep it inside the visible box. */
    const SIZE = CELL * 3 + GAP * 2
    /** A terminal screen smaller than this is a thumbnail, not a usable anchor. */
    const MIN_TERMINAL = 48
    /** What sliding outward from each arrow sends on release instead. */
    const SWIPE_KEYS = {
      up: { text: 'PgUp', label: 'aria.pageup', key: 'PageUp', code: 'PageUp', keyCode: 33, data: '\u001b[5~' },
      down: { text: 'PgDn', label: 'aria.pagedown', key: 'PageDown', code: 'PageDown', keyCode: 34, data: '\u001b[6~' },
      left: { text: 'Home', label: 'aria.home', key: 'Home', code: 'Home', keyCode: 36, data: '\u001b[H' },
      right: { text: 'End', label: 'aria.end', key: 'End', code: 'End', keyCode: 35, data: '\u001b[F' },
    }
    /** How far the pointer must travel outward before the arrow turns into its function key. */
    const SWIPE_DISTANCE = 13
    /** Movement that turns a press on the centre key into a drag instead of Escape. */
    const DRAG_DISTANCE = 8
    /** The terminal symbols the key can hold; the current one is its byte. */
    const SYMBOLS = [
      '|', '&', ';', '<', '>', '~',
      '$', '#', '*', '?', '!', '=',
      '+', '-', '^', '@', '%', '/',
      '(', ')', '[', ']', '{', '}',
      '\\', ':', "'", '"', '`', ',',
    ]
    /** The picker's grid: cell size, gap and padding, and the box they add up to. */
    const MENU_CELL = 30
    const MENU_GAP = 4
    const MENU_PAD = 6
    const MENU_WIDTH = (MENU_CELL * 6) + (MENU_GAP * 5) + (MENU_PAD * 2)
    const MENU_HEIGHT = (MENU_CELL * 5) + (MENU_GAP * 4) + (MENU_PAD * 2)
    /** Local storage key of the symbol the key currently holds. */
    const SYMBOL_KEY = 'dsh-terminal-keypad:symbol.v1'

    /**
     * Delay before an arrow sends. A touch that slides outward within this
     * window must not also send the arrow: in a shell, a stray Up rewrites the
     * command line from history.
     */
    const TAP_GRACE = 90
    /** Delay before a held arrow key starts repeating, in ms. */
    const REPEAT_DELAY = 420
    /** The repeat period starts here, shrinks by REPEAT_ACCEL each time, and bottoms out here. */
    const REPEAT_START = 160
    const REPEAT_MIN = 80
    const REPEAT_ACCEL = 0.85

    /**
     * Pad styles. Only host theme tokens, so light, dark and token overrides
     * apply. Surfaces are kept very light and unblurred: the terminal text
     * behind the pad must stay readable.
     */
    const STYLE = [
      '.dsh-terminal-keypad{position:fixed;z-index:1000;display:grid;',
      'grid-template-columns:repeat(3,', CELL, 'px);grid-template-rows:repeat(3,', CELL, 'px);',
      'grid-template-areas:"tab up pipe" "left escape right" "control down enter";gap:', GAP, 'px;',
      'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none}',
      '.dsh-terminal-keypad__key{box-sizing:border-box;display:flex;align-items:center;justify-content:center;',
      'width:', CELL, 'px;height:', CELL, 'px;padding:0;border-radius:9px;',
      'border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2) 82%,transparent);',
      'background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 24%,transparent);',
      'color:var(--dsw-alias-label-primary);',
      'font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
      'text-shadow:0 0 2px var(--dsw-alias-bg-base);',
      'box-shadow:0 1px 4px rgba(0,0,0,.12);cursor:pointer;touch-action:none;',
      'transition:background-color 120ms ease,transform 80ms ease}',
      '.dsh-terminal-keypad__key:hover{background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 50%,transparent)}',
      '.dsh-terminal-keypad__key:active{transform:scale(.94)}',
      '.dsh-terminal-keypad__key[aria-pressed="true"]{border-color:var(--dsw-alias-brand-primary);',
      'background:color-mix(in srgb,var(--dsw-alias-brand-primary) 32%,transparent)}',
      '.dsh-terminal-keypad__key:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsh-terminal-keypad__arrow{display:block;width:16px;height:16px}',
      '.dsh-terminal-keypad__swipe{font-size:10px;line-height:1;letter-spacing:-.02em}',
      '.dsh-terminal-keypad__menu{position:absolute;display:grid;grid-template-columns:repeat(6,', MENU_CELL, 'px);',
      'grid-auto-rows:', MENU_CELL, 'px;gap:', MENU_GAP, 'px;padding:', MENU_PAD, 'px;border-radius:10px;',
      'border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2) 70%,transparent);',
      'background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 74%,transparent);',
      '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 6px 20px rgba(0,0,0,.18)}',
      '.dsh-terminal-keypad__symbol{display:flex;align-items:center;justify-content:center;',
      'width:', MENU_CELL, 'px;height:', MENU_CELL, 'px;padding:0;border:1px solid transparent;border-radius:6px;',
      'background:transparent;color:var(--dsw-alias-label-primary);',
      'font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;cursor:pointer;touch-action:none}',
      '.dsh-terminal-keypad__symbol:hover{background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 45%,transparent)}',
      '.dsh-terminal-keypad__symbol--preview{border-color:var(--dsw-alias-label-primary);',
      'background:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent)}',
      '.dsh-terminal-keypad__symbol--current{border-color:var(--dsw-alias-brand-primary);',
      'background:color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,transparent)}',
      '.dsh-terminal-keypad__key.dsh-terminal-keypad__key--swipe{border-color:var(--dsw-alias-brand-primary);',
      'background:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent)}',
    ].join('')

    /**
     * Keep a number inside a range, tolerating a range narrower than the value.
     * @param value - the number to place.
     * @param min - lower bound.
     * @param max - upper bound.
     * @returns the clamped number.
     */
    function clamp(value, min, max) {
      return Math.max(min, Math.min(value, Math.max(min, max)))
    }

    /**
     * The control byte a terminal receives for Ctrl plus one character.
     * A soft keyboard has no Control key, so arming Ctrl and typing a letter
     * has to produce the same byte the terminal would get from a physical
     * Ctrl chord.
     * @param key - `KeyboardEvent.key` of the typed character.
     * @returns the byte to write, or null when the character has no control form.
     */
    function controlByte(key) {
      if (typeof key !== 'string' || key.length !== 1) return null
      const code = key.charCodeAt(0)
      if (code >= 97 && code <= 122) return String.fromCharCode(code - 96)
      if (code >= 65 && code <= 90) return String.fromCharCode(code - 64)
      switch (key) {
        case '[': return '\u001b'
        case '\\': return '\u001c'
        case ']': return '\u001d'
        case '^': return '\u001e'
        case '_': return '\u001f'
        case '@': return '\u0000'
        case '?': return '\u007f'
        case '|': return '\u001c'
        case ' ': return '\u0000'
        case '/': return '\u001f'
        default: return null
      }
    }

    /**
     * Compare two measured boxes by value, so an unchanged box keeps its
     * state reference and the pad does not re-render on every measurement.
     * @param a - previous box, or null.
     * @param b - next box, or null.
     * @returns whether both describe the same rectangle.
     */
    function sameBox(a, b) {
      if (a === null || b === null) return a === b
      return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom
    }

    /**
     * The visual viewport box, in viewport coordinates. A soft keyboard shrinks
     * the visual viewport without resizing the layout viewport, so the pad is
     * placed against this box instead of `window.innerHeight`.
     * @returns the visible box, `{ left, top, width, height }`.
     */
    function readViewport() {
      const viewport = window.visualViewport
      if (viewport === undefined || viewport === null) {
        return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
      }
      return {
        left: Math.round(viewport.offsetLeft),
        top: Math.round(viewport.offsetTop),
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      }
    }

    /**
     * Follow the visible box while the soft keyboard opens, closes or the page
     * scrolls under a zoomed visual viewport.
     * @returns the current visible box.
     */
    function useVisualViewport() {
      const [box, setBox] = React.useState(readViewport)
      React.useEffect(() => {
        const update = () => setBox((current) => {
          const next = readViewport()
          return current.left === next.left && current.top === next.top
            && current.width === next.width && current.height === next.height
            ? current
            : next
        })
        const viewport = window.visualViewport
        update()
        window.addEventListener('resize', update)
        if (viewport !== undefined && viewport !== null) {
          viewport.addEventListener('resize', update)
          viewport.addEventListener('scroll', update)
        }
        return () => {
          window.removeEventListener('resize', update)
          if (viewport !== undefined && viewport !== null) {
            viewport.removeEventListener('resize', update)
            viewport.removeEventListener('scroll', update)
          }
        }
      }, [])
      return box
    }

    /**
     * Whether the terminal actually paints at one point of its visible box.
     * `elementFromPoint` follows the browser's own hit testing, so a pane
     * clipped by a collapsed column, hidden by CSS, or covered by another
     * surface reports false without any guesswork.
     * @param x - viewport x of the probe.
     * @param y - viewport y of the probe.
     * @param element - the terminal root being probed.
     * @returns whether that point belongs to this terminal (or to the pad).
     */
    function isPainted(x, y, element) {
      if (typeof document.elementFromPoint !== 'function') return true
      const top = document.elementFromPoint(x, y)
      if (top === null || typeof top.closest !== 'function') return false
      return top.closest('.xterm') === element || top.closest('[data-terminal-keypad]') !== null
    }

    /**
     * Measure the terminal screen the user is looking at: the largest `.xterm`
     * (xterm's own root element) whose visible box still paints.
     *
     * The geometry is read directly instead of through an IntersectionObserver.
     * Collapsing the right Sidebar can hide the pane without changing its
     * intersection rectangle, and an observer then has no reason to fire again
     * when the pane returns — the pad would stay hidden until a reload.
     * @returns the visible terminal rectangle, or null while none is on screen.
     */
    function visibleTerminals() {
      const viewport = readViewport()
      const right = viewport.left + viewport.width
      const bottom = viewport.top + viewport.height
      const found = []
      for (const element of document.querySelectorAll('.xterm')) {
        const rect = element.getBoundingClientRect()
        const left = Math.max(rect.left, viewport.left)
        const top = Math.max(rect.top, viewport.top)
        const visibleRight = Math.min(rect.right, right)
        const visibleBottom = Math.min(rect.bottom, bottom)
        const width = visibleRight - left
        const height = visibleBottom - top
        if (width < MIN_TERMINAL || height < MIN_TERMINAL) continue
        const inset = Math.min(20, width / 2, height / 2)
        const probes = [
          [left + inset, top + inset],
          [left + width / 2, top + height * 0.3],
          [left + inset, visibleBottom - inset],
        ]
        if (!probes.some(([x, y]) => isPainted(x, y, element))) continue
        found.push({
          element,
          box: {
            left: Math.round(left),
            top: Math.round(top),
            right: Math.round(visibleRight),
            bottom: Math.round(visibleBottom),
            width: Math.round(width),
            height: Math.round(height),
          },
        })
      }
      found.sort((a, b) => (b.box.width * b.box.height) - (a.box.width * a.box.height))
      return found
    }

    /**
     * Measure the terminal screen the user is looking at.
     * @returns the largest visible terminal rectangle, or null.
     */
    function measureTerminal() {
      const found = visibleTerminals()
      return found.length === 0 ? null : found[0].box
    }

    /**
     * Deliver a key through the terminal's own xterm instance.
     *
     * Writing raw bytes would freeze the cursor-key form the terminal happened
     * to use when the pad was written. A real key event lets xterm apply the
     * screen's current mode: in DECCKM (application cursor keys, which `less`
     * turns on) it sends `ESC O A`, otherwise `ESC [ A`. The keypad, Home/End
     * and PageUp/PageDown all need that switch to work inside pagers.
     * @param spec - `key`, `code` and `keyCode` of the key to deliver.
     * @param ctrl - whether Control is held.
     * @returns whether an xterm screen accepted the event.
     */
    function dispatchTerminalKey(spec, ctrl) {
      const found = visibleTerminals()
      if (found.length === 0) return false
      const textarea = found[0].element.querySelector('textarea.xterm-helper-textarea')
      if (textarea === null) return false
      const make = (type) => {
        const event = new KeyboardEvent(type, {
          key: spec.key,
          code: spec.code,
          bubbles: true,
          cancelable: true,
          composed: true,
          ctrlKey: ctrl === true,
          shiftKey: false,
          altKey: false,
          metaKey: false,
        })
        Object.defineProperty(event, 'keyCode', { configurable: true, get: () => spec.keyCode })
        Object.defineProperty(event, 'which', { configurable: true, get: () => spec.keyCode })
        return event
      }
      const down = make('keydown')
      // Marked so the sticky-Ctrl interceptor below leaves its own events alone.
      down.dshTerminalKeypad = true
      textarea.dispatchEvent(down)
      textarea.dispatchEvent(make('keyup'))
      return true
    }

    /**
     * Track the visible terminal rectangle while the shell changes around it.
     * @returns the visible terminal rectangle, or null while none is on screen.
     */
    function useTerminalBox() {
      const [box, setBox] = React.useState(null)
      React.useEffect(() => {
        let frame = 0
        let disposed = false
        const publish = () => {
          if (frame !== 0) return
          frame = requestAnimationFrame(() => {
            frame = 0
            if (disposed) return
            const next = measureTerminal()
            setBox((current) => (sameBox(current, next) ? current : next))
          })
        }
        publish()
        // Column collapse, tab switches and pane splits commit without
        // publishing an observable the renderer could hook, so re-read the
        // geometry after the gesture and on a slow poll as the safety net.
        const interval = window.setInterval(publish, 500)
        window.addEventListener('resize', publish)
        document.addEventListener('pointerdown', publish, true)
        document.addEventListener('pointerup', publish, true)
        document.addEventListener('visibilitychange', publish)
        const viewport = window.visualViewport
        if (viewport !== undefined && viewport !== null) {
          viewport.addEventListener('resize', publish)
          viewport.addEventListener('scroll', publish)
        }
        return () => {
          disposed = true
          window.clearInterval(interval)
          window.removeEventListener('resize', publish)
          document.removeEventListener('pointerdown', publish, true)
          document.removeEventListener('pointerup', publish, true)
          document.removeEventListener('visibilitychange', publish)
          if (viewport !== undefined && viewport !== null) {
            viewport.removeEventListener('resize', publish)
            viewport.removeEventListener('scroll', publish)
          }
          if (frame !== 0) cancelAnimationFrame(frame)
        }
      }, [])
      return box
    }

    /** Where the user dragged the pad to, relative to {@link basePosition}. */
    const OFFSET_KEY = 'dsh-terminal-keypad:offset.v1'

    /**
     * Read the saved drag offset.
     * @returns `{ x, y }`, zero when nothing usable is stored.
     */
    function readOffset() {
      try {
        const raw = window.localStorage.getItem(OFFSET_KEY)
        if (raw !== null) {
          const value = JSON.parse(raw)
          if (value !== null && typeof value === 'object'
            && Number.isFinite(value.x) && Number.isFinite(value.y)) {
            return { x: value.x, y: value.y }
          }
        }
      } catch (error) {
        // Storage can be unavailable or hold foreign data; the default wins.
      }
      return { x: 0, y: 0 }
    }

    /**
     * Remember the drag offset for the next visit.
     * @param offset - the `{ x, y }` offset to store.
     */
    function saveOffset(offset) {
      try {
        window.localStorage.setItem(OFFSET_KEY, JSON.stringify(offset))
      } catch (error) {
        // A full or blocked storage is not worth failing the drag over.
      }
    }

    /**
     * The picker symbol under one viewport point.
     * @param x - viewport x of the pointer.
     * @param y - viewport y of the pointer.
     * @returns the symbol under that point, or null.
     */
    function symbolAt(x, y) {
      if (typeof document.elementFromPoint !== 'function') return null
      const element = document.elementFromPoint(x, y)
      if (element === null || typeof element.closest !== 'function') return null
      const option = element.closest('[data-symbol]')
      return option === null ? null : option.getAttribute('data-symbol')
    }

    /**
     * Read the saved symbol key.
     * @returns the stored symbol when it is one of {@link SYMBOLS}, else `|`.
     */
    function readSymbol() {
      try {
        const raw = window.localStorage.getItem(SYMBOL_KEY)
        if (raw !== null && SYMBOLS.includes(raw)) return raw
      } catch (error) {
        // Storage can be unavailable; the default wins.
      }
      return '|'
    }

    /**
     * Remember the symbol key for the next visit.
     * @param symbol - the symbol to store.
     */
    function saveSymbol(symbol) {
      try {
        window.localStorage.setItem(SYMBOL_KEY, symbol)
      } catch (error) {
        // A full or blocked storage is not worth failing the choice over.
      }
    }

    /**
     * The pad's default spot: inside the terminal's lower-right corner.
     * @param box - the visible terminal rectangle, or null for the screen corner.
     * @param viewport - the visual viewport box.
     * @returns the unclamped `{ left, top }`.
     */
    function basePosition(box, viewport) {
      const right = viewport.left + viewport.width
      const bottom = viewport.top + viewport.height
      const anchorRight = box === null ? right : Math.min(box.right, right)
      const anchorBottom = box === null ? bottom : Math.min(box.bottom, bottom)
      return { left: anchorRight - SIZE - INSET, top: anchorBottom - SIZE - INSET }
    }

    /**
     * Keep the whole pad inside the visible box, so a soft keyboard or a narrow
     * window never hides it.
     * @param left - wanted viewport x.
     * @param top - wanted viewport y.
     * @param viewport - the visual viewport box.
     * @returns the clamped `{ left, top }`.
     */
    function clampPosition(left, top, viewport) {
      const right = viewport.left + viewport.width
      const bottom = viewport.top + viewport.height
      return {
        left: Math.round(clamp(left, viewport.left + 8, right - SIZE - 8)),
        top: Math.round(clamp(top, viewport.top + 8, bottom - SIZE - 8)),
      }
    }

    /**
     * The floating keypad.
     * @param props - the terminal target hook, the byte sender and the locale seat.
     * @returns the pad while a terminal is on screen, else null.
     */
    function TerminalKeypad(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const press = props.press
      const target = typeof props.useTerminal === 'function' ? props.useTerminal((value) => value) : null
      const armed = typeof props.useArmed === 'function' ? props.useArmed((value) => value) : false
      const setControl = props.setControl
      const viewport = useVisualViewport()
      const box = useTerminalBox()
      const [offset, setOffset] = React.useState(readOffset)
      /** The arrow whose outward slide currently shows its function key. */
      const [swiped, setSwiped] = React.useState(null)
      /** The symbol the symbol key holds, and whether its picker is open. */
      const [symbol, setSymbol] = React.useState(readSymbol)
      const [menuOpen, setMenuOpen] = React.useState(false)
      /** The picker symbol under the finger while the picker is open. */
      const [preview, setPreview] = React.useState(null)
      /** The running auto-repeat of a held arrow key, or null. */
      const hold = React.useRef(null)
      /** Latest rendered geometry, so a drag starts from what the user sees. */
      const geometry = React.useRef({ left: 0, top: 0, baseLeft: 0, baseTop: 0 })
      /** Latest offset, written again when the drag ends. */
      const offsetRef = React.useRef(offset)
      /** The active drag, or null. */
      const drag = React.useRef(null)

      React.useEffect(() => {
        if (typeof setControl === 'function') setControl(false)
      }, [target, setControl])

      React.useEffect(() => {
        offsetRef.current = offset
      }, [offset])

      /** Cancel a held-key repeat and release its listeners. */
      const stopHold = React.useCallback(() => {
        const state = hold.current
        if (state === null) return
        hold.current = null
        if (state.timer !== 0) window.clearTimeout(state.timer)
        window.removeEventListener('pointermove', state.move, true)
        window.removeEventListener('pointerup', state.release, true)
        window.removeEventListener('pointercancel', state.release, true)
        setSwiped(null)
        setPreview(null)
        setMenuOpen(false)
      }, [])

      React.useEffect(() => {
        const stop = () => stopHold()
        window.addEventListener('blur', stop)
        document.addEventListener('visibilitychange', stop)
        return () => {
          window.removeEventListener('blur', stop)
          document.removeEventListener('visibilitychange', stop)
          stopHold()
        }
      }, [stopHold])

      /** Deliver an arrow through xterm (so DECCKM applies), else as raw bytes. */
      const sendArrow = React.useCallback((id, ctrl) => {
        const spec = KEYS[id]
        if (spec === undefined || typeof press !== 'function') return
        if (dispatchTerminalKey(spec, ctrl)) return
        press(ctrl ? spec.ctrl : spec.plain)
      }, [press])

      /** Deliver the swipe target (Home/End/PageUp/PageDown) through xterm. */
      const sendSwipe = React.useCallback((spec) => {
        if (typeof press !== 'function') return
        if (dispatchTerminalKey(spec, false)) return
        press(spec.data)
      }, [press])

      const activate = React.useCallback((id, event) => {
        const key = KEYS[id]
        if (key === undefined) return
        if (key.sticky === true) {
          if (typeof setControl === 'function') setControl(!armed)
          return
        }
        if (key.symbol === true) {
          // The symbol key sends on release, never on press: sliding up first
          // must be able to open the picker instead. The picker stays under the
          // finger: the key previews the symbol being passed over, releasing on
          // one types and keeps it, and releasing outside changes nothing.
          const chosen = armed ? (controlByte(symbol) ?? symbol) : symbol
          const isArmed = armed
          if (typeof setControl === 'function') setControl(false)
          if (typeof press !== 'function') return
          if (event === undefined) {
            press(chosen)
            return
          }
          stopHold()
          const state = {
            pointerId: event.pointerId,
            data: chosen,
            armed: isArmed,
            startY: event.clientY,
            opened: false,
            hovered: null,
            move: null,
            release: null,
            timer: 0,
          }
          state.move = (moveEvent) => {
            if (moveEvent.pointerId !== state.pointerId) return
            if (!state.opened) {
              if (moveEvent.clientY - state.startY > -SWIPE_DISTANCE) return
              state.opened = true
              setMenuOpen(true)
            }
            const hovered = symbolAt(moveEvent.clientX, moveEvent.clientY)
            if (hovered === state.hovered) return
            state.hovered = hovered
            setPreview(hovered)
          }
          state.release = (releaseEvent) => {
            if (releaseEvent.pointerId !== undefined && releaseEvent.pointerId !== state.pointerId) return
            if (state.opened) {
              const picked = symbolAt(releaseEvent.clientX, releaseEvent.clientY)
              stopHold()
              if (picked === null) return
              setSymbol(picked)
              saveSymbol(picked)
              press(state.armed ? (controlByte(picked) ?? picked) : picked)
              return
            }
            stopHold()
            press(state.data)
          }
          hold.current = state
          window.addEventListener('pointermove', state.move, true)
          window.addEventListener('pointerup', state.release, true)
          window.addEventListener('pointercancel', state.release, true)
          return
        }

        const ctrl = armed
        if (typeof setControl === 'function') setControl(false)
        if (typeof press !== 'function') return
        // Every key except an arrow sends on press.
        if (key.arrow !== true || event === undefined) {
          const data = ctrl ? key.ctrl : key.plain
          if (data !== undefined) press(data)
          return
        }

        // An arrow waits TAP_GRACE before sending: a touch that slides outward
        // becomes Home/End/PgUp/PgDn instead, and must not also send the arrow.
        stopHold()
        const state = {
          pointerId: event.pointerId,
          arrow: id,
          ctrl,
          startX: event.clientX,
          startY: event.clientY,
          sent: false,
          swiped: false,
          timer: 0,
          move: null,
          release: null,
        }
        const cancelTimer = () => {
          if (state.timer === 0) return
          window.clearTimeout(state.timer)
          state.timer = 0
        }
        state.move = (moveEvent) => {
          if (moveEvent.pointerId !== state.pointerId || state.swiped) return
          const dx = moveEvent.clientX - state.startX
          const dy = moveEvent.clientY - state.startY
          const outward = state.arrow === 'up' ? dy <= -SWIPE_DISTANCE
            : state.arrow === 'down' ? dy >= SWIPE_DISTANCE
              : state.arrow === 'left' ? dx <= -SWIPE_DISTANCE
                : dx >= SWIPE_DISTANCE
          if (!outward) return
          state.swiped = true
          cancelTimer()
          setSwiped(state.arrow)
        }
        state.release = (releaseEvent) => {
          if (releaseEvent.pointerId !== undefined && releaseEvent.pointerId !== state.pointerId) return
          const swipe = state.swiped ? SWIPE_KEYS[state.arrow] : undefined
          const tap = !state.sent && !state.swiped
          stopHold()
          if (swipe !== undefined) sendSwipe(swipe)
          else if (tap) sendArrow(state.arrow, state.ctrl)
        }
        /** Send the arrow, then repeat it: REPEAT_DELAY, then a ramp down to REPEAT_MIN. */
        const startRepeat = () => {
          state.timer = 0
          if (hold.current !== state || state.swiped) return
          state.sent = true
          sendArrow(state.arrow, state.ctrl)
          let delay = REPEAT_START
          const tick = () => {
            if (hold.current !== state) return
            sendArrow(state.arrow, state.ctrl)
            delay = Math.max(REPEAT_MIN, Math.round(delay * REPEAT_ACCEL))
            state.timer = window.setTimeout(tick, delay)
          }
          state.timer = window.setTimeout(tick, REPEAT_DELAY)
        }
        hold.current = state
        window.addEventListener('pointermove', state.move, true)
        window.addEventListener('pointerup', state.release, true)
        window.addEventListener('pointercancel', state.release, true)
        state.timer = window.setTimeout(startRepeat, TAP_GRACE)
      }, [armed, press, setControl, stopHold, symbol, sendArrow, sendSwipe])

      /**
       * The centre key is a press of Escape until the finger travels: past
       * {@link DRAG_DISTANCE} the press becomes a drag of the whole pad and no
       * Escape is sent.
       */
      const startDrag = (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startLeft: geometry.current.left,
          startTop: geometry.current.top,
          baseLeft: geometry.current.baseLeft,
          baseTop: geometry.current.baseTop,
          moved: false,
        }
        if (typeof event.currentTarget.setPointerCapture === 'function') {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      }

      /** Follow the pointer once the press has become a drag, clamped to the screen. */
      const moveDrag = (event) => {
        const state = drag.current
        if (state === null || event.pointerId !== state.pointerId) return
        const dx = event.clientX - state.startX
        const dy = event.clientY - state.startY
        if (!state.moved) {
          if (Math.hypot(dx, dy) < DRAG_DISTANCE) return
          state.moved = true
        }
        event.preventDefault()
        const next = clampPosition(state.startLeft + dx, state.startTop + dy, readViewport())
        const moved = { x: next.left - state.baseLeft, y: next.top - state.baseTop }
        offsetRef.current = moved
        setOffset(moved)
      }

      /** Finish the press: keep the new place after a drag, send Escape after a tap. */
      const finishDrag = (event, send) => {
        const state = drag.current
        if (state === null) return
        if (event.pointerId !== undefined && event.pointerId !== state.pointerId) return
        drag.current = null
        const moved = state.moved
        if (moved) saveOffset(offsetRef.current)
        try {
          if (typeof event.currentTarget.releasePointerCapture === 'function') {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        } catch (error) {
          // The pointer can already be gone; nothing else depends on the capture.
        }
        if (!moved && send) activate('escape', event)
      }

      if (target === null || box === null) return null

      const base = basePosition(box, viewport)
      const position = clampPosition(base.left + offset.x, base.top + offset.y, viewport)
      /** The symbol key shows the hovered picker symbol while the picker is open. */
      const shownSymbol = preview ?? symbol
      geometry.current = { left: position.left, top: position.top, baseLeft: base.left, baseTop: base.top }

      const cells = []
      for (const row of LAYOUT) {
        for (const id of row) {
          if (id === null) continue
          const key = KEYS[id]
          const swipe = SWIPE_KEYS[id]
          const showing = swiped === id && swipe !== undefined
          const center = id === 'escape'
          const label = key.symbol === true ? t(key.label, { symbol: shownSymbol }) : t(key.label)
          const glyph = showing
            ? h('span', { className: 'dsh-terminal-keypad__swipe' }, swipe.text)
            : key.symbol === true
              ? shownSymbol
              : key.arrow === true
                ? h('svg', {
                  className: 'dsh-terminal-keypad__arrow',
                  viewBox: '0 0 16 16',
                  'aria-hidden': 'true',
                  focusable: 'false',
                }, h('path', { d: ARROW_PATHS[id], fill: 'currentColor' }))
                : key.icon === 'enter'
                  ? h('svg', {
                    className: 'dsh-terminal-keypad__arrow',
                    viewBox: '0 0 16 16',
                    'aria-hidden': 'true',
                    focusable: 'false',
                  },
                  h('path', {
                    d: 'M12.5 3.5V9.5H5',
                    fill: 'none',
                    stroke: 'currentColor',
                    strokeWidth: 1.6,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                  }),
                  h('path', {
                    d: 'M8 6.5 4.5 9.5 8 12.5',
                    fill: 'none',
                    stroke: 'currentColor',
                    strokeWidth: 1.6,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                  }))
                  : key.text
          cells.push(h('button', {
            key: id,
            type: 'button',
            className: showing
              ? 'dsh-terminal-keypad__key dsh-terminal-keypad__key--swipe'
              : 'dsh-terminal-keypad__key',
            style: { gridArea: id },
            title: showing ? t(swipe.label) : label,
            'aria-label': showing ? t(swipe.label) : label,
            'aria-pressed': key.sticky === true ? String(armed) : undefined,
            onPointerDown: (event) => {
              event.preventDefault()
              if (center) startDrag(event)
              else activate(id, event)
            },
            onPointerMove: center ? moveDrag : undefined,
            onPointerUp: center ? (event) => finishDrag(event, true) : undefined,
            onPointerCancel: center ? (event) => finishDrag(event, false) : undefined,
            onContextMenu: (event) => event.preventDefault(),
          }, glyph))
        }
      }

      const menuStyle = menuOpen
        ? {
          left: Math.round(clamp(position.left, viewport.left + 8, viewport.left + viewport.width - MENU_WIDTH - 8) - position.left),
          top: Math.round(clamp(position.top - MENU_HEIGHT - 8, viewport.top + 8, viewport.top + viewport.height - MENU_HEIGHT - 8) - position.top),
        }
        : null

      return createPortal(h(React.Fragment, null,
        h('style', { key: 'style', dangerouslySetInnerHTML: { __html: STYLE } }),
        h('div', {
          key: 'pad',
          className: 'dsh-terminal-keypad',
          role: 'group',
          'aria-label': t('label'),
          'data-terminal-keypad': '',
          style: position,
        }, cells, menuOpen ? h('div', {
          key: 'menu',
          className: 'dsh-terminal-keypad__menu',
          'data-terminal-keypad-menu': '',
          role: 'group',
          'aria-label': t('aria.symbolMenu'),
          style: menuStyle,
        }, SYMBOLS.map((item) => {
          const classes = ['dsh-terminal-keypad__symbol']
          if (item === symbol) classes.push('dsh-terminal-keypad__symbol--current')
          if (item === preview) classes.push('dsh-terminal-keypad__symbol--preview')
          return h('div', {
            key: item,
            className: classes.join(' '),
            'data-symbol': item,
          }, item)
        })) : null),
      ), document.body)
    }

    /** A stable observable of the terminal the pad currently speaks to. */
    function createTarget(ctx) {
      let published = null
      const listeners = new Set()
      const read = () => {
        const sessionId = ctx.sidebarRight.mounted.getSnapshot()
        if (sessionId === undefined) return null
        const tab = ctx.sidebarRight.active()
        if (tab === undefined || tab.kind !== 'terminal') return null
        if (published !== null && published.sessionId === sessionId && published.tabId === tab.id) return published
        return { sessionId, tabId: tab.id, contentId: tab.contentId }
      }
      const recompute = () => {
        const next = read()
        if (next === published) return
        published = next
        for (const listener of listeners) listener()
      }
      recompute()
      return {
        observable: {
          getSnapshot: () => published,
          subscribe: (listener) => {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
          },
        },
        recompute,
        get: () => published,
      }
    }

    /**
     * One shared on/off flag: the pad paints it and the plugin's keyboard
     * listener consumes it, so both halves agree on whether Ctrl is armed.
     * @param initial - the starting value.
     * @returns its observable face plus read and write accessors.
     */
    function createFlag(initial) {
      let value = initial
      const listeners = new Set()
      return {
        observable: {
          getSnapshot: () => value,
          subscribe: (listener) => {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
          },
        },
        get: () => value,
        set: (next) => {
          if (next === value) return
          value = next
          for (const listener of listeners) listener()
        },
      }
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'webTerminals'],
      /**
       * Register the copy and the frame-wide seat, and keep the seat's terminal
       * target current.
       * @param ctx - the Client root Context.
       */
      apply(ctx) {
        const target = createTarget(ctx)
        const control = createFlag(false)

        /**
         * Write one key sequence into the terminal the pad points at. The view
         * is cached by `(sessionId, key)`, and `active().id` is the occurrence
         * key its body used, so this returns that body's own view rather than
         * allocating a second one. Writes are dropped while another page owns
         * input, which is the terminal's own "take control" contract.
         * @param data - the bytes to write.
         */
        const press = (data) => {
          target.recompute()
          const current = target.get()
          if (current === null) return
          try {
            ctx.webTerminals.view(current.sessionId, current.tabId, current.contentId).write(data)
          } catch (error) {
            console.error('[terminal-keypad] write failed', error)
          }
        }

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'terminal-keypad: copy')
        ctx.effect(() => {
          const stopMounted = ctx.sidebarRight.mounted.subscribe(target.recompute)
          const stopTabs = ctx.sidebarRight.openTabs.subscribe(target.recompute)
          return () => {
            stopMounted()
            stopTabs()
          }
        }, 'terminal-keypad: layout sources')
        ctx.effect(() => {
          // Tab switches and pane focus commit layout without publishing an
          // observable of their own; re-read once after the gesture lands.
          let frame = 0
          const schedule = () => {
            if (frame !== 0) return
            frame = requestAnimationFrame(() => {
              frame = 0
              target.recompute()
            })
          }
          document.addEventListener('pointerdown', schedule, true)
          document.addEventListener('pointerup', schedule, true)
          window.addEventListener('resize', schedule)
          const interval = window.setInterval(target.recompute, 1000)
          return () => {
            document.removeEventListener('pointerdown', schedule, true)
            document.removeEventListener('pointerup', schedule, true)
            window.removeEventListener('resize', schedule)
            window.clearInterval(interval)
            if (frame !== 0) cancelAnimationFrame(frame)
          }
        }, 'terminal-keypad: layout re-reads')
        ctx.effect(() => {
          /**
           * While Ctrl is armed, the next character typed into the terminal
           * becomes its control byte (c, m, d, z, ...), so a soft keyboard
           * without a Control key can still send Ctrl-C and friends. Keys typed
           * anywhere outside the terminal screen are left alone.
           * @param event - the document keydown captured before xterm sees it.
           */
          const onKeyDown = (event) => {
            if (event.dshTerminalKeypad === true) return
            if (!control.get()) return
            if (event.isComposing === true || event.keyCode === 229) return
            const element = document.activeElement
            if (element === null || typeof element.closest !== 'function') return
            if (element.closest('.xterm') === null && element.closest('[data-terminal-keypad]') === null) return
            if (event.ctrlKey || event.metaKey || event.altKey) {
              control.set(false)
              return
            }
            const byte = controlByte(event.key)
            if (byte === null) {
              control.set(false)
              return
            }
            event.preventDefault()
            event.stopPropagation()
            control.set(false)
            press(byte)
          }
          /**
           * The same conversion for soft keyboards whose keydown carries no
           * usable `key` (IME/229). Prevented keydown never reaches this, so a
           * character is converted exactly once.
           * @param event - the document beforeinput captured before xterm sees it.
           */
          const onBeforeInput = (event) => {
            if (!control.get() || event.cancelable === false) return
            if (event.inputType !== 'insertText' || typeof event.data !== 'string' || event.data.length !== 1) return
            const element = document.activeElement
            if (element === null || typeof element.closest !== 'function') return
            if (element.closest('.xterm') === null && element.closest('[data-terminal-keypad]') === null) return
            const byte = controlByte(event.data)
            if (byte === null) return
            event.preventDefault()
            control.set(false)
            press(byte)
          }
          document.addEventListener('keydown', onKeyDown, true)
          document.addEventListener('beforeinput', onBeforeInput, true)
          return () => {
            document.removeEventListener('keydown', onKeyDown, true)
            document.removeEventListener('beforeinput', onBeforeInput, true)
          }
        }, 'terminal-keypad: sticky control')
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'terminal-keypad',
          locale: NS,
          inject: () => ({
            hooks: { terminal: target.observable, armed: control.observable },
            press,
            setControl: control.set,
          }),
        }, TerminalKeypad)), 'terminal-keypad: seat')
      },
    }
  },
})
