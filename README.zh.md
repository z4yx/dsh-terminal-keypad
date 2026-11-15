# dsh-terminal-keypad

[English](README.md) | 中文

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/z4yx/dsh-terminal-keypad)

一个悬浮在 DSH Web 终端上的半透明的按键面板。它补齐手机软键盘没有的
**Esc**、**Tab**、**Ctrl**、**回车**、符号和四个方向键，并支持在
方向键上向外滑动来发送 **Home / End / Page Up / Page Down**。按住中间的 **Esc** 键还可以拖动面板。

![悬浮在终端上方、正好在软键盘上方的按键面板，首次打开时四周显示闪烁的箭头与 Page Up / Home / End / Page Down 标签](doc/Screenshot_2026-11-14.jpg)


## 能做什么

| 格子 | 点按 / 按下 | 按住 | 向外滑动后松开 |
|---|---|---|---|
| **▲ ▼ ◀ ▶** | 移动光标 | 持续移动 | **Page Up / Page Down / Home / End** |
| **Esc** | 发送 Escape | 按住并移动可拖动面板 | — |
| **Tab** | 发送 Tab | — | — |
| **`\|`** | 输入当前符号 | — | 上滑，在符号上松手 |
| **Ctrl** | 选中 Ctrl | — | — |
| **↵** | 发送回车 | — | — |

### 按住方向键连续移动

按住方向键，光标会持续移动：按得越久重复越快，松手立即停止。

### 方向键向外滑动发送功能键

按住方向键并向外滑动，然后松开：

- ▲ → **Page Up**
- ▼ → **Page Down**
- ◀ → **Home**
- ▶ → **End**

滑动过程中键面会显示对应的功能键名称，而且不会先把方向键发出去，所以滑动不会
移动光标或改写你的 shell 历史。

### 在符号键上滑选择其它符号

右上角那个键并不固定是 `|`。在它上面向上滑动会弹出一个常用终端符号选择面板
——管道、重定向、引号、括号、运算符等。手指不要松，继续在面板上滑动：按键会实时
预览手指下的符号。在某个符号上松手，就立即发送它并把它保留为按键的符号；移到面板
之外松手则关闭面板，不发送、也不改变任何设置。普通点按仍然输入当前符号。

### Ctrl 是粘滞修饰键

点一下 **Ctrl**（按键会高亮），接下来的按键会带上 Control：

- 面板上的键变成 **Ctrl+方向键** 或 **Ctrl+`|`**；
- 在终端里输入的字符变成对应的控制键，例如 `c` 变成 Ctrl-C、`m` 变成回车、
  `z` 变成 Ctrl-Z。

Ctrl 用过一次后自动复位，再点一次可取消。焦点在终端以外时完全不拦截输入。

### 新手提示

面板第一次出现时，会在它周围直接画出会缓慢闪烁的「书名号」式双箭头：四个方向键
外侧分别标出 **Page Up / Home / End / Page Down**，符号键上方标出**符号**。
点面板左上角的「× 知道了」后就不再出现。

### 随处移动

按住中间的 **Esc** 键拖动即可。手指移动超过几个像素后，这次按压就变成拖动，
不会再发送 Escape；只点按则照常发送 Escape。面板跟随手指、始终留在屏幕内
（包括避开软键盘），并记住你放的位置。

## 外观

面板要盖在实时滚动的终端文字上，所以刻意做得尽量不遮挡：按键只有很淡的底色而不是
一整块面板，底下的文字保持清晰，描边则让按键依然好找。它跟随 DSH 主题，亮色、暗色
和自定义主题设置都会生效。

它只在页面上确实有终端画面时出现，默认贴在终端右下角；切到右侧边栏的其他标签时会
自动消失。

## 安装

本包是一个 DSH bundle，把目录安装到当前 profile 即可：

```text
plugin_manager  action=install_bundle  target=/absolute/path/to/terminal-keypad
```

profile 以链接方式引用这个目录，因此**移动目录会让安装失效**；移动后请从新路径
重新安装。

卸载：

```text
plugin_manager  action=remove_bundle  target=dsh-terminal-keypad
```

## 实现说明

<details>
<summary>技术细节</summary>

- `index.js` 是 Host 半边，只有一个空的 `apply()`，作用是让 bundle 行有一个
  Host 激活点；所有行为都在 `client.js`。
- `client.js` 向 `shell.overlay` 槽注册一个条目（id 为 `terminal-keypad`），并把
  DOM 通过 portal 挂到 `document.body`：overlay 层是 `z-index: 20`，低于全屏右侧
  面板的 `z-index: 40`。
- 方向键、Home/End、PageUp/PageDown 以**按键事件**投递给终端自己的 xterm
  textarea，而不是写死字节，这样 xterm 会按当前屏幕的 cursor-key 模式发送。
  `less`、`vim` 会打开 DECCKM（application cursor keys），此时它们期望 `ESC O A`；
  固定发 `ESC [ A` 会被它们忽略。
- 其余按键的输入通过公开的 Client 终端服务发送：
  `ctx.webTerminals.view(sessionId, tabId, contentId).write(data)`。它复用侧栏终端
  自身已缓存的 view，不会创建第二个 attachment；当另一个页面占用输入时写入会被
  静默丢弃（终端自己的 "take control" 约定）。
- 可见性与位置来自对真实 `.xterm` 画面的测量（`getBoundingClientRect` 与可视区
  求交，再用 `elementFromPoint` 做命中测试），在手势发生时和每 500ms 轮询一次，
  因此收起再展开右侧边栏后，面板总能重新出现。

### 发送的字节

| 按键 | 字节 |
|---|---|
| Esc | `ESC` |
| Tab | `\t` |
| 回车 | `\r` |
| `\|` | 按键当前持有的符号（默认 `\|`） |
| ▲ ▼ ◀ ▶ | `ESC[A`…`ESC[D`；DECCKM 下为 `ESC OA`…`ESC OD` |
| Ctrl + 方向键 | `ESC[1;5A` … `ESC[1;5D` |
| Ctrl + `\|` | 该符号对应的控制字节（`\|` 为 `0x1C`） |
| Home / End | `ESC[H` / `ESC[F`；DECCKM 下为 `ESC OH` / `ESC OF` |
| Page Up / Page Down | `ESC[5~` / `ESC[6~` |

### 粘滞 Ctrl 的字符转换

在已聚焦的终端里输入的下一个字符会转换为控制字节：
`a`–`z` → `0x01`–`0x1A`、`[` → `ESC`、`]` → `0x1D`、`^` → `0x1E`、`_` → `0x1F`、
`@` → `0x00`、`?` → `0x7F`。用 `keydown` 捕获处理物理键盘与软键盘，并对拿不到
有效按键的输入法再补一层 `beforeinput` 兜底。

### 可调参数

`client.js` 顶部的常量：

| 常量 | 值 | 含义 |
|---|---|---|
| `CELL` / `GAP` / `INSET` | 36 / 5 / 12 | 键格尺寸、间距、默认边距（px） |
| `TAP_GRACE` | 90 ms | 方向键发送前的等待，让滑动可以取而代之 |
| `SWIPE_DISTANCE` | 13 px | 触发功能键的向外滑动距离 |
| `DRAG_DISTANCE` | 8 px | 把中间键的按压变成拖动所需的移动距离 |
| `REPEAT_DELAY` | 420 ms | 按住方向键后首次重复的延迟 |
| `REPEAT_START` / `REPEAT_MIN` | 160 / 80 ms | 首次重复间隔 / 最快间隔 |
| `REPEAT_ACCEL` | 0.85 | 每次重复的间隔乘数 |
| `OFFSET_KEY` | `dsh-terminal-keypad:offset.v1` | 拖动偏移的 `localStorage` 键 |
| `SYMBOL_KEY` | `dsh-terminal-keypad:symbol.v1` | 所选符号的 `localStorage` 键 |
| `HINT_KEY` | `dsh-terminal-keypad:hint.v1` | 新手提示已关闭的 `localStorage` 键 |

</details>

## 文件

| 文件 | 用途 |
|---|---|
| `client.js` | 全部功能：面板、手势、输入 |
| `index.js` | Host 激活占位 |
| `cordis.patch.yml` | 插入 `terminal-keypad` Host 行 |
| `package.json` | 清单与 `dsh.client` 声明 |
| `locale/en.json`、`locale/zh.json` | 插件管理页的标题与描述 |
| `icon.svg` | 插件图标 |
| `doc/Screenshot_2026-11-14.jpg` | 上面的截图 |

## 许可

MIT，见 [LICENSE](LICENSE)。
