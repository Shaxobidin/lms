/**
 * Maqsad: Moodle (Atto/TinyMCE) uslubidagi WYSIWYG muharrir — dars matni,
 * element tavsifi, savol matni va forum xabari uchun (F-04, F-05, F-07).
 *
 * TipTap (ProseMirror) asosida. Chiqish — HTML; server baribir DOMPurify bilan
 * tozalaydi (§11), shuning uchun bu yerda "xavfsiz HTML" kafolati talab qilinmaydi.
 *
 * Rasmlar: fayl S3 ga yuklanadi (presign → PUT → complete), matnga
 * `src="/lms-file/<id>"` yoziladi — `LessonHtml` ko'rsatishda imzolangan
 * havolaga almashtiradi. Muharrir ichida ham shu yechim ishlatiladi (node view).
 *
 * "HTML" tugmasi — manba ko'rinishi: tajribali foydalanuvchi to'g'ridan-to'g'ri
 * teglar bilan ishlaydi (Moodle dagi `<>` tugmasi).
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Code2,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText } from '@lms/shared';
import { LOCALES } from '@lms/shared';
import { uploadFile } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { resolveFileUrl } from '@/components/course/lesson-html';
import { Button, Input, Label, Textarea } from '@/components/ui/primitives';

/** Xususiy fayl rasmi: muharrirda ham imzolangan havola bilan ko'rsatiladi. */
const LmsImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img');
      img.className = 'my-3 max-w-full rounded-md';
      img.alt = String(node.attrs.alt ?? '');
      const apply = (src: string) => {
        const match = /^\/lms-file\/([0-9a-f-]{36})/i.exec(src);
        if (match) {
          void resolveFileUrl(match[1]!).then((url) => {
            if (url) img.src = url;
          });
        } else {
          img.src = src;
        }
      };
      apply(String(node.attrs.src ?? ''));
      return {
        dom: img,
        update: (updated) => {
          if (updated.type.name !== 'image') return false;
          apply(String(updated.attrs.src ?? ''));
          img.alt = String(updated.attrs.alt ?? '');
          return true;
        },
      };
    };
  },
});

export interface RichTextEditorProps {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  /** Rasm yuklashda fayl qaysi kursga tegishli (ruxsat va limit uchun). */
  courseId?: string;
  placeholder?: string;
  /** Minimal balandlik (piksel). */
  minHeight?: number;
  disabled?: boolean;
}

export function RichTextEditor({
  id,
  value,
  onChange,
  courseId,
  placeholder,
  minHeight = 220,
  disabled = false,
}: RichTextEditorProps) {
  const t = useTranslations();
  const [sourceMode, setSourceMode] = useState(false);
  const [source, setSource] = useState(value);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef(value);

  const editor = useEditor({
    // Next.js SSR: birinchi chizish serverda emas — gidratsiya farqi bo'lmasin
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      LmsImage.configure({ inline: false, allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value,
    onUpdate: ({ editor: instance }) => {
      const html = instance.isEmpty ? '' : instance.getHTML();
      lastEmitted.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'prose-lms min-h-[var(--editor-min-h)] px-3 py-2 outline-none',
        ...(id ? { id } : {}),
      },
    },
  });

  // Tashqaridan qiymat o'zgarsa (masalan, boshqa til tanlandi) — muharrir yangilanadi
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      bold: instance?.isActive('bold') ?? false,
      italic: instance?.isActive('italic') ?? false,
      underline: instance?.isActive('underline') ?? false,
      strike: instance?.isActive('strike') ?? false,
      h2: instance?.isActive('heading', { level: 2 }) ?? false,
      h3: instance?.isActive('heading', { level: 3 }) ?? false,
      paragraph: instance?.isActive('paragraph') ?? false,
      bullet: instance?.isActive('bulletList') ?? false,
      ordered: instance?.isActive('orderedList') ?? false,
      quote: instance?.isActive('blockquote') ?? false,
      codeBlock: instance?.isActive('codeBlock') ?? false,
      link: instance?.isActive('link') ?? false,
      table: instance?.isActive('table') ?? false,
      left: instance?.isActive({ textAlign: 'left' }) ?? false,
      center: instance?.isActive({ textAlign: 'center' }) ?? false,
      right: instance?.isActive({ textAlign: 'right' }) ?? false,
      canUndo: instance?.can().undo() ?? false,
      canRedo: instance?.can().redo() ?? false,
    }),
  });

  const insertImage = async (file: File) => {
    if (!editor) return;
    try {
      const uploaded = await uploadFile(file, { purpose: 'COURSE_CONTENT', courseId });
      editor
        .chain()
        .focus()
        .setImage({ src: `/lms-file/${uploaded.fileObjectId}`, alt: file.name })
        .run();
    } catch {
      toast.error(t('editor.imageUploadFailed'));
    }
  };

  const applyLink = () => {
    if (!editor || linkDraft === null) return;
    const href = linkDraft.trim();
    if (!href) editor.chain().focus().unsetLink().run();
    else if (/^(https?:|mailto:|tel:|\/|#)/i.test(href)) {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    } else {
      toast.error(t('editor.linkInvalid'));
      return;
    }
    setLinkDraft(null);
  };

  const toggleSource = () => {
    if (!editor) return;
    if (sourceMode) {
      editor.commands.setContent(source, { emitUpdate: true });
      setSourceMode(false);
    } else {
      setSource(editor.isEmpty ? '' : editor.getHTML());
      setSourceMode(true);
    }
  };

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring',
        disabled && 'opacity-60',
      )}
      style={{ ['--editor-min-h' as string]: `${minHeight}px` }}
    >
      <div
        role="toolbar"
        aria-label={t('editor.toolbar')}
        className="flex flex-wrap items-center gap-0.5 border-b border-border p-1"
      >
        <ToolButton
          label={t('editor.undo')}
          disabled={!state?.canUndo || sourceMode}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.redo')}
          disabled={!state?.canRedo || sourceMode}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 className="size-4" />
        </ToolButton>
        <Separator />
        <ToolButton
          label={t('editor.paragraph')}
          active={state?.paragraph}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().setParagraph().run()}
        >
          <Pilcrow className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.heading2')}
          active={state?.h2}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.heading3')}
          active={state?.h3}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="size-4" />
        </ToolButton>
        <Separator />
        <ToolButton
          label={t('editor.bold')}
          active={state?.bold}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.italic')}
          active={state?.italic}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.underline')}
          active={state?.underline}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.strike')}
          active={state?.strike}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-4" />
        </ToolButton>
        <Separator />
        <ToolButton
          label={t('editor.bulletList')}
          active={state?.bullet}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.orderedList')}
          active={state?.ordered}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.quote')}
          active={state?.quote}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.codeBlock')}
          active={state?.codeBlock}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          <Code className="size-4" />
        </ToolButton>
        <Separator />
        <ToolButton
          label={t('editor.alignLeft')}
          active={state?.left}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().setTextAlign('left').run()}
        >
          <AlignLeft className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.alignCenter')}
          active={state?.center}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().setTextAlign('center').run()}
        >
          <AlignCenter className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.alignRight')}
          active={state?.right}
          disabled={sourceMode}
          onClick={() => editor?.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight className="size-4" />
        </ToolButton>
        <Separator />
        <ToolButton
          label={t('editor.link')}
          active={state?.link}
          disabled={sourceMode}
          onClick={() =>
            setLinkDraft(
              linkDraft === null
                ? ((editor?.getAttributes('link').href as string | undefined) ?? '')
                : null,
            )
          }
        >
          <Link2 className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.image')}
          disabled={sourceMode}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus className="size-4" />
        </ToolButton>
        <ToolButton
          label={t('editor.table')}
          active={state?.table}
          disabled={sourceMode}
          onClick={() =>
            state?.table
              ? editor?.chain().focus().addRowAfter().run()
              : editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <TableIcon className="size-4" />
        </ToolButton>
        {state?.table ? (
          <ToolButton
            label={t('editor.deleteTable')}
            disabled={sourceMode}
            onClick={() => editor?.chain().focus().deleteTable().run()}
          >
            <Trash2 className="size-4" />
          </ToolButton>
        ) : null}
        <Separator />
        <ToolButton label={t('editor.source')} active={sourceMode} onClick={toggleSource}>
          <Code2 className="size-4" />
        </ToolButton>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          aria-label={t('editor.image')}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void insertImage(file);
          }}
        />
      </div>

      {linkDraft !== null ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 p-2">
          <Label htmlFor={`${id ?? 'editor'}-link`} className="text-xs">
            {t('editor.linkUrl')}
          </Label>
          <Input
            id={`${id ?? 'editor'}-link`}
            className="h-8 flex-1"
            placeholder="https://"
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyLink();
              }
            }}
          />
          <Button size="sm" onClick={applyLink}>
            {t('common.save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLinkDraft(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : null}

      {sourceMode ? (
        <Textarea
          aria-label={t('editor.source')}
          className="min-h-[var(--editor-min-h)] rounded-none border-0 font-mono text-xs focus-visible:ring-0"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}

function Separator() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />;
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? false}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40',
        active && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Ko'p tilli boy matn: til yorliqlari + faol til uchun muharrir.
 * Asosiy til (uz-Latn) birinchi; qolgan tillar bo'sh qolsa `resolveLocalized`
 * zaxira tilga tushadi.
 */
export function LocalizedRichField({
  idPrefix,
  label,
  value,
  onChange,
  courseId,
  required = false,
  minHeight,
  hint,
}: {
  idPrefix: string;
  label: string;
  value: LocalizedText;
  onChange: (next: LocalizedText) => void;
  courseId?: string;
  required?: boolean;
  minHeight?: number;
  hint?: string;
}) {
  const [active, setActive] = useState<(typeof LOCALES)[number]>(LOCALES[0]);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={`${idPrefix}-${active}`} required={required}>
          {label}
        </Label>
        <div role="tablist" className="flex gap-1">
          {LOCALES.map((locale) => (
            <button
              key={locale}
              type="button"
              role="tab"
              aria-selected={active === locale}
              onClick={() => setActive(locale)}
              className={cn(
                'rounded-md px-2 py-0.5 text-xs uppercase',
                active === locale
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
                value[locale]?.trim() && active !== locale && 'font-semibold text-foreground',
              )}
            >
              {locale}
            </button>
          ))}
        </div>
      </div>
      <RichTextEditor
        key={active}
        id={`${idPrefix}-${active}`}
        value={value[active] ?? ''}
        onChange={(html) => onChange({ ...value, [active]: html })}
        courseId={courseId}
        minHeight={minHeight}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export type { Editor };
