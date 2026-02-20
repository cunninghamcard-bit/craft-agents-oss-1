import { Type } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import TurndownService from 'turndown';
import { parse as parseHtml } from 'node-html-parser';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const schema = Type.Object({
  url: Type.String({ description: 'URL to fetch' }),
  prompt: Type.Optional(
    Type.String({
      description:
        'What to extract from the page (optional — returns full content if omitted)',
    }),
  ),
});

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Remove noise elements
turndown.remove([
  'script',
  'style',
  'nav',
  'footer',
  'header',
  'aside',
  'noscript',
  'iframe',
]);

const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TEXT_LENGTH = 50_000;

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

function result(text: string, isError = false): AgentToolResult<typeof schema> {
  return {
    content: [{ type: 'text', text }],
    details: isError ? { isError: true } : {},
  };
}

// ============================================================
// Content-type handlers
// ============================================================

function ensurePdfjsPolyfills(): void {
  // pdfjs-dist uses browser-only APIs at module scope (e.g. `const SCALE_MATRIX = new DOMMatrix()`).
  // Provide minimal stubs so it can load in Node.js — only text extraction is used, not rendering.
  if (typeof globalThis.DOMMatrix === 'undefined') {
    (globalThis as any).DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      m11 = 1; m12 = 0; m13 = 0; m14 = 0;
      m21 = 0; m22 = 1; m23 = 0; m24 = 0;
      m31 = 0; m32 = 0; m33 = 1; m34 = 0;
      m41 = 0; m42 = 0; m43 = 0; m44 = 1;
      is2D = true;
      constructor(init?: any) {
        if (Array.isArray(init) && init.length >= 6) {
          this.a = init[0]; this.b = init[1]; this.c = init[2];
          this.d = init[3]; this.e = init[4]; this.f = init[5];
        }
      }
      multiply() { return new (globalThis as any).DOMMatrix(); }
      preMultiplySelf() { return this; }
      invertSelf() { return this; }
      translate() { return new (globalThis as any).DOMMatrix(); }
      scale() { return new (globalThis as any).DOMMatrix(); }
      transformPoint(p: any) { return p || { x: 0, y: 0 }; }
      static fromMatrix() { return new (globalThis as any).DOMMatrix(); }
    };
  }
  if (typeof globalThis.Path2D === 'undefined') {
    (globalThis as any).Path2D = class Path2D {
      addPath() {}
    };
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  ensurePdfjsPolyfills();
  // Pre-load worker on the main thread so pdfjs-dist doesn't try to resolve
  // pdf.worker.mjs from disk (fails when externalized via bun build).
  if (!(globalThis as any).pdfjsWorker) {
    (globalThis as any).pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs');
  }
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item: any) => 'str' in item)
      .map((item: any) => item.str)
      .join(' ');
    if (text.trim()) pages.push(`--- Page ${i} ---\n${text}`);
  }
  return pages.join('\n\n');
}

function handlePdf(
  buffer: Buffer,
  url: string,
  saveBinary: (buffer: Buffer, url: string, ext: string) => string,
): Promise<AgentToolResult<typeof schema>> {
  const savedPath = saveBinary(buffer, url, '.pdf');

  return extractPdfText(buffer).then((text) => {
    if (!text.trim()) {
      return result(
        `PDF from ${url} (saved to ${savedPath})\n\nNo extractable text (likely scanned/image-based).`,
      );
    }

    const truncated =
      text.length > MAX_TEXT_LENGTH
        ? text.slice(0, MAX_TEXT_LENGTH) + '\n\n[Content truncated]'
        : text;

    return result(`PDF content from ${url} (saved to ${savedPath}):\n\n${truncated}`);
  });
}

function handleImage(
  buffer: Buffer,
  url: string,
  contentType: string,
  saveBinary: (buffer: Buffer, url: string, ext: string) => string,
): AgentToolResult<typeof schema> {
  const ext = MIME_TO_EXT[contentType] || '.bin';
  const savedPath = saveBinary(buffer, url, ext);
  const sizeKb = Math.round(buffer.length / 1024);

  return result(
    `Image downloaded from ${url}\nType: ${contentType}, Size: ${sizeKb}KB\n` +
      `Saved to: ${savedPath}\n\nUse the Read tool to view this image.`,
  );
}

function handleHtml(
  html: string,
  url: string,
  prompt: string | undefined,
): AgentToolResult<typeof schema> {
  const root = parseHtml(html);
  root
    .querySelectorAll('script, style, nav, footer, noscript, iframe, svg')
    .forEach((el) => el.remove());

  const mainContent =
    root.querySelector('main, article, [role="main"], .content, #content') ||
    root.querySelector('body') ||
    root;

  const markdown = turndown.turndown(mainContent.innerHTML);

  const truncated =
    markdown.length > MAX_TEXT_LENGTH
      ? markdown.slice(0, MAX_TEXT_LENGTH) + '\n\n[Content truncated]'
      : markdown;

  const prefix = prompt
    ? `Content from ${url} (asked: "${prompt}"):\n\n`
    : `Content from ${url}:\n\n`;

  return result(prefix + truncated);
}

function handleJson(
  raw: string,
  url: string,
): AgentToolResult<typeof schema> {
  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    formatted = raw;
  }
  const truncated =
    formatted.length > MAX_TEXT_LENGTH
      ? formatted.slice(0, MAX_TEXT_LENGTH) + '\n\n[Truncated]'
      : formatted;

  return result(`JSON from ${url}:\n\n${truncated}`);
}

function handleText(
  raw: string,
  url: string,
): AgentToolResult<typeof schema> {
  const truncated =
    raw.length > MAX_TEXT_LENGTH
      ? raw.slice(0, MAX_TEXT_LENGTH) + '\n\n[Content truncated]'
      : raw;

  return result(`Content from ${url}:\n\n${truncated}`);
}

// ============================================================
// Factory
// ============================================================

export function createWebFetchTool(
  getSessionPath: () => string | null,
): AgentTool<typeof schema> {
  function saveBinary(buffer: Buffer, url: string, ext: string): string {
    const sessionPath = getSessionPath();
    if (!sessionPath) return '(no session path — file not saved)';
    const dir = join(sessionPath, 'long_responses');
    mkdirSync(dir, { recursive: true });
    const urlName = new URL(url).pathname.split('/').pop() || '';
    const safe =
      urlName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'download';
    const file = `${Date.now()}_web_fetch_${safe}${ext}`;
    const abs = join(dir, file);
    writeFileSync(abs, buffer);
    return abs;
  }

  return {
    name: 'web_fetch',
    label: 'Web Fetch',
    description:
      'Fetch a URL and extract its content. Handles HTML (→ markdown), PDF (→ extracted text), images (→ saved to disk), JSON (→ pretty-printed), and plain text.',
    parameters: schema,
    async execute(toolCallId, params) {
      const { url, prompt } = params;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CraftAgent/1.0)',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        return result(
          `Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`,
          true,
        );
      }

      // Size guard
      const contentLength = parseInt(
        response.headers.get('content-length') || '0',
        10,
      );
      if (contentLength > MAX_DOWNLOAD_SIZE) {
        return result(
          `File too large (${Math.round(contentLength / 1024 / 1024)}MB). Max: 50MB.`,
          true,
        );
      }

      const contentType = (response.headers.get('content-type') || '')
        .toLowerCase()
        .split(';')[0]
        .trim();

      // PDF — extract text with pdfjs-dist
      if (contentType === 'application/pdf') {
        const buffer = Buffer.from(await response.arrayBuffer());
        return handlePdf(buffer, url, saveBinary);
      }

      // Image — save to disk, return metadata
      if (contentType.startsWith('image/')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        return handleImage(buffer, url, contentType, saveBinary);
      }

      // From here, read as text
      const text = await response.text();

      // HTML — parse and convert to markdown
      if (contentType.includes('html')) {
        return handleHtml(text, url, prompt);
      }

      // JSON — pretty-print
      if (
        contentType === 'application/json' ||
        contentType.endsWith('+json')
      ) {
        return handleJson(text, url);
      }

      // Everything else — plain text
      return handleText(text, url);
    },
  };
}
