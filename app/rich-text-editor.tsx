'use client';
import { useEffect, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Underline as UnderlineIcon } from 'lucide-react';
import { isSafeHttpUrl } from '../lib/email-html';
import { isRichText, normalizeRichText, plainToHtml } from '../lib/rich-text';

type Props = { id?: string; value: string; onChange: (html: string) => void; placeholder?: string; lang?: string; label?: string };

const toEditor = (value: string) => (isRichText(value) ? value : plainToHtml(value)) || '<p></p>';

function ToolbarButton({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={active ? 'active' : ''} aria-label={label} aria-pressed={!!active} title={label} onClick={onClick}>{children}</button>;
}

/** Éditeur de texte mis en forme (description d'un kit) : titres, gras, listes, citations et liens. */
export default function RichTextEditor({ id, value, onChange, placeholder = '', lang, label = 'Description' }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, code: false, horizontalRule: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: toEditor(value),
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange(normalizeRichText(current.getHTML())),
    editorProps: { attributes: { class: 'rich-email-content rich-text-content', 'aria-label': label, 'aria-multiline': 'true', role: 'textbox', ...(id ? { id } : {}), ...(lang ? { lang } : {}) } },
  });

  useEffect(() => {
    if (!editor) return;
    if (normalizeRichText(editor.getHTML()) !== value) editor.commands.setContent(toEditor(value), { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="rich-email-editor rich-email-editor--loading">Chargement de l’éditeur…</div>;

  const addLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Adresse du lien (https://…)', previous ?? 'https://');
    if (url === null) return;
    if (!url.trim()) { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    if (!isSafeHttpUrl(url)) { window.alert('Le lien doit commencer par https:// ou http://.'); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div className="rich-email-editor rich-text-editor">
      <div className="rich-email-toolbar" role="toolbar" aria-label="Mise en forme de la description">
        <ToolbarButton label="Gras" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></ToolbarButton>
        <ToolbarButton label="Italique" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolbarButton>
        <ToolbarButton label="Souligné" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16} /></ToolbarButton>
        <span className="rich-email-toolbar-sep" aria-hidden="true" />
        <ToolbarButton label="Titre" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></ToolbarButton>
        <ToolbarButton label="Sous-titre" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></ToolbarButton>
        <ToolbarButton label="Liste à puces" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></ToolbarButton>
        <ToolbarButton label="Liste numérotée" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolbarButton>
        <ToolbarButton label="Encadré" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></ToolbarButton>
        <span className="rich-email-toolbar-sep" aria-hidden="true" />
        <ToolbarButton label="Lien" active={editor.isActive('link')} onClick={addLink}><Link2 size={16} /></ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
