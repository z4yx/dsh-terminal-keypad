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
      'aria.escape': 'Esc 键',
      'aria.tab': 'Tab 键',
      'aria.control': 'Ctrl 修饰键，先按它，再按方向键、竖线或直接敲字母',
      'aria.pipe': '竖线 |',
      'aria.up': '上方向键',
      'aria.down': '下方向键',
      'aria.left': '左方向键',
      'aria.right': '右方向键',
      'aria.drag': '拖动移动按键面板',
    }

    /** English copy. */
    const en = {
      label: 'Terminal keypad',
      'aria.escape': 'Escape',
      'aria.tab': 'Tab',
      'aria.control': 'Control modifier: arm it, then press an arrow or the pipe key, or type a character',
      'aria.pipe': 'Pipe |',
      'aria.up': 'Arrow up',
      'aria.down': 'Arrow down',
      'aria.left': 'Arrow left',
      'aria.right': 'Arrow right',
      'aria.drag': 'Drag to move the keypad',
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
      up: { arrow: true, label: 'aria.up', plain: '\u001b[A', ctrl: '\u001b[1;5A' },
      pipe: { text: '|', label: 'aria.pipe', plain: '|', ctrl: '\u001c' },
      left: { arrow: true, label: 'aria.left', plain: '\u001b[D', ctrl: '\u001b[1;5D' },
      escape: { text: 'Esc', label: 'aria.escape', plain: '\u001b', ctrl: '\u001b' },
      right: { arrow: true, label: 'aria.right', plain: '\u001b[C', ctrl: '\u001b[1;5C' },
      control: { text: 'Ctrl', label: 'aria.control', sticky: true },
      down: { arrow: true, label: 'aria.down', plain: '\u001b[B', ctrl: '\u001b[1;5B' },
    }

    /** The plus: arrows around Esc; Tab, | and Ctrl in the free corners; a grip last. */
    const LAYOUT = [
      ['tab', 'up', 'pipe'],
      ['left', 'escape', 'right'],
      ['control', 'down', 'grip'],
    ]

    /** Cell size, gap and inset from the terminal's lower-right corner, in CSS pixels. */
    const CELL = 40
    const GAP = 6
    const INSET = 14
    /** Rendered square of the pad, used to keep it inside the visible box. */
    const SIZE = CELL * 3 + GAP * 2
    /** A terminal screen smaller than this is a thumbnail, not a usable anchor. */
    const MIN_TERMINAL = 48

    /**
     * Pad styles. Only host theme tokens, so light, dark and token overrides
     * apply. Surfaces are kept very light and unblurred: the terminal text
     * behind the pad must stay readable.
     */
    const STYLE = [
      '.dsh-terminal-keypad{position:fixed;z-index:1000;display:grid;',
      'grid-template-columns:repeat(3,', CELL, 'px);grid-template-rows:repeat(3,', CELL, 'px);',
      'grid-template-areas:"tab up pipe" "left escape right" "control down grip";gap:', GAP, 'px;',
      'user-select:none;-webkit-user-select:none;touch-action:manipulation}',
      '.dsh-terminal-keypad__key{box-sizing:border-box;display:flex;align-items:center;justify-content:center;',
      'width:', CELL, 'px;height:', CELL, 'px;padding:0;border-radius:10px;',
      'border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2) 40%,transparent);',
      'background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 24%,transparent);',
      'color:var(--dsw-alias-label-primary);',
      'font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
      'text-shadow:0 0 2px var(--dsw-alias-bg-base);',
      'box-shadow:0 1px 3px rgba(0,0,0,.08);cursor:pointer;touch-action:manipulation;',
      'transition:background-color 120ms ease,transform 80ms ease}',
      '.dsh-terminal-keypad__key:hover{background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 50%,transparent)}',
      '.dsh-terminal-keypad__key:active{transform:scale(.94)}',
      '.dsh-terminal-keypad__key[aria-pressed="true"]{border-color:var(--dsw-alias-brand-primary);',
      'background:color-mix(in srgb,var(--dsw-alias-brand-primary) 32%,transparent)}',
      '.dsh-terminal-keypad__key:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsh-terminal-keypad__arrow{display:block;width:18px;height:18px}',
      '.dsh-terminal-keypad__grip{display:flex;align-items:center;justify-content:center;box-sizing:border-box;',
      'width:', CELL, 'px;height:', CELL, 'px;padding:0;border:0;border-radius:10px;background:transparent;',
      'color:var(--dsw-alias-label-secondary);opacity:.45;cursor:grab;touch-action:none;',
      'transition:opacity 120ms ease,background-color 120ms ease}',
      '.dsh-terminal-keypad__grip:hover{opacity:.9;background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 26%,transparent)}',
      '.dsh-terminal-keypad__grip:active{cursor:grabbing;opacity:1}',
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
    function measureTerminal() {
      const viewport = readViewport()
      const right = viewport.left + viewport.width
      const bottom = viewport.top + viewport.height
      let best = null
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
        const box = {
          left: Math.round(left),
          top: Math.round(top),
          right: Math.round(visibleRight),
          bottom: Math.round(visibleBottom),
          width: Math.round(width),
          height: Math.round(height),
        }
        if (best === null || box.width * box.height > best.width * best.height) best = box
      }
      return best
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

      const activate = React.useCallback((id) => {
        const key = KEYS[id]
        if (key === undefined) return
        if (key.sticky === true) {
          if (typeof setControl === 'function') setControl(!armed)
          return
        }
        const data = armed ? key.ctrl : key.plain
        if (typeof setControl === 'function') setControl(false)
        if (typeof press === 'function' && data !== undefined) press(data)
      }, [armed, press, setControl])

      /** Begin dragging from the grip; the keys keep their press-to-send behaviour. */
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
        }
        if (typeof event.currentTarget.setPointerCapture === 'function') {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      }

      /** Follow the pointer, clamped so the pad cannot leave the screen. */
      const moveDrag = (event) => {
        const state = drag.current
        if (state === null || event.pointerId !== state.pointerId) return
        event.preventDefault()
        const next = clampPosition(
          state.startLeft + (event.clientX - state.startX),
          state.startTop + (event.clientY - state.startY),
          readViewport(),
        )
        const moved = { x: next.left - state.baseLeft, y: next.top - state.baseTop }
        offsetRef.current = moved
        setOffset(moved)
      }

      /** Finish the drag and remember where the pad landed. */
      const endDrag = (event) => {
        const state = drag.current
        if (state === null || event.pointerId !== state.pointerId) return
        drag.current = null
        if (typeof event.currentTarget.releasePointerCapture === 'function') {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        saveOffset(offsetRef.current)
      }

      if (target === null || box === null) return null

      const base = basePosition(box, viewport)
      const position = clampPosition(base.left + offset.x, base.top + offset.y, viewport)
      geometry.current = { left: position.left, top: position.top, baseLeft: base.left, baseTop: base.top }

      const cells = []
      for (const row of LAYOUT) {
        for (const id of row) {
          if (id === 'grip') {
            cells.push(h('button', {
              key: 'grip',
              type: 'button',
              className: 'dsh-terminal-keypad__grip',
              style: { gridArea: 'grip' },
              title: t('aria.drag'),
              'aria-label': t('aria.drag'),
              onPointerDown: startDrag,
              onPointerMove: moveDrag,
              onPointerUp: endDrag,
              onPointerCancel: endDrag,
              onContextMenu: (event) => event.preventDefault(),
            }, h('svg', {
              className: 'dsh-terminal-keypad__arrow',
              viewBox: '0 0 16 16',
              'aria-hidden': 'true',
              focusable: 'false',
            }, [[5, 4], [11, 4], [5, 8], [11, 8], [5, 12], [11, 12]].map(([cx, cy], index) => h('circle', {
              key: index, cx, cy, r: 1.4, fill: 'currentColor',
            })))))
            continue
          }
          const key = KEYS[id]
          const glyph = key.arrow === true
            ? h('svg', {
              className: 'dsh-terminal-keypad__arrow',
              viewBox: '0 0 16 16',
              'aria-hidden': 'true',
              focusable: 'false',
            }, h('path', { d: ARROW_PATHS[id], fill: 'currentColor' }))
            : key.text
          cells.push(h('button', {
            key: id,
            type: 'button',
            className: 'dsh-terminal-keypad__key',
            style: { gridArea: id },
            title: t(key.label),
            'aria-label': t(key.label),
            'aria-pressed': key.sticky === true ? String(armed) : undefined,
            onPointerDown: (event) => {
              event.preventDefault()
              activate(id)
            },
            onContextMenu: (event) => event.preventDefault(),
          }, glyph))
        }
      }

      return createPortal(h(React.Fragment, null,
        h('style', { key: 'style', dangerouslySetInnerHTML: { __html: STYLE } }),
        h('div', {
          key: 'pad',
          className: 'dsh-terminal-keypad',
          role: 'group',
          'aria-label': t('label'),
          'data-terminal-keypad': '',
          style: position,
        }, cells),
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
