import { EditorContent, useEditor } from '@tiptap/react';
import { createPortal } from 'react-dom';
import { Markdown as MarkdownPreview } from './markdown';
import { Modal } from './modal';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { localResourceURL, renderMarkdown, normalizeNoteResources, type ResourceContext } from '../lib/markdown';
import { post, errorMessage } from '../lib/api';
import { NodeSelection, type Transaction } from '@tiptap/pm/state';
export default function NoteRichEditor({ text, onChange, onSave, context = {} }: { text: string; onChange(text: string): void; onSave(): Promise<void>; context?: ResourceContext }) {
  const [insert, setInsert] = useState<"image" | "link" | null>(null);
  const [sourceEditing, setSourceEditing] = useState(false);
  const [anchor, setAnchor] = useState<{left:number;top:number;bottom:number}|null>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const selection = useRef({from:0,to:0});
  const change = useRef(onChange); change.current = onChange;
  const initial = useRef(text);
  const current = useRef(text);
  const [source, setSource] = useState(false);

  const [uploadStatus, setUploadStatus] = useState('');
  const uploading = useRef(false);
  const upload = useRef<(files: File[], from: number, to: number) => void>(() => {});
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), Markdown, Image.extend({
      renderMarkdown(node) {
        const src = String(node.attrs?.src || '').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\n/g, '%0A');
        const alt = String(node.attrs?.alt || '').replace(/[\[\]\\]/g, '\\$&');
        const title = node.attrs?.title ? ' "' + String(node.attrs.title).replace(/["\\]/g, '\\$&') + '"' : '';
        return `![${alt}](<${src}>${title})`;
      },
      renderHTML({ HTMLAttributes }) {
        const src = String(HTMLAttributes.src || '');
        return ['img', { ...HTMLAttributes, class: 'markdown-image-content', loading: 'lazy', src: src.startsWith('/') && !src.startsWith('//') ? localResourceURL(src, context) : src }];
      },
    }), TableKit, TaskList, TaskItem.configure({ nested: true })],
    content: normalizeNoteResources(text), contentType: 'markdown', immediatelyRender: false, shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: 'article note-rich-content', role: 'textbox', 'aria-label': tr('编辑笔记正文', 'Edit note content'), 'aria-multiline': 'true' },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files || []);
        if (!files.length) return false;
        upload.current(files, view.state.selection.from, view.state.selection.to); return true;
      },
      handleDrop(view, event, _slice, moved) {
        const files = Array.from(event.dataTransfer?.files || []);
        if (moved || !files.length) return false;
        const pos = view.posAtCoords({left:event.clientX,top:event.clientY})?.pos ?? view.state.selection.from;
        event.preventDefault(); upload.current(files, pos, pos); return true;
      },
    },
    onCreate: ({ editor }) => {
      // Unsupported Markdown must remain editable without silently dropping it.
      if (renderMarkdown(editor.getMarkdown()).trim() !== renderMarkdown(initial.current).trim()) setSource(true);
    },
    onUpdate: ({ editor }) => { current.current = normalizeNoteResources(editor.getMarkdown()); change.current(current.current); },
  });
  upload.current = (files, from, to) => {
    if (!editor || uploading.current || !context.clip) return;
    if (files.some(file => !file.size || file.size > 12 * 1024 * 1024)) { setUploadStatus(tr('请选择 12 MB 以内的非空文件','Choose non-empty files up to 12 MB')); return; }
    uploading.current = true; setUploadStatus(tr('正在保存附件…','Saving attachments…'));
    const mapped = {from,to};
    const track = ({transaction}:{transaction:Transaction}) => { mapped.from=transaction.mapping.map(mapped.from);mapped.to=transaction.mapping.map(mapped.to); };
    editor.on('transaction',track);
    void (async () => {
      const nodes = [];
      for (const file of files) {
        const base64 = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('File could not be read'));reader.readAsDataURL(file);});
        const saved = await post<{path:string;name:string}>(`/api/clips/${context.clip}/uploads`,{name:file.name,base64});
        nodes.push(/^image\/(png|jpeg|gif|webp)$/.test(file.type) ? {type:'image',attrs:{src:saved.path,alt:saved.name}} : {type:'paragraph',content:[{type:'text',text:saved.name,marks:[{type:'link',attrs:{href:saved.path}}]}]});
      }
      if (!editor.isDestroyed) editor.chain().focus().insertContentAt(mapped,nodes).run();
      setUploadStatus('');
    })().catch(error=>setUploadStatus(errorMessage(error))).finally(()=>{editor.off('transaction',track);uploading.current=false;});
  };
  useEffect(() => {
    if (!editor || text === current.current) return;
    current.current = text;
    editor.commands.setContent(normalizeNoteResources(text), { contentType: 'markdown', emitUpdate: false });
    setSource(renderMarkdown(editor.getMarkdown()).trim() !== renderMarkdown(text).trim());
  }, [editor, text]);
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      if (editor.isDestroyed || source || insert || document.querySelector('dialog[open]') || document.activeElement !== editor.view.dom || editor.state.selection.empty) { setAnchor(null); return; }
      const {from,to}=editor.state.selection;
      if (editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === 'image') {
        const image = editor.view.nodeDOM(from);
        if (image instanceof HTMLElement) {
          const bounds = image.getBoundingClientRect();
          setAnchor({left:bounds.left+bounds.width/2,top:bounds.top,bottom:bounds.bottom});
          return;
        }
      }
      const start=editor.view.coordsAtPos(from),end=editor.view.coordsAtPos(to);
      setAnchor({left:(start.left+end.right)/2,top:Math.min(start.top,end.top),bottom:Math.max(start.bottom,end.bottom)});
    };
    let listening = false;
    const stop = () => {
      if (!listening) return;
      listening = false;
      document.removeEventListener('selectionchange',update);
      document.removeEventListener('scroll',update,true);
      window.removeEventListener('resize',update);
      window.removeEventListener('blur',blur);
    };
    const blur = () => { stop(); setAnchor(null); };
    const focus = () => {
      if (!listening) {
        listening = true;
        document.addEventListener('selectionchange',update);
        document.addEventListener('scroll',update,true);
        window.addEventListener('resize',update);
        window.addEventListener('blur',blur);
      }
      update();
    };
    editor.on('selectionUpdate',update); editor.on('focus',focus); editor.on('blur',blur);
    if (document.activeElement === editor.view.dom) focus();
    return () => { stop(); editor.off('selectionUpdate',update); editor.off('focus',focus); editor.off('blur',blur); };

  },[editor,source,insert]);
  useLayoutEffect(()=>{
    const menu=menuElement.current;if(!menu||!anchor)return;
    const rect=menu.getBoundingClientRect();
    menu.style.left=Math.max(12,Math.min(anchor.left-rect.width/2,innerWidth-rect.width-12))+'px';
    menu.style.top=Math.max(12,Math.min(anchor.top>rect.height+20?anchor.top-rect.height-8:anchor.bottom+8,innerHeight-rect.height-12))+'px';
  },[anchor]);
  if (source) return <div className="note-special-content">
    <button className="tool" onClick={()=>setSourceEditing(true)}>{tr('编辑此段','Edit this section')}</button>
    <MarkdownPreview text={text} {...context} />
    {sourceEditing ? <SourceDialog text={text} onClose={()=>setSourceEditing(false)} onSave={async value=>{current.current=value;change.current(value);await onSave();setSourceEditing(false);}} /> : null}
  </div>;
  const openInsert = (kind: "image" | "link") => {
    if (!editor) return;
    selection.current = {from:editor.state.selection.from,to:editor.state.selection.to};
    setInsert(kind);
  };
  return <>
    <EditorContent editor={editor} />
    {uploadStatus ? <p className="dialog-hint" role="status">{uploadStatus}</p> : null}
    {editor && anchor && !insert ? createPortal(
      <div ref={menuElement} className="note-format-menu note-format-popover" role="toolbar" aria-label={tr("正文格式", "Text formatting")} onMouseDown={event=>event.preventDefault()}>
        {editor.isActive("image") ? <button className="tool danger" onClick={()=>editor.chain().focus().deleteSelection().run()}>{tr("删除图片","Delete image")}</button> : <>
          <button className="tool" aria-label={tr("加粗","Bold")} aria-pressed={editor.isActive("bold")} onClick={()=>editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
          <button className="tool" aria-label={tr("斜体","Italic")} aria-pressed={editor.isActive("italic")} onClick={()=>editor.chain().focus().toggleItalic().run()}><em>I</em></button>
          <button className="tool" aria-label={tr("标题","Heading")} aria-pressed={editor.isActive("heading",{level:2})} onClick={()=>editor.chain().focus().toggleHeading({level:2}).run()}>H2</button>
          <button className="tool" onClick={()=>editor.chain().focus().toggleBulletList().run()}>{tr("列表","List")}</button>
          <button className="tool" onClick={()=>editor.chain().focus().toggleOrderedList().run()}>{tr("编号","Numbered")}</button>
          <button className="tool" onClick={()=>editor.chain().focus().toggleBlockquote().run()}>{tr("引用","Quote")}</button>
          <button className="tool" onClick={()=>editor.chain().focus().toggleCodeBlock().run()}>{tr("代码","Code")}</button>
          <button className="tool" onClick={()=>editor.chain().focus().insertTable({rows:3,cols:2,withHeaderRow:true}).run()}>{tr("表格","Table")}</button>
          <button className="tool" onClick={()=>openInsert("image")}>{tr("图片","Image")}</button>
          <button className="tool" onClick={()=>openInsert("link")}>{tr("文件 / 链接","File / link")}</button>
          {editor.isActive("link") ? <button className="tool danger" onClick={()=>editor.chain().focus().extendMarkRange("link").deleteSelection().run()}>{tr("删除文件或链接","Delete file or link")}</button> : null}
          {editor.isActive("table") ? <button className="tool danger" onClick={()=>editor.chain().focus().deleteTable().run()}>{tr("删除表格","Delete table")}</button> : null}
        </>}
      </div>
    , document.body) : null}
    {insert ? <InsertContent kind={insert} onClose={()=>setInsert(null)} onInsert={(url,label)=>{
      if (!editor) return;
      const chain=editor.chain().focus().setTextSelection(selection.current);
      if(insert==="image") chain.setImage({src:url,alt:label}).run();
      else chain.insertContent({type:"text",text:label||url,marks:[{type:"link",attrs:{href:url}}]}).run();
      setInsert(null);
    }} /> : null}
  </>;
}
function InsertContent({kind,onClose,onInsert}:{kind:"image"|"link";onClose():void;onInsert(url:string,label:string):void}) {
  const [url,setURL]=useState(""),[label,setLabel]=useState(""),[error,setError]=useState("");
  return <Modal title={kind==="image"?tr("插入图片","Insert image"):tr("插入文件或链接","Insert file or link")} onClose={onClose}>
    <form onSubmit={event=>{event.preventDefault();const value=url.trim();if(!/^(https?:\/\/|\/(?!\/))/.test(value)){setError(tr("请输入网页地址或本机文件的完整路径","Enter a web URL or an absolute local file path"));return;}onInsert(value,label.trim());}}>
      <label className="field-label" htmlFor="insert-content-url">{tr("地址或文件路径","URL or file path")}</label>
      <input id="insert-content-url" value={url} onChange={e=>setURL(e.target.value)} required autoFocus placeholder="https://… 或 /Users/…" />
      <label className="field-label" htmlFor="insert-content-label">{tr("显示名称","Display name")}</label>
      <input id="insert-content-label" value={label} onChange={e=>setLabel(e.target.value)} />
      <p className="dialog-error">{error}</p>
      <div className="dialog-bottom"><button className="primary">{tr("插入", "Insert")}</button></div>
    </form>
  </Modal>;
}

function SourceDialog({text,onClose,onSave}:{text:string;onClose():void;onSave(value:string):Promise<void>}) {
  const [draft,setDraft]=useState(text);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <Modal title={tr("编辑此段","Edit this section")} onClose={onClose} className="note-source-dialog" busy={busy}>
    <form onSubmit={event=>{event.preventDefault();setBusy(true);setError('');void onSave(draft).catch(error=>setError(errorMessage(error))).finally(()=>setBusy(false));}}>
      <label className="field-label" htmlFor="note-source-draft">{tr("Markdown 原文","Markdown source")}</label>
      <textarea id="note-source-draft" className="capture-input note-source-draft" disabled={busy} value={draft} onChange={event=>setDraft(event.target.value)} autoFocus />
      <p className="dialog-error" role="alert">{error}</p>
      <div className="dialog-bottom"><button className="primary" disabled={busy}>{tr("保存编辑","Save changes")}</button></div>
    </form>
  </Modal>;
}
