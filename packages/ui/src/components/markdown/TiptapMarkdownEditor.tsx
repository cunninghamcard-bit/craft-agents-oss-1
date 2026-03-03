import * as React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Mathematics } from '@tiptap/extension-mathematics'
import { Markdown as OfficialMarkdown } from '@tiptap/markdown'
import { Markdown as LegacyMarkdown } from 'tiptap-markdown'
import { Extension } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { tiptapCodeBlock } from './TiptapCodeBlockView'
import { TiptapBubbleMenus, INLINE_MATH_EDIT_EVENT } from './TiptapBubbleMenus'
import { cn } from '../../lib/utils'
import 'katex/dist/katex.min.css'
import './tiptap-editor.css'

export type MarkdownEngine = 'legacy' | 'official'

// Languages rendered as visual blocks (contentEditable={false} NodeViews)
const VISUAL_LANGUAGES = new Set(['mermaid', 'latex', 'math', 'tex', 'katex'])

/**
 * Plugin that adds an `is-selected` class via Decoration.node() to visual
 * code blocks (mermaid/latex) and inline math when they fall within a range
 * selection (e.g. Cmd+A). This gives a unified block-level highlight instead
 * of the browser highlighting individual text nodes inside SVGs / KaTeX.
 */
const SelectionHighlight = Extension.create({
  name: 'selectionHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('selectionHighlight'),
        props: {
          decorations(state) {
            const { from, to } = state.selection
            if (from === to) return DecorationSet.empty
            if (state.selection instanceof NodeSelection) return DecorationSet.empty

            const decorations: Decoration[] = []
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (node.type.name === 'codeBlock') {
                const lang = (node.attrs.language as string | undefined)?.toLowerCase()
                if (lang && VISUAL_LANGUAGES.has(lang)) {
                  decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-selected' }))
                }
              }
              if (node.type.name === 'inlineMath') {
                decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-selected' }))
              }
            })

            return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty
          },
        },
      }),
    ]
  },
})

function getLegacyMarkdown(editor: { storage: { markdown?: { getMarkdown?: () => string } } }): string {
  return editor.storage.markdown?.getMarkdown?.() ?? ''
}

function getOfficialMarkdown(editor: { getMarkdown?: () => string }): string {
  return editor.getMarkdown?.() ?? ''
}

function forceShikiDecorations(editor: any) {
  try {
    if (editor?.isDestroyed) return
    const tr = editor.view?.state.tr.setMeta('shikiPluginForceDecoration', true)
    if (tr) {
      editor.view?.dispatch(tr)
    }
  } catch {
    // Best-effort refresh only.
  }
}

function scheduleShikiRefresh(editor: any) {
  forceShikiDecorations(editor)

  for (const delay of [80, 220, 450]) {
    setTimeout(() => {
      forceShikiDecorations(editor)
    }, delay)
  }
}

const INLINE_DOUBLE_DOLLAR_REGEX = /\$\$([^\n]+?)\$\$/g
// Currency marker used during official parse to avoid accidental math tokenization.
const CURRENCY_MARKER = '¤'
const CURRENCY_RANGE_REGEX = /\$(\d[\dA-Za-z.,]*\s*[–-]\s*)\$(\d[\dA-Za-z.,]*)/g
const CURRENCY_AMOUNT_REGEX = /\$(\d[\dA-Za-z.,]*)/g

/**
 * Normalize markdown for official TipTap parser:
 * - Keep product policy: users write math with $$...$$
 * - Convert same-line $$...$$ to inline $...$ (TipTap inline math)
 * - Escape currency-like dollars ($100, $2M...) so they don't become inline math nodes
 */
export function preprocessMarkdownForOfficial(markdown: string): string {
  let index = 0
  const placeholders = new Map<string, string>()

  const withPlaceholders = markdown.replace(INLINE_DOUBLE_DOLLAR_REGEX, (_, latex: string) => {
    const key = `@@CA_INLINE_MATH_${index++}@@`
    placeholders.set(key, latex)
    return key
  })

  const rangeProtected = withPlaceholders.replace(
    CURRENCY_RANGE_REGEX,
    (_match, left: string, right: string) => `${CURRENCY_MARKER}${left}${CURRENCY_MARKER}${right}`
  )

  const amountProtected = rangeProtected.replace(
    CURRENCY_AMOUNT_REGEX,
    (_match, amount: string) => `${CURRENCY_MARKER}${amount}`
  )

  return amountProtected.replace(/@@CA_INLINE_MATH_\d+@@/g, (key) => {
    const latex = placeholders.get(key) ?? ''
    return `$${latex}$`
  })
}

/** Undo parser-safety escaping in serialized markdown. */
export function postprocessMarkdownFromOfficial(markdown: string): string {
  return markdown.replaceAll(CURRENCY_MARKER, '$')
}

export interface TiptapMarkdownEditorProps {
  /** Markdown string content */
  content: string
  /** Called when content changes */
  onUpdate?: (markdown: string) => void
  /** Placeholder text when empty */
  placeholder?: string
  className?: string
  /** Whether the editor is editable */
  editable?: boolean
  /**
   * Migration flag for markdown engine foundations.
   * - `legacy`: tiptap-markdown (default for safe rollout)
   * - `official`: @tiptap/markdown + mathematics extension
   */
  markdownEngine?: MarkdownEngine
}

export function TiptapMarkdownEditor({
  content,
  onUpdate,
  placeholder = 'Write something...',
  className,
  editable = true,
  markdownEngine = 'legacy',
}: TiptapMarkdownEditorProps) {
  const onUpdateRef = React.useRef(onUpdate)
  onUpdateRef.current = onUpdate

  // Ref for the editor instance — used by the Mathematics onClick callback
  // which is created at extension-configure time (before useEditor returns).
  const editorRef = React.useRef<ReturnType<typeof useEditor>>(null!)

  const useOfficialMarkdown = markdownEngine === 'official'

  const extensions = React.useMemo(() => {
    const base = [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
      }),
      tiptapCodeBlock.configure({
        themes: { light: 'github-light', dark: 'github-dark' },
      }),
      Placeholder.configure({ placeholder }),
      SelectionHighlight,
    ]

    if (useOfficialMarkdown) {
      return [
        ...base,
        Mathematics.configure({
          inlineOptions: {
            onClick: (_node, pos) => {
              const e = editorRef.current
              if (!e) return
              e.chain().focus().setNodeSelection(pos).run()
              // Emit after selection so BubbleMenu mounts, then the event activates the input
              queueMicrotask(() => (e as any).emit(INLINE_MATH_EDIT_EVENT))
            },
          },
          katexOptions: {
            throwOnError: false,
            strict: false,
          },
        }),
        OfficialMarkdown.configure({
          markedOptions: {
            gfm: true,
          },
        }),
      ]
    }

    return [
      ...base,
      LegacyMarkdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ]
  }, [placeholder, useOfficialMarkdown])

  const initialContent = useOfficialMarkdown
    ? preprocessMarkdownForOfficial(content)
    : content

  const editor = useEditor({
    extensions,
    content: initialContent,
    ...(useOfficialMarkdown ? { contentType: 'markdown' as const } : {}),
    editable,
    editorProps: {
      attributes: {
        class: 'tiptap-prose outline-none',
      },
    },
    onCreate: ({ editor }) => {
      queueMicrotask(() => {
        scheduleShikiRefresh(editor)
      })
    },
    onUpdate: ({ editor }) => {
      const md = useOfficialMarkdown
        ? postprocessMarkdownFromOfficial(getOfficialMarkdown(editor as { getMarkdown?: () => string }))
        : getLegacyMarkdown(editor as { storage: { markdown?: { getMarkdown?: () => string } } })
      onUpdateRef.current?.(md)
    },
  }, [useOfficialMarkdown, extensions])

  // Keep editorRef in sync for the Mathematics onClick callback
  editorRef.current = editor

  // Enter on a selected inline math node → open the edit popover
  // Uses capture-phase DOM listener so it fires before ProseMirror's own keydown handler.
  // Calling preventDefault() causes ProseMirror to skip processing the key entirely.
  React.useEffect(() => {
    if (!editor || !editable) return
    const dom = editor.view.dom
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      const { selection } = editor.state
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'inlineMath') return
      e.preventDefault()
      ;(editor as any).emit(INLINE_MATH_EDIT_EVENT)
    }
    dom.addEventListener('keydown', handler, true)
    return () => dom.removeEventListener('keydown', handler, true)
  }, [editor, editable])

  // Sync editable prop
  React.useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  // Sync content when the selected task changes (key prop handles this,
  // but as a safety net for direct content prop changes)
  const prevContentRef = React.useRef(content)
  React.useEffect(() => {
    if (editor && content !== prevContentRef.current) {
      prevContentRef.current = content

      const currentMd = useOfficialMarkdown
        ? postprocessMarkdownFromOfficial(getOfficialMarkdown(editor as { getMarkdown?: () => string }))
        : getLegacyMarkdown(editor as { storage: { markdown?: { getMarkdown?: () => string } } })

      if (currentMd !== content) {
        if (useOfficialMarkdown) {
          const normalized = preprocessMarkdownForOfficial(content)
          editor.commands.setContent(normalized, { contentType: 'markdown' } as never)
        } else {
          editor.commands.setContent(content)
        }

        queueMicrotask(() => {
          if (!editor.isDestroyed) {
            scheduleShikiRefresh(editor)
          }
        })
      }
    }
  }, [editor, content, useOfficialMarkdown])

  return (
    <div className={cn('tiptap-editor', className)}>
      <EditorContent editor={editor} />
      {editor && editable && <TiptapBubbleMenus editor={editor} />}
    </div>
  )
}
