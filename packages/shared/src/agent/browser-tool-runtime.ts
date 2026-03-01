import type {
  BrowserConsoleArgs,
  BrowserDownloadsArgs,
  BrowserNetworkArgs,
  BrowserPaneFns,
  BrowserScreenshotRegionArgs,
  BrowserWaitArgs,
} from './browser-tools.ts';

export interface BrowserCommandImage {
  data: string;
  mimeType: 'image/png' | 'image/jpeg';
  sizeBytes: number;
}

export interface BrowserCommandResult {
  output: string;
  appendReleaseHint: boolean;
  image?: BrowserCommandImage;
}

export function getBrowserToolHelp(): string {
  return [
    'browser_tool command help',
    '',
    'Usage:',
    '  --help',
    '  open [--foreground|-f]                         open browser (background by default)',
    '  navigate <url>',
    '  snapshot',
    '  click <ref> [none|navigation|network-idle] [timeoutMs]',
    '  click-at <x> <y>                               click at pixel coordinates (canvas elements)',
    '  fill <ref> <value>',
    '  type <text>                                    type into focused element (no ref needed)',
    '  select <ref> <value>',
    '  set-clipboard <text>                           write text to page clipboard',
    '  get-clipboard                                  read clipboard text content',
    '  paste <text>                                   set clipboard + trigger Ctrl/Cmd+V',
    '  screenshot',
    '  screenshot-region <x> <y> <width> <height>',
    '  screenshot-region --ref <@eN> [--padding <px>]',
    '  screenshot-region --selector <css-selector> [--padding <px>]',
    '  console [limit] [level]',
    '  window-resize <width> <height>',
    '  network [limit] [status]',
    '  wait <selector|text|url|network-idle> <value?> [timeoutMs]',
    '  key <key> [modifiers]',
    '  downloads [list|wait] [limit|timeoutMs]',
    '  scroll <up|down|left|right> [amount]',
    '  back',
    '  forward',
    '  evaluate <expression>',
    '  focus [windowId]                               focus existing browser window (no new window)',
    '  windows',
    '  release                                        dismiss agent overlay (user keeps browsing)',
    '  close                                          close & destroy the browser window',
    '  hide                                           hide the window (keeps state, "open" re-shows)',
    '',
    'Examples:',
    '  navigate https://example.com',
    '  click @e12',
    '  click-at 350 200',
    '  fill @e5 user@example.com',
    '  type Hello World',
    '  set-clipboard Name\\tAge\\nAlice\\t30',
    '  get-clipboard',
    '  paste Name\\tAge\\nAlice\\t30',
    '  scroll down 800',
    '  evaluate document.title',
    '  screenshot-region --ref @e9 --padding 12',
    '  screenshot-region --selector div[data-testid="chart"]',
    '  console 100 warn',
    '  window-resize 1280 720',
    '  network 50 failed',
    '  wait network-idle 8000',
    '  key Enter',
    '  downloads wait 15000',
    '  focus',
    '  focus browser-1',
    '  windows',
  ].join('\n');
}

export async function executeBrowserToolCommand(args: {
  command: string;
  fns: BrowserPaneFns;
  sessionId: string;
  platform?: NodeJS.Platform;
}): Promise<BrowserCommandResult> {
  const trimmed = args.command.trim();
  if (!trimmed) {
    throw new Error('Missing command. Use "--help" to see supported browser_tool commands.');
  }

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    return { output: getBrowserToolHelp(), appendReleaseHint: false };
  }

  const { fns } = args;

  if (cmd === 'open') {
    const foreground = parts.includes('--foreground') || parts.includes('-f');
    const result = await fns.openPanel({ background: !foreground });
    const mode = foreground ? 'foreground' : 'background';
    return { output: `Opened in-app browser window in ${mode} (instance: ${result.instanceId})`, appendReleaseHint: true };
  }

  if (cmd === 'navigate') {
    const url = parts.slice(1).join(' ').trim();
    if (!url) throw new Error('navigate requires a URL. Example: navigate https://example.com');
    const result = await fns.navigate(url);
    return { output: `Navigated to: ${result.url}\nTitle: ${result.title}`, appendReleaseHint: true };
  }

  if (cmd === 'snapshot') {
    const snapshot = await fns.snapshot();
    const lines: string[] = [
      `URL: ${snapshot.url}`,
      `Title: ${snapshot.title}`,
      '',
      `Elements (${snapshot.nodes.length}):`,
    ];
    for (const node of snapshot.nodes) {
      let line = `  ${node.ref} [${node.role}] "${node.name}"`;
      if (node.value !== undefined) line += ` value="${node.value}"`;
      if (node.focused) line += ' (focused)';
      if (node.checked) line += ' (checked)';
      if (node.disabled) line += ' (disabled)';
      if (node.description) line += ` — ${node.description}`;
      lines.push(line);
    }
    return { output: lines.join('\n'), appendReleaseHint: true };
  }

  if (cmd === 'click') {
    const ref = parts[1];
    if (!ref) throw new Error('click requires a ref. Example: click @e1');
    const waitForRaw = parts[2] as 'none' | 'navigation' | 'network-idle' | undefined;
    const timeoutRaw = parts[3];
    const waitFor = waitForRaw && ['none', 'navigation', 'network-idle'].includes(waitForRaw)
      ? waitForRaw
      : undefined;
    if (waitForRaw && !waitFor) {
      throw new Error('click waitFor must be one of: none, navigation, network-idle');
    }
    const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
    if (timeoutRaw && Number.isNaN(timeoutMs)) {
      throw new Error(`Invalid click timeout "${timeoutRaw}". Expected a number.`);
    }
    await fns.click(ref, { waitFor, timeoutMs });
    return { output: `Clicked element ${ref}${waitFor ? ` (waitFor=${waitFor})` : ''}`, appendReleaseHint: true };
  }

  if (cmd === 'click-at') {
    const xRaw = parts[1];
    const yRaw = parts[2];
    if (!xRaw || !yRaw) throw new Error('click-at requires x and y coordinates. Example: click-at 350 200');
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      throw new Error('click-at coordinates must be numbers. Example: click-at 350 200');
    }
    await fns.clickAt(x, y);
    return { output: `Clicked at coordinates (${x}, ${y})`, appendReleaseHint: true };
  }

  if (cmd === 'fill') {
    const ref = parts[1];
    const value = parts.slice(2).join(' ');
    if (!ref || value === undefined) throw new Error('fill requires ref and value. Example: fill @e5 hello world');
    await fns.fill(ref, value);
    return { output: `Filled element ${ref} with "${value}"`, appendReleaseHint: true };
  }

  if (cmd === 'type') {
    const text = parts.slice(1).join(' ');
    if (!text) throw new Error('type requires text. Example: type Hello World');
    await fns.type(text);
    return { output: `Typed ${text.length} characters into focused element`, appendReleaseHint: true };
  }

  if (cmd === 'select') {
    const ref = parts[1];
    const value = parts.slice(2).join(' ');
    if (!ref || !value) throw new Error('select requires ref and value. Example: select @e3 optionValue');
    await fns.select(ref, value);
    return { output: `Selected "${value}" in element ${ref}`, appendReleaseHint: true };
  }

  if (cmd === 'set-clipboard') {
    const text = parts.slice(1).join(' ');
    if (!text) throw new Error('set-clipboard requires text. Example: set-clipboard Hello World');
    await fns.setClipboard(text);
    return { output: `Clipboard set (${text.length} characters)`, appendReleaseHint: true };
  }

  if (cmd === 'get-clipboard') {
    const text = await fns.getClipboard();
    return { output: text || '(empty clipboard)', appendReleaseHint: true };
  }

  if (cmd === 'paste') {
    const text = parts.slice(1).join(' ');
    if (!text) throw new Error('paste requires text. Example: paste Hello World');
    await fns.setClipboard(text);
    const platform = args.platform ?? process.platform;
    const isMac = platform === 'darwin';
    await fns.sendKey({ key: 'v', modifiers: [isMac ? 'meta' : 'control'] });
    return { output: `Pasted ${text.length} characters`, appendReleaseHint: true };
  }

  if (cmd === 'screenshot') {
    const useJpeg = parts.includes('--jpeg') || parts.includes('--jpg');
    const format = useJpeg ? 'jpeg' as const : 'png' as const;
    const result = await fns.screenshot({ format });
    const buf = result.imageBuffer;
    const base64 = buf.toString('base64');
    if (!buf || buf.length === 0 || !base64) {
      throw new Error('Screenshot capture returned empty image data. Try waiting for page load (browser_tool wait network-idle), then retry browser_tool screenshot.');
    }

    const ext = result.imageFormat === 'jpeg' ? 'JPG' : 'PNG';
    const mimeType = result.imageFormat === 'jpeg' ? 'image/jpeg' as const : 'image/png' as const;
    const lines = [`Screenshot captured (${Math.round(buf.length / 1024)}KB ${ext})`];
    if (result.metadata) {
      lines.push('', 'Metadata:', JSON.stringify(result.metadata, null, 2));
    }

    return {
      output: lines.join('\n'),
      appendReleaseHint: true,
      image: {
        data: base64,
        mimeType,
        sizeBytes: buf.length,
      },
    };
  }

  if (cmd === 'screenshot-region') {
    const rest = parts.slice(1);
    if (rest.length === 0) {
      throw new Error('screenshot-region requires either coordinates, --ref, or --selector.');
    }

    const useJpeg = rest.includes('--jpeg') || rest.includes('--jpg');
    const format = useJpeg ? 'jpeg' as const : 'png' as const;
    // Strip --jpeg/--jpg flags before parsing other args
    const filteredRest = rest.filter((t) => t !== '--jpeg' && t !== '--jpg');

    const parsePadding = (tokens: string[]) => {
      const idx = tokens.findIndex((t) => t === '--padding');
      if (idx === -1) return { padding: undefined as number | undefined, cleaned: tokens };
      const raw = tokens[idx + 1];
      if (!raw) throw new Error('Missing value for --padding');
      const padding = Number(raw);
      if (Number.isNaN(padding)) throw new Error(`Invalid padding "${raw}". Expected a number.`);
      const cleaned = [...tokens.slice(0, idx), ...tokens.slice(idx + 2)];
      return { padding, cleaned };
    };

    const { padding, cleaned } = parsePadding(filteredRest);

    let screenshotArgs: BrowserScreenshotRegionArgs;
    if (cleaned[0] === '--ref') {
      const ref = cleaned[1];
      if (!ref) throw new Error('screenshot-region --ref requires a ref value.');
      screenshotArgs = { ref, padding, format };
    } else if (cleaned[0] === '--selector') {
      const selector = cleaned.slice(1).join(' ').trim();
      if (!selector) throw new Error('screenshot-region --selector requires a CSS selector value.');
      screenshotArgs = { selector, padding, format };
    } else {
      if (cleaned.length < 4) {
        throw new Error('screenshot-region coordinates require: x y width height');
      }
      const [xRaw, yRaw, widthRaw, heightRaw] = cleaned;
      const x = Number(xRaw);
      const y = Number(yRaw);
      const width = Number(widthRaw);
      const height = Number(heightRaw);
      if ([x, y, width, height].some((n) => Number.isNaN(n))) {
        throw new Error('screenshot-region coordinates must be numbers.');
      }
      screenshotArgs = { x, y, width, height, padding, format };
    }

    const result = await fns.screenshotRegion(screenshotArgs);
    const buf = result.imageBuffer;
    const base64 = buf.toString('base64');
    if (!buf || buf.length === 0 || !base64) {
      throw new Error('Region screenshot capture returned empty image data. Try adjusting the region/selector or waiting for page load, then retry browser_tool screenshot-region.');
    }

    const ext = result.imageFormat === 'jpeg' ? 'JPG' : 'PNG';
    const mimeType = result.imageFormat === 'jpeg' ? 'image/jpeg' as const : 'image/png' as const;
    const lines = [`Region screenshot captured (${Math.round(buf.length / 1024)}KB ${ext})`];
    if (result.metadata) {
      lines.push('', 'Metadata:', JSON.stringify(result.metadata, null, 2));
    }

    return {
      output: lines.join('\n'),
      appendReleaseHint: true,
      image: {
        data: base64,
        mimeType,
        sizeBytes: buf.length,
      },
    };
  }

  if (cmd === 'console') {
    const limitRaw = parts[1];
    const levelRaw = parts[2];
    const limit = limitRaw ? Number(limitRaw) : undefined;
    if (limitRaw && Number.isNaN(limit)) {
      throw new Error(`Invalid console limit "${limitRaw}". Expected a number.`);
    }
    const level = (levelRaw ?? 'all') as NonNullable<BrowserConsoleArgs['level']>;
    if (!['all', 'log', 'info', 'warn', 'error'].includes(level)) {
      throw new Error(`Invalid console level "${String(levelRaw)}". Use one of: all, log, info, warn, error.`);
    }

    const entries = await fns.getConsoleLogs({ limit, level });
    const lines: string[] = [`Console entries (${entries.length}):`];
    for (const entry of entries) {
      lines.push(`[${new Date(entry.timestamp).toISOString()}] [${entry.level}] ${entry.message}`);
    }
    return { output: lines.join('\n'), appendReleaseHint: true };
  }

  if (cmd === 'window-resize') {
    const widthRaw = parts[1];
    const heightRaw = parts[2];
    if (!widthRaw || !heightRaw) throw new Error('window-resize requires width and height. Example: window-resize 1280 720');
    const width = Number(widthRaw);
    const height = Number(heightRaw);
    if (Number.isNaN(width) || Number.isNaN(height)) {
      throw new Error('window-resize width and height must be numbers.');
    }
    const resized = await fns.windowResize({ width, height });
    return { output: `Window resized to ${resized.width}x${resized.height}`, appendReleaseHint: true };
  }

  if (cmd === 'network') {
    const limitRaw = parts[1];
    const statusRaw = parts[2] as BrowserNetworkArgs['status'] | undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;
    if (limitRaw && Number.isNaN(limit)) {
      throw new Error(`Invalid network limit "${limitRaw}". Expected a number.`);
    }
    const status = statusRaw ?? 'all';
    if (!['all', 'failed', '2xx', '3xx', '4xx', '5xx'].includes(status)) {
      throw new Error(`Invalid network status "${String(statusRaw)}". Use one of: all, failed, 2xx, 3xx, 4xx, 5xx.`);
    }
    const entries = await fns.getNetworkLogs({ limit, status });
    const lines: string[] = [`Network entries (${entries.length}):`];
    for (const entry of entries) {
      lines.push(`[${new Date(entry.timestamp).toISOString()}] ${entry.method} ${entry.status} ${entry.resourceType} ${entry.url}`);
    }
    return { output: lines.join('\n'), appendReleaseHint: true };
  }

  if (cmd === 'wait') {
    const kind = parts[1] as BrowserWaitArgs['kind'] | undefined;
    if (!kind || !['selector', 'text', 'url', 'network-idle'].includes(kind)) {
      throw new Error('wait requires kind: selector|text|url|network-idle');
    }

    let value: string | undefined;
    let timeoutMs: number | undefined;
    if (kind === 'network-idle') {
      const timeoutRaw = parts[2];
      timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
      if (timeoutRaw && Number.isNaN(timeoutMs)) {
        throw new Error(`Invalid wait timeout "${timeoutRaw}". Expected a number.`);
      }
    } else {
      value = parts[2];
      if (!value) throw new Error(`wait ${kind} requires a value.`);
      const timeoutRaw = parts[3];
      timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
      if (timeoutRaw && Number.isNaN(timeoutMs)) {
        throw new Error(`Invalid wait timeout "${timeoutRaw}". Expected a number.`);
      }
    }

    const result = await fns.waitFor({ kind, value, timeoutMs });
    return { output: `Wait succeeded (${result.kind}) in ${result.elapsedMs}ms — ${result.detail}`, appendReleaseHint: true };
  }

  if (cmd === 'key') {
    const key = parts[1];
    if (!key) throw new Error('key requires key value. Example: key Enter');
    const modifiers = (parts[2] ? parts[2].split('+') : []) as Array<'shift' | 'control' | 'alt' | 'meta'>;
    for (const m of modifiers) {
      if (!['shift', 'control', 'alt', 'meta'].includes(m)) {
        throw new Error(`Invalid key modifier "${m}". Use shift|control|alt|meta`);
      }
    }
    await fns.sendKey({ key, modifiers });
    return { output: `Key sent: ${key}${modifiers.length ? ` (${modifiers.join('+')})` : ''}`, appendReleaseHint: true };
  }

  if (cmd === 'downloads') {
    const actionRaw = parts[1] as BrowserDownloadsArgs['action'] | undefined;
    const action = actionRaw && ['list', 'wait'].includes(actionRaw) ? actionRaw : 'list';
    const valueRaw = parts[2];
    const valueNum = valueRaw ? Number(valueRaw) : undefined;
    if (valueRaw && Number.isNaN(valueNum)) {
      throw new Error(`Invalid downloads numeric value "${valueRaw}".`);
    }
    const entries = await fns.getDownloads({
      action,
      ...(action === 'wait' ? { timeoutMs: valueNum } : { limit: valueNum }),
    });
    const lines: string[] = [`Downloads (${entries.length}):`];
    for (const entry of entries) {
      lines.push(`[${new Date(entry.timestamp).toISOString()}] [${entry.state}] ${entry.filename} (${entry.bytesReceived}/${entry.totalBytes})`);
    }
    return { output: lines.join('\n'), appendReleaseHint: true };
  }

  if (cmd === 'scroll') {
    const direction = parts[1] as 'up' | 'down' | 'left' | 'right' | undefined;
    const amountRaw = parts[2];
    if (!direction || !['up', 'down', 'left', 'right'].includes(direction)) {
      throw new Error('scroll requires direction up|down|left|right. Example: scroll down 800');
    }
    const amount = amountRaw ? Number(amountRaw) : undefined;
    if (amountRaw && Number.isNaN(amount)) {
      throw new Error(`Invalid scroll amount "${amountRaw}". Expected a number.`);
    }
    await fns.scroll(direction, amount);
    return { output: `Scrolled ${direction}${amount != null ? ` by ${amount}px` : ''}`, appendReleaseHint: true };
  }

  if (cmd === 'back') {
    await fns.goBack();
    return { output: 'Navigated back', appendReleaseHint: true };
  }

  if (cmd === 'forward') {
    await fns.goForward();
    return { output: 'Navigated forward', appendReleaseHint: true };
  }

  if (cmd === 'evaluate') {
    const expression = parts.slice(1).join(' ').trim();
    if (!expression) throw new Error('evaluate requires an expression. Example: evaluate document.title');
    const result = await fns.evaluate(expression);
    return {
      output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      appendReleaseHint: true,
    };
  }

  if (cmd === 'focus') {
    const instanceId = parts[1];
    const result = await fns.focusWindow(instanceId);
    return {
      output: `Focused browser window ${result.instanceId}\nTitle: ${result.title || 'New Tab'}\nURL: ${result.url || 'about:blank'}`,
      appendReleaseHint: true,
    };
  }

  if (cmd === 'windows') {
    const windows = await fns.listWindows();
    const lines: string[] = [`Browser windows (${windows.length}):`];

    for (const w of windows) {
      const lockState = w.boundSessionId ? `locked-session(${w.boundSessionId})` : 'unlocked';
      const availableToSession = !w.boundSessionId || w.boundSessionId === args.sessionId;
      lines.push(
        '',
        `- ${w.id}`,
        `  title: ${w.title || 'New Tab'}`,
        `  url: ${w.url || 'about:blank'}`,
        `  visible: ${w.isVisible}`,
        `  ownerType: ${w.ownerType}`,
        `  ownerSessionId: ${w.ownerSessionId ?? 'none'}`,
        `  boundSessionId: ${w.boundSessionId ?? 'none'}`,
        `  lockState: ${lockState}`,
        `  availableToSession: ${availableToSession}`,
        `  agentControlActive: ${!!w.agentControlActive}`,
      );
    }

    return { output: lines.join('\n'), appendReleaseHint: false };
  }

  if (cmd === 'release') {
    await fns.releaseControl();
    return { output: 'Browser control released. Agent overlay dismissed.', appendReleaseHint: false };
  }

  if (cmd === 'close') {
    await fns.closeWindow();
    return { output: 'Browser window closed and destroyed.', appendReleaseHint: false };
  }

  if (cmd === 'hide') {
    await fns.hideWindow();
    return { output: 'Browser window hidden. Use "open" to show it again.', appendReleaseHint: false };
  }

  throw new Error(`Unknown browser_tool command "${cmd}". Use "--help" to see supported commands.`);
}
