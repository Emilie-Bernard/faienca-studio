'use client';
import { useEffect, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { AlignCenter, Bold, Heading2, ImageIcon, Italic, Link2, List, ListOrdered, MousePointerClick, Underline as UnderlineIcon } from 'lucide-react';
import { buildEmailButtonHtml, isSafeHttpUrl, normalizeEmailHtml } from '../lib/email-html';

type RichEmailEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

function ToolbarButton({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={active ? 'active' : ''} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export default function RichEmailEditor({ value, onChange, placeholder = 'Rédigez votre e-mail…' }: RichEmailEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      // Garde le style propre à un lien (les boutons d’e-mail) : il s’ajoute après le style par défaut et l’emporte.
      Link.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            style: { default: null, parseHTML: el => el.getAttribute('style'), renderHTML: attrs => (attrs.style ? { style: attrs.style } : {}) },
          };
        },
      }).configure({
        openOnClick: false,
        HTMLAttributes: { style: 'color:#4553ae;text-decoration:underline;' },
      }),
      Image.configure({
        HTMLAttributes: { style: 'display:block;width:100%;max-width:100%;height:auto;margin:24px auto;' },
      }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: value || '',
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange(normalizeEmailHtml(current.getHTML())),
    editorProps: {
      attributes: { class: 'rich-email-content', 'aria-label': placeholder },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = value || '';
    const current = normalizeEmailHtml(editor.getHTML());
    if (current !== next) editor.commands.setContent(next || '<p></p>', { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="rich-email-editor rich-email-editor--loading">Chargement de l’éditeur…</div>;

  const addLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Adresse du lien (https://…)', previous ?? 'https://');
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (!isSafeHttpUrl(url)) {
      window.alert('Le lien doit commencer par https:// ou http://.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const addImage = () => {
    const url = window.prompt('Adresse de l’image (https://…)', 'https://');
    if (!url?.trim()) return;
    if (!isSafeHttpUrl(url)) {
      window.alert('L’image doit être hébergée sur une adresse https:// ou http://.');
      return;
    }
    editor.chain().focus().setImage({ src: url.trim(), alt: 'Illustration Faïença' }).run();
  };

  const addButton = () => {
    const label = window.prompt('Texte du bouton', 'Découvrir Faïença');
    if (label === null) return;
    const url = window.prompt('Lien du bouton (https://…)', 'https://');
    if (!url?.trim()) return;
    // Un seul bouton plein par e-mail de préférence ; les actions secondaires prennent le bouton à contour.
    const outline = !window.confirm('Bouton principal (bleu plein) ? Annuler = bouton secondaire à contour.');
    try {
      editor.chain().focus().insertContent(buildEmailButtonHtml(label, url, outline ? 'outline' : 'primary')).run();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Lien invalide.');
    }
  };

  return (
    <div className="rich-email-editor">
      <div className="rich-email-toolbar" role="toolbar" aria-label="Mise en forme de l’e-mail">
        <ToolbarButton label="Gras" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></ToolbarButton>
        <ToolbarButton label="Italique" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolbarButton>
        <ToolbarButton label="Souligné" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16} /></ToolbarButton>
        <span className="rich-email-toolbar-sep" aria-hidden="true" />
        <ToolbarButton label="Titre" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></ToolbarButton>
        <ToolbarButton label="Centrer" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={16} /></ToolbarButton>
        <ToolbarButton label="Liste à puces" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></ToolbarButton>
        <ToolbarButton label="Liste numérotée" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolbarButton>
        <span className="rich-email-toolbar-sep" aria-hidden="true" />
        <ToolbarButton label="Lien" active={editor.isActive('link')} onClick={addLink}><Link2 size={16} /></ToolbarButton>
        <ToolbarButton label="Image" onClick={addImage}><ImageIcon size={16} /></ToolbarButton>
        <ToolbarButton label="Bouton" onClick={addButton}><MousePointerClick size={16} /></ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
