'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ArrowLeft, Check, CheckCircle2, Circle, Copy, ExternalLink, FileText, Flower2, ImageIcon, Package, Plus, RotateCcw, ShoppingBasket, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ask } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';
import {
  costSummary, duplicateProduct, emptyProduct, euro, isDefaultChecklist, launchChecklist, materialPurposeLabels, materialPurposes, newContent, newMaterial, newShopLink, newTask, pdfLanguageLabels, pdfLanguages, productError, productStatuses, productTypeLabels, productTypes, taskProgress,
  type Material, type PdfLanguage, type ProductFile, type ProductInput, type ProductType,
} from '../lib/products';
import { errorText } from './client';
import { FileAdder, FileLinks, type FileView } from './stage-files';
import type { LeaveGuard } from './kits-admin';
import { clearDraft, useLocalDraft } from './local-draft';

type Row = Omit<ProductInput, 'pdfs'> & { _id: string; revision: number; updatedAt: number; pdfs: Partial<Record<PdfLanguage, FileView>> };
const inputOf = (p: Row): ProductInput => ({
  type: p.type, title: p.title, description: p.description, status: p.status, price: p.price, shopUrl: p.shopUrl, coverUrl: p.coverUrl, linkedKitId: p.linkedKitId,
  contents: p.contents, materials: p.materials, tasks: p.tasks,
  pdfs: Object.fromEntries(pdfLanguages.flatMap(l => { const f = p.pdfs[l]; return f ? [[l, { id: f.id, label: f.label, url: f.url, ...(f.storageId ? { storageId: f.storageId } : {}) }]] : []; })),
});
const statusClass = (s: string) => s === 'En vente' ? 'green' : s === 'Idée' ? '' : s === 'Prêt à lancer' ? 'purple' : 'blue';
const num = (s: string) => s.trim() === '' ? null : Number(s.replace(',', '.'));
const https = (s: string) => /^https:\/\//i.test(s);
const fieldLabel = 'text-xs font-semibold text-muted-foreground';
const TABS = ['fiche', 'contenu', 'materiaux', 'pdf', 'todo'] as const;
type Tab = typeof TABS[number];

/** Liste des produits, ou fiche d'un produit quand l'adresse contient ?produit=<id|new>. */
export function ProductsAdmin({ productId, onOpenProduct, leaveGuard, onToast }: { productId: string | null, onOpenProduct: (id: string | null) => void, leaveGuard: LeaveGuard, onToast: (s: string) => void }) {
  const rows = useQuery(anyApi.products.list) as Row[] | undefined;
  const [copy, setCopy] = useState<{ key: number, data: ProductInput | null }>({ key: 0, data: null });
  const [filter, setFilter] = useState<'all' | ProductType>('all');
  if (!rows) return <p className="muted">Chargement des produits…</p>;
  if (productId) {
    const product = productId === 'new' ? null : rows.find(r => r._id === productId);
    if (product === undefined) return <section className="panel"><div className="empty"><Flower2 size={28} /><p>Ce produit n’existe plus ou a été supprimé.</p></div><div className="flex justify-center"><Button variant="outline" onClick={() => onOpenProduct(null)}><ArrowLeft />Retour aux produits</Button></div></section>;
    return <ProductPage key={productId + copy.key} product={product} initial={productId === 'new' ? copy.data : null} leaveGuard={leaveGuard}
      onDuplicate={data => { setCopy(c => ({ key: c.key + 1, data: duplicateProduct(data) })); onOpenProduct('new'); }}
      onBack={() => onOpenProduct(null)} onCreated={id => { setCopy(c => ({ key: c.key, data: null })); onOpenProduct(id); }} onToast={onToast} />;
  }
  const shown = rows.filter(p => filter === 'all' || p.type === filter);
  const create = () => { setCopy(c => ({ key: c.key + 1, data: null })); onOpenProduct('new'); };
  return <>
    <div className="filters product-filters">
      <div className="segmented" role="group" aria-label="Type de produit">{([['all', 'Tous'], ['kit', 'Kits'], ['pdf', 'Modèles PDF']] as const).map(([v, label]) => <button key={v} type="button" aria-pressed={filter === v} className={filter === v ? 'selected' : ''} onClick={() => setFilter(v)}>{label} <span className="muted">{v === 'all' ? rows.length : rows.filter(p => p.type === v).length}</span></button>)}</div>
      <span className="spacer" /><Button onClick={create}><Plus size={16} />Nouveau produit</Button>
    </div>
    {shown.length ? <div className="product-list">{shown.map(p => {
      const { done, total } = taskProgress(p.tasks), { margin } = costSummary(p), pdfCount = pdfLanguages.filter(l => p.pdfs[l]).length;
      return <button type="button" key={p._id} className="product-card" onClick={() => onOpenProduct(p._id)}>
        <Cover url={p.coverUrl} type={p.type} />
        <div className="product-card-body">
          <div className="card-top"><span className="eyebrow">{productTypeLabels[p.type].toUpperCase()}</span><span className={'badge ' + statusClass(p.status)}>{p.status}</span></div>
          <h3>{p.title}</h3>
          <p className="product-card-meta">{p.price !== null && <span>{euro(p.price)}</span>}{p.type === 'kit' && margin !== null && p.materials.some(m => m.purpose === 'kit') && <span>marge ≈ {euro(margin)}</span>}<span>PDF {pdfCount}/3</span></p>
          <div className="progress" role="img" aria-label={`${done} étapes faites sur ${total}`}><span style={{ width: total ? done / total * 100 + '%' : '0%' }} /></div>
          <small className="muted">{done}/{total} étapes avant la mise en vente</small>
        </div>
      </button>;
    })}</div> : <section className="panel"><div className="empty"><Flower2 size={28} /><p>{rows.length ? 'Aucun produit de ce type.' : 'Ajoutez votre premier kit ou modèle PDF.'}</p></div></section>}
  </>;
}

function Cover({ url, type, className }: { url: string, type: ProductType, className?: string }) {
  const [broken, setBroken] = useState(false);
  return https(url) && !broken ? <img className={cn('product-cover', className)} src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
    : <div className={cn('product-cover placeholder', className)}>{type === 'pdf' ? <FileText size={26} /> : <Package size={26} />}</div>;
}

function ProductPage({ product, initial, leaveGuard, onDuplicate, onBack, onCreated, onToast }: { product: Row | null, initial: ProductInput | null, leaveGuard: LeaveGuard, onDuplicate: (data: ProductInput) => void, onBack: () => void, onCreated: (id: string) => void, onToast: (s: string) => void }) {
  const save = useMutation(anyApi.products.save), remove = useMutation(anyApi.products.remove), uploadUrl = useMutation(anyApi.products.generateUploadUrl);
  const kits = useQuery(anyApi.kits.adminList) as { _id: string; title: string }[] | undefined;
  const id = product?._id ?? 'new';
  const [data, setData] = useState<ProductInput>(() => initial ?? (product ? inputOf(product) : emptyProduct()));
  const [revision, setRevision] = useState(product?.revision), [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(!!initial);
  const [tab, setTabState] = useState<Tab>('fiche');
  // Lu après l'affichage : l'adresse n'existe pas pendant le rendu serveur.
  useEffect(() => { const t = new URLSearchParams(location.search).get('onglet'); if ((TABS as readonly string[]).includes(t ?? '')) setTabState(t as Tab); }, []);
  const draftKey = 'faienca-product-draft:' + id;
  const { restored, forget } = useLocalDraft({ key: draftKey, revision: product?.revision ?? null, data, dirty, skip: !!initial, onRestore: d => { setData(d); setDirty(true); } });
  const setTab = (t: string) => { setTabState(t as Tab); const p = new URLSearchParams(location.search); if (t === 'fiche') p.delete('onglet'); else p.set('onglet', t); history.replaceState(null, '', '?' + p.toString()); };
  const release = () => { leaveGuard.current = async () => true; };
  useEffect(() => {
    leaveGuard.current = async () => { if (!dirty) return true; const ok = await ask({ title: 'Quitter sans enregistrer ?', description: 'Les modifications de ce produit seront perdues.', confirmLabel: 'Quitter sans enregistrer', destructive: true }); if (ok) { clearDraft(draftKey); release(); } return ok; };
    return release;
  });
  const set = (patch: Partial<ProductInput>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
  const discard = async () => { if (!await ask({ title: 'Annuler les modifications ?', description: 'Le produit revient à sa dernière version enregistrée.', confirmLabel: 'Annuler les modifications', destructive: true })) return; forget(); setDirty(false); if (product) setData(inputOf(product)); else onBack(); };
  const duplicate = async () => { if (busy || !await leaveGuard.current()) return; onDuplicate(data); };
  const chooseType = (type: ProductType) => set({ type, ...(isDefaultChecklist(data.tasks, data.type) ? { tasks: launchChecklist(type) } : {}) });
  const back = async () => { if (busy) return; if (await leaveGuard.current()) onBack(); };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); const problem = productError(data);
    if (problem) { setError(problem); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setBusy(true); setError('');
    try {
      const saved = await save({ data, ...(product ? { id: product._id, revision } : {}) }) as string;
      clearDraft(draftKey); setDirty(false);
      if (product) { setRevision(r => (r ?? 0) + 1); onToast('Produit enregistré'); } else { release(); onToast('Produit créé'); onCreated(saved); }
    } catch (err) { setError(errorText(err, 'Impossible d’enregistrer. Vos modifications restent sur la page.')); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    setBusy(false);
  };
  const erase = async () => {
    if (!product || !await ask({ title: 'Supprimer ce produit ?', description: 'Sa fiche, sa liste de matériaux et ses PDF seront supprimés.', confirmLabel: 'Supprimer', destructive: true })) return;
    setBusy(true); try { await remove({ id: product._id, revision }); clearDraft(draftKey); release(); onToast('Produit supprimé'); onBack(); } catch (err) { setError(errorText(err, 'La suppression a échoué.')); setBusy(false); }
  };
  const isKit = data.type === 'kit';
  const { done, total } = taskProgress(data.tasks), summary = costSummary(data), pdfCount = pdfLanguages.filter(l => data.pdfs[l]).length;
  const nextTasks = data.tasks.filter(t => !t.done).slice(0, 4);
  const fileUrl = (f: ProductFile) => (product && pdfLanguages.map(l => product.pdfs[l]).find(x => x?.storageId && x.storageId === f.storageId)?.fileUrl) || null;
  const setTask = (taskId: string, done: boolean) => set({ tasks: data.tasks.map(x => x.id === taskId ? { ...x, done } : x) });
  const currentTab = !isKit && (tab === 'contenu' || tab === 'materiaux') ? 'fiche' : tab;

  return <form className="product-page" onSubmit={submit}>
    <div className="kit-page-bar">
      <Button type="button" variant="ghost" className="-ml-3 text-muted-foreground" onClick={() => void back()}><ArrowLeft />Produits</Button>
      <div className="kit-page-title"><span className="eyebrow">{productTypeLabels[data.type].toUpperCase()}</span><h1>{data.title.trim() || 'Sans titre'}</h1></div>
      <span className={'badge ' + statusClass(data.status)}>{data.status}</span>
      <span className="spacer" />
      {dirty && <span className="kit-page-dirty" role="status">Modifications non enregistrées</span>}
      {dirty && <Button type="button" variant="ghost" disabled={busy} onClick={() => void discard()}><RotateCcw size={16} />Annuler</Button>}
      {https(data.shopUrl) && <Button type="button" variant="outline" asChild><a href={data.shopUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Voir en boutique</a></Button>}
      {product && <Button type="button" variant="outline" disabled={busy} onClick={() => void duplicate()}><Copy size={16} />Dupliquer</Button>}
      <Button disabled={busy || (!!product && !dirty)}>{busy ? 'Enregistrement…' : product ? 'Enregistrer' : 'Créer le produit'}</Button>
    </div>
    {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
    {restored && <p className="product-restored" role="status"><RotateCcw size={15} />Vos modifications non enregistrées ont été retrouvées. Enregistrez-les ou annulez-les.</p>}

    <section className="product-kpis">
      <Kpi label="Prix de vente" value={data.price !== null ? euro(data.price) : '—'} />
      {isKit && <Kpi label="Coût matières / kit" value={euro(summary.cost)} detail={summary.missing ? `${summary.missing} sans coût` : undefined} />}
      {isKit && <Kpi label="Marge brute" value={summary.margin !== null ? euro(summary.margin) : '—'} detail={summary.marginPercent !== null ? `${summary.marginPercent} % du prix` : undefined} tone={summary.margin !== null && summary.margin < 0 ? 'bad' : undefined} />}
      <Kpi label="Mise en vente" value={`${done}/${total}`} detail="étapes faites" progress={total ? done / total : 0} />
      <Kpi label="PDF" value={`${pdfCount}/3`} detail={pdfLanguages.map(l => data.pdfs[l] ? l.toUpperCase() : '·').join(' ')} />
    </section>

    <div className="product-grid">
      <div className="product-main">
        <Tabs value={currentTab} onValueChange={setTab}>
          <TabsList variant="line" className="product-tabs">
            <TabsTrigger value="fiche">Fiche</TabsTrigger>
            {isKit && <TabsTrigger value="contenu">Contenu <span className="product-count">{data.contents.length}</span></TabsTrigger>}
            {isKit && <TabsTrigger value="materiaux">Matériaux <span className="product-count">{data.materials.length}</span></TabsTrigger>}
            <TabsTrigger value="pdf">PDF <span className="product-count">{pdfCount}/3</span></TabsTrigger>
            <TabsTrigger value="todo">À faire <span className="product-count">{done}/{total}</span></TabsTrigger>
          </TabsList>

          <TabsContent value="fiche"><section className="panel product-section">
            <div><Label htmlFor="p-title">Titre</Label><Input id="p-title" maxLength={200} value={data.title} onChange={e => set({ title: e.target.value })} placeholder={isKit ? 'Ex. Kit Citron' : 'Ex. Modèle Cigale'} /></div>
            <div><Label htmlFor="p-desc">Description et notes</Label><Textarea id="p-desc" className="product-description min-h-72 [field-sizing:content] leading-7" maxLength={5000} value={data.description} onChange={e => set({ description: e.target.value })} placeholder="Histoire du motif, niveau, durée, public visé, points utilisés…" /><small className="muted">{data.description.length} / 5 000</small></div>
          </section></TabsContent>

          {isKit && <TabsContent value="contenu"><section className="panel product-section">
            <div className="product-section-head"><div><h2>Ce qu’il y a dans le kit</h2><p className="muted">Ce que la cliente trouve dans la boîte, tel que vous le présenterez sur la fiche produit.</p></div></div>
            {data.contents.length > 0 && <ol className="product-contents">{data.contents.map(c => <li key={c.id}>
              <Input aria-label="Élément du kit" placeholder="Ex. Toile imprimée 20 × 20 cm" maxLength={200} value={c.name} onChange={e => set({ contents: data.contents.map(x => x.id === c.id ? { ...x, name: e.target.value } : x) })} />
              <Input aria-label="Précision" placeholder="Précision (facultatif)" maxLength={500} value={c.notes} onChange={e => set({ contents: data.contents.map(x => x.id === c.id ? { ...x, notes: e.target.value } : x) })} />
              <Button type="button" variant="ghost" size="icon" aria-label={'Retirer ' + (c.name || 'cet élément')} onClick={() => set({ contents: data.contents.filter(x => x.id !== c.id) })}><Trash2 size={16} /></Button>
            </li>)}</ol>}
            {!data.contents.length && <p className="muted">Aucun élément pour l’instant.</p>}
            <div><Button type="button" variant="outline" onClick={() => set({ contents: [...data.contents, newContent()] })}><Plus size={16} />Ajouter un élément</Button></div>
          </section></TabsContent>}

          {isKit && <TabsContent value="materiaux"><div className="flex flex-col gap-4">
            {materialPurposes.map(purpose => { const list = data.materials.filter(m => m.purpose === purpose); return <section key={purpose} className="panel product-section">
              <div className="product-section-head"><div><h2>{purpose === 'kit' ? 'Matières du kit' : 'Pour fabriquer les kits'}</h2><p className="muted">{purpose === 'kit' ? 'Fourni dans chaque boîte. Le coût par kit entre dans le calcul de la marge.' : 'Outils, emballage, impression, étiquettes : à acheter pour produire, hors coût du kit.'}</p></div>
                <span className="muted">{list.filter(m => m.bought).length}/{list.length} acheté{list.length > 1 ? 's' : ''}</span></div>
              {list.map(m => <MaterialCard key={m.id} material={m} onChange={patch => set({ materials: data.materials.map(x => x.id === m.id ? { ...x, ...patch } : x) })} onRemove={() => set({ materials: data.materials.filter(x => x.id !== m.id) })} />)}
              <div><Button type="button" variant="outline" onClick={() => set({ materials: [...data.materials, newMaterial(purpose)] })}><Plus size={16} />Ajouter un matériau</Button></div>
            </section>; })}
          </div></TabsContent>}

          <TabsContent value="pdf"><div className="product-pdfs">
            {pdfLanguages.map(lang => { const f = data.pdfs[lang]; return <section key={lang} className={cn('panel product-section', !f && 'product-missing')}>
              <div className="product-section-head"><h2>{pdfLanguageLabels[lang]}</h2><span className={'badge ' + (f ? 'green' : 'orange')}>{f ? 'Ajouté' : 'Manquant'}</span></div>
              {f && <FileLinks files={[{ ...f, fileUrl: fileUrl(f) }]} onRemove={() => { const { [lang]: _removed, ...rest } = data.pdfs; set({ pdfs: rest }); }} />}
              <FileAdder what="PDF" upload={() => uploadUrl() as Promise<string>} onAdd={async file => set({ pdfs: { ...data.pdfs, [lang]: { ...file, label: file.label || pdfLanguageLabels[lang] } } })} />
              {f && <p className="muted">Ajouter un fichier remplace l’actuel.</p>}
            </section>; })}
          </div></TabsContent>

          <TabsContent value="todo"><section className="panel product-section">
            <div className="product-section-head"><div><h2>Avant la mise en vente</h2><p className="muted">Cochez au fur et à mesure ; les titres se modifient directement.</p></div><span className="muted">{done}/{total}</span></div>
            <div className="progress" role="img" aria-label={`${done} étapes faites sur ${total}`}><span style={{ width: total ? done / total * 100 + '%' : '0%' }} /></div>
            <ul className="product-tasks">{data.tasks.map(t => <li key={t.id} className={t.done ? 'done' : ''}>
              <input type="checkbox" aria-label={'Fait : ' + t.title} checked={t.done} onChange={e => setTask(t.id, e.target.checked)} />
              <Input aria-label="Étape" maxLength={300} value={t.title} onChange={e => set({ tasks: data.tasks.map(x => x.id === t.id ? { ...x, title: e.target.value } : x) })} />
              <Button type="button" variant="ghost" size="icon" aria-label={'Retirer ' + t.title} onClick={() => set({ tasks: data.tasks.filter(x => x.id !== t.id) })}><Trash2 size={16} /></Button>
            </li>)}</ul>
            <div><Button type="button" variant="outline" onClick={() => set({ tasks: [...data.tasks, newTask()] })}><Plus size={16} />Ajouter une étape</Button></div>
          </section></TabsContent>
        </Tabs>
      </div>

      <aside className="product-side">
        <section className="panel product-section">
          <Cover url={data.coverUrl} type={data.type} className="product-cover-large" />
          {!product && <div><span className={fieldLabel}>Type de produit</span><div className="segmented" role="group" aria-label="Type de produit">{productTypes.map(t => <button key={t} type="button" aria-pressed={data.type === t} className={data.type === t ? 'selected' : ''} onClick={() => chooseType(t)}>{productTypeLabels[t]}</button>)}</div></div>}
          <div><Label htmlFor="p-status">Avancement</Label><select id="p-status" value={data.status} onChange={e => set({ status: e.target.value })}>{productStatuses.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><Label htmlFor="p-price">Prix de vente (€)</Label><NumberInput id="p-price" value={data.price} onChange={price => set({ price })} placeholder="Ex. 29" /></div>
          <div><Label htmlFor="p-shop">Fiche boutique</Label><Input id="p-shop" type="url" value={data.shopUrl} onChange={e => set({ shopUrl: e.target.value })} placeholder="https://…" /></div>
          <div><Label htmlFor="p-cover">Image de couverture</Label><Input id="p-cover" type="url" value={data.coverUrl} onChange={e => set({ coverUrl: e.target.value })} placeholder="https://…" /></div>
          {isKit && <div><Label htmlFor="p-kit">Leçons vidéo (espace brodeuses)</Label><select id="p-kit" value={data.linkedKitId} onChange={e => set({ linkedKitId: e.target.value })}><option value="">Aucun kit relié</option>{kits?.map(k => <option key={k._id} value={k._id}>{k.title}</option>)}</select></div>}
        </section>
        <section className="panel product-section">
          <div className="product-section-head"><h2>Prochaines étapes</h2><button type="button" className="edit-link" onClick={() => setTab('todo')}>Tout voir</button></div>
          {nextTasks.length ? <ul className="product-next">{nextTasks.map(t => <li key={t.id}><button type="button" onClick={() => setTask(t.id, true)} aria-label={'Marquer comme fait : ' + t.title}><Circle size={16} /></button><span>{t.title}</span></li>)}</ul>
            : <p className="product-all-done"><CheckCircle2 size={16} />Toutes les étapes sont faites.</p>}
        </section>
        <section className="panel product-section">
          <div className="product-section-head"><h2>PDF</h2><button type="button" className="edit-link" onClick={() => setTab('pdf')}>Gérer</button></div>
          <ul className="product-langs">{pdfLanguages.map(l => <li key={l}>{data.pdfs[l] ? <Check size={15} className="ok" /> : <Circle size={15} className="muted" />}<span>{pdfLanguageLabels[l]}</span></li>)}</ul>
        </section>
        {product && <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void erase()}><Trash2 size={16} />Supprimer le produit</Button>}
      </aside>
    </div>
  </form>;
}

/** Montant en euros saisi avec une virgule : le texte tapé reste tel quel, la valeur suit. */
function NumberInput({ value, onChange, ...props }: { value: number | null, onChange: (n: number | null) => void, id?: string, placeholder?: string }) {
  const format = (n: number | null) => n === null || Number.isNaN(n) ? '' : String(n).replace('.', ',');
  const [text, setText] = useState(() => format(value));
  useEffect(() => { if (!Object.is(num(text), value)) setText(format(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps -- seule une valeur venue d'ailleurs réécrit le texte
  return <Input {...props} inputMode="decimal" value={text} onChange={e => { setText(e.target.value); onChange(num(e.target.value)); }} />;
}

function Kpi({ label, value, detail, progress, tone }: { label: string, value: string, detail?: string, progress?: number, tone?: 'bad' }) {
  return <div className={cn('product-kpi', tone)}><span>{label}</span><strong>{value}</strong>{progress !== undefined && <div className="progress"><span style={{ width: progress * 100 + '%' }} /></div>}{detail && <small>{detail}</small>}</div>;
}

function MaterialCard({ material: m, onChange, onRemove }: { material: Material, onChange: (patch: Partial<Material>) => void, onRemove: () => void }) {
  return <div className={cn('product-material', m.bought && 'bought')}>
    <div className="product-material-head">
      <label className="product-bought" title="Déjà acheté"><input type="checkbox" checked={m.bought} onChange={e => onChange({ bought: e.target.checked })} /><span className="sr-only">Déjà acheté</span></label>
      <Input aria-label="Matériau" className="product-material-name" placeholder="Ex. Fil de coton mouliné, jaune citron" maxLength={200} value={m.name} onChange={e => onChange({ name: e.target.value })} />
      <Button type="button" variant="ghost" size="icon" aria-label={'Retirer ' + (m.name || 'ce matériau')} onClick={onRemove}><Trash2 size={16} /></Button>
    </div>
    <div className="product-material-fields">
      <label><span className={fieldLabel}>Quantité</span><Input placeholder="Ex. 2 écheveaux" maxLength={60} value={m.quantity} onChange={e => onChange({ quantity: e.target.value })} /></label>
      <label><span className={fieldLabel}>{m.purpose === 'kit' ? 'Coût par kit (€)' : 'Coût estimé (€)'}</span><NumberInput value={m.unitCost} onChange={unitCost => onChange({ unitCost })} placeholder="Ex. 1,20" /></label>
      <label><span className={fieldLabel}>Catégorie</span><select value={m.purpose} onChange={e => onChange({ purpose: e.target.value as Material['purpose'] })}>{materialPurposes.map(p => <option key={p} value={p}>{materialPurposeLabels[p]}</option>)}</select></label>
    </div>
    <div className="product-links"><span className={fieldLabel}><ShoppingBasket size={13} className="inline" /> Où l’acheter</span>
      {m.links.map(l => <div key={l.id} className="product-link">
        <Input aria-label="Boutique" placeholder="Boutique" maxLength={80} value={l.shop} onChange={e => onChange({ links: m.links.map(x => x.id === l.id ? { ...x, shop: e.target.value } : x) })} />
        <Input aria-label="Lien d’achat" type="url" placeholder="https://…" value={l.url} onChange={e => onChange({ links: m.links.map(x => x.id === l.id ? { ...x, url: e.target.value } : x) })} />
        <Input aria-label="Note sur le lien" placeholder="Prix, lot…" maxLength={200} value={l.note} onChange={e => onChange({ links: m.links.map(x => x.id === l.id ? { ...x, note: e.target.value } : x) })} />
        {https(l.url) ? <a className="product-open" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={'Ouvrir ' + (l.shop || 'le lien')} title="Ouvrir la boutique"><ExternalLink size={16} /></a> : <span className="product-open" aria-hidden><ImageIcon size={16} className="opacity-0" /></span>}
        <Button type="button" variant="ghost" size="icon" aria-label="Retirer ce lien" onClick={() => onChange({ links: m.links.filter(x => x.id !== l.id) })}><Trash2 size={16} /></Button>
      </div>)}
      <div><Button type="button" variant="ghost" size="sm" onClick={() => onChange({ links: [...m.links, newShopLink()] })}><Plus size={14} />Ajouter un lien d’achat</Button></div>
    </div>
  </div>;
}
