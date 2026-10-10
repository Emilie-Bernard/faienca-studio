'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { ArrowLeft, Copy, ExternalLink, Flower2, Package, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ask } from '@/components/confirm-dialog';
import {
  costSummary, duplicateProduct, emptyProduct, euro, isDefaultChecklist, launchChecklist, materialPurposeLabels, materialPurposes, newContent, newMaterial, newShopLink, newTask, pdfLanguageLabels, pdfLanguages, productError, productStatuses, productTypeLabels, productTypes, taskProgress,
  type Material, type PdfLanguage, type ProductFile, type ProductInput, type ProductType,
} from '../lib/products';
import { errorText } from './client';
import { FileAdder, FileLinks, type FileView } from './stage-files';
import type { LeaveGuard } from './kits-admin';

type Row = Omit<ProductInput, 'pdfs'> & { _id: string; revision: number; updatedAt: number; pdfs: Partial<Record<PdfLanguage, FileView>> };
const inputOf = (p: Row): ProductInput => ({
  type: p.type, title: p.title, description: p.description, status: p.status, price: p.price, shopUrl: p.shopUrl, coverUrl: p.coverUrl, linkedKitId: p.linkedKitId,
  contents: p.contents, materials: p.materials, tasks: p.tasks,
  pdfs: Object.fromEntries(pdfLanguages.flatMap(l => { const f = p.pdfs[l]; return f ? [[l, { id: f.id, label: f.label, url: f.url, ...(f.storageId ? { storageId: f.storageId } : {}) }]] : []; })),
});
const statusClass = (s: string) => s === 'En vente' ? 'green' : s === 'Idée' ? '' : s === 'Prêt à lancer' ? 'purple' : 'blue';
const num = (s: string) => s.trim() === '' ? null : Number(s.replace(',', '.'));
const fieldLabel = 'text-xs font-semibold text-muted-foreground';

/** Liste des produits, ou page d'édition d'un produit. */
export function ProductsAdmin({ leaveGuard, onToast }: { leaveGuard: LeaveGuard, onToast: (s: string) => void }) {
  const rows = useQuery(anyApi.products.list) as Row[] | undefined;
  const [editing, setEditing] = useState<string | null>(null), [draft, setDraft] = useState<{ key: number, data: ProductInput | null }>({ key: 0, data: null });
  if (!rows) return <p className="muted">Chargement des produits…</p>;
  if (editing) {
    const product = editing === 'new' ? null : rows.find(r => r._id === editing);
    if (product === undefined) return <section className="panel"><div className="empty"><Flower2 size={28} /><p>Ce produit n’existe plus.</p></div><div className="flex justify-center"><Button variant="outline" onClick={() => setEditing(null)}><ArrowLeft />Retour aux produits</Button></div></section>;
    return <ProductPage key={editing + draft.key} product={product} initial={draft.data} leaveGuard={leaveGuard} onDuplicate={data => { setDraft(d => ({ key: d.key + 1, data: duplicateProduct(data) })); setEditing('new'); }} onBack={() => setEditing(null)} onCreated={id => setEditing(id)} onToast={onToast} />;
  }
  const open = () => { setDraft(d => ({ key: d.key + 1, data: null })); setEditing('new'); };
  return <>
    <div className="page-tools"><div className="review-note"><Package size={22} /><p>Un espace par produit : contenu, matériaux à acheter avec leurs liens, PDF en trois langues et liste des étapes avant la mise en vente.</p></div>
      <div className="filters"><span className="muted">{rows.length} produit{rows.length > 1 ? 's' : ''}</span><Button onClick={open}><Plus size={16} />Nouveau produit</Button></div></div>
    {rows.length ? <div className="strategy-grid">{rows.map(p => {
      const { done, total } = taskProgress(p.tasks), { margin } = costSummary(p);
      return <button type="button" key={p._id} className="strategy-card" onClick={() => setEditing(p._id)}>
        <div className="card-top"><span className="eyebrow">{productTypeLabels[p.type].toUpperCase()}</span><span className={'badge ' + statusClass(p.status)}>{p.status}</span></div>
        <h3>{p.title}</h3>
        {p.type === 'pdf' && <p className="muted">{pdfLanguages.filter(l => p.pdfs[l]).map(l => l.toUpperCase()).join(' · ') || 'Aucun PDF ajouté'}</p>}
        {p.type === 'kit' && <p className="muted">{p.materials.length} matériau{p.materials.length > 1 ? 'x' : ''}{p.price !== null && margin !== null && p.materials.some(m => m.purpose === 'kit') ? ` · marge ≈ ${euro(margin)}` : ''}</p>}
        <div className="progress" role="img" aria-label={`${done} tâches faites sur ${total}`}><span style={{ width: total ? done / total * 100 + '%' : '0%' }} /></div>
        <small>{done}/{total} étapes avant la mise en vente</small>
      </button>;
    })}</div> : <section className="panel"><div className="empty"><Flower2 size={28} /><p>Ajoutez votre premier kit ou modèle PDF.</p></div></section>}
  </>;
}

function ProductPage({ product, initial, leaveGuard, onDuplicate, onBack, onCreated, onToast }: { product: Row | null, initial: ProductInput | null, leaveGuard: LeaveGuard, onDuplicate: (data: ProductInput) => void, onBack: () => void, onCreated: (id: string) => void, onToast: (s: string) => void }) {
  const save = useMutation(anyApi.products.save), remove = useMutation(anyApi.products.remove), uploadUrl = useMutation(anyApi.products.generateUploadUrl);
  const kits = useQuery(anyApi.kits.adminList) as { _id: string; title: string }[] | undefined;
  const [data, setData] = useState<ProductInput>(() => product ? inputOf(product) : initial ?? emptyProduct());
  const [revision, setRevision] = useState(product?.revision), [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(!!initial);
  const release = () => { leaveGuard.current = async () => true; };
  useEffect(() => {
    leaveGuard.current = async () => { if (!dirty) return true; const ok = await ask({ title: 'Quitter sans enregistrer ?', description: 'Les modifications de ce produit seront perdues.', confirmLabel: 'Quitter sans enregistrer', destructive: true }); if (ok) release(); return ok; };
    return release;
  });
  useEffect(() => { if (!dirty) return; const before = (e: BeforeUnloadEvent) => e.preventDefault(); addEventListener('beforeunload', before); return () => removeEventListener('beforeunload', before); }, [dirty]);
  const set = (patch: Partial<ProductInput>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
  const duplicate = async () => { if (busy || !await leaveGuard.current()) return; onDuplicate(data); };
  const chooseType = (type: ProductType) => set({ type, ...(isDefaultChecklist(data.tasks, data.type) ? { tasks: launchChecklist(type) } : {}) });
  const back = async () => { if (busy) return; if (await leaveGuard.current()) onBack(); };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); const problem = productError(data);
    if (problem) { setError(problem); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setBusy(true); setError('');
    try {
      const id = await save({ data, ...(product ? { id: product._id, revision } : {}) }) as string;
      setDirty(false);
      if (product) { setRevision(r => (r ?? 0) + 1); onToast('Produit enregistré'); } else { release(); onToast('Produit créé'); onCreated(id); }
    } catch (err) { setError(errorText(err, 'Impossible d’enregistrer. Vos modifications restent sur la page.')); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    setBusy(false);
  };
  const erase = async () => {
    if (!product || !await ask({ title: 'Supprimer ce produit ?', description: 'Sa fiche, sa liste de matériaux et ses PDF seront supprimés.', confirmLabel: 'Supprimer', destructive: true })) return;
    setBusy(true); try { await remove({ id: product._id, revision }); release(); onToast('Produit supprimé'); onBack(); } catch (err) { setError(errorText(err, 'La suppression a échoué.')); setBusy(false); }
  };
  const isKit = data.type === 'kit';
  const { done, total } = taskProgress(data.tasks), summary = costSummary(data);
  const fileUrl = (f: ProductFile) => product?.pdfs && pdfLanguages.map(l => product.pdfs[l]).find(x => x?.storageId && x.storageId === f.storageId)?.fileUrl || null;
  return <form className="kit-page" onSubmit={submit}>
    <div className="kit-page-bar">
      <Button type="button" variant="ghost" className="-ml-3 text-muted-foreground" onClick={() => void back()}><ArrowLeft />Produits</Button>
      <div className="kit-page-title"><span className="eyebrow">{productTypeLabels[data.type].toUpperCase()}</span><h1>{data.title.trim() || 'Sans titre'}</h1></div>
      <span className={'badge ' + statusClass(data.status)}>{data.status}</span><span className="spacer" />
      {dirty && <span className="kit-page-dirty" role="status">Modifications non enregistrées</span>}
      {product && <Button type="button" variant="outline" disabled={busy} onClick={() => void duplicate()}><Copy size={16} />Dupliquer</Button>}
      <Button disabled={busy || (!!product && !dirty)}>{busy ? 'Enregistrement…' : product ? 'Enregistrer' : 'Créer le produit'}</Button>
    </div>
    {error && <div role="alert" className="error">{error}<button type="button" onClick={() => setError('')}>Fermer</button></div>}
    <Tabs defaultValue="general">
      <TabsList className="product-tabs">
        <TabsTrigger value="general">Général</TabsTrigger>
        {isKit && <TabsTrigger value="contenu">Contenu ({data.contents.length})</TabsTrigger>}
        {isKit && <TabsTrigger value="materiaux">Matériaux ({data.materials.length})</TabsTrigger>}
        <TabsTrigger value="pdf">PDF ({pdfLanguages.filter(l => data.pdfs[l]).length}/3)</TabsTrigger>
        <TabsTrigger value="todo">À faire ({done}/{total})</TabsTrigger>
      </TabsList>

      <TabsContent value="general"><section className="panel stage-form">
        {!product && <div><span className={fieldLabel}>Type de produit</span><div className="segmented" role="group" aria-label="Type de produit">{productTypes.map(t => <button key={t} type="button" aria-pressed={data.type === t} className={data.type === t ? 'selected' : ''} onClick={() => chooseType(t)}>{productTypeLabels[t]}</button>)}</div></div>}
        <div><Label htmlFor="p-title">Titre</Label><Input id="p-title" maxLength={200} value={data.title} onChange={e => set({ title: e.target.value })} placeholder={isKit ? 'Ex. Kit Citron' : 'Ex. Modèle Cigale'} /></div>
        <div className="stage-form-row">
          <div><Label htmlFor="p-status">Avancement</Label><select id="p-status" value={data.status} onChange={e => set({ status: e.target.value })}>{productStatuses.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><Label htmlFor="p-price">Prix de vente (€)</Label><Input id="p-price" inputMode="decimal" value={data.price ?? ''} onChange={e => set({ price: num(e.target.value) })} placeholder="Ex. 29" /></div>
        </div>
        <div><Label htmlFor="p-desc">Description et notes</Label><Textarea id="p-desc" rows={6} maxLength={5000} value={data.description} onChange={e => set({ description: e.target.value })} placeholder="Niveau, durée, public visé, idées…" /></div>
        <div className="stage-form-row">
          <div><Label htmlFor="p-shop">Fiche produit sur la boutique</Label><Input id="p-shop" type="url" value={data.shopUrl} onChange={e => set({ shopUrl: e.target.value })} placeholder="https://…" /></div>
          <div><Label htmlFor="p-cover">Image de couverture</Label><Input id="p-cover" type="url" value={data.coverUrl} onChange={e => set({ coverUrl: e.target.value })} placeholder="https://…" /></div>
        </div>
        {isKit && <div><Label htmlFor="p-kit">Leçons vidéo dans l’espace brodeuses</Label><select id="p-kit" value={data.linkedKitId} onChange={e => set({ linkedKitId: e.target.value })}><option value="">Aucun kit relié</option>{kits?.map(k => <option key={k._id} value={k._id}>{k.title}</option>)}</select></div>}
      </section></TabsContent>

      {isKit && <TabsContent value="contenu"><section className="panel stage-form">
        <div className="panel-title"><h2>Ce qu’il y a dans le kit</h2></div>
        <p className="muted">Ce que la cliente trouve dans la boîte, tel que vous le présenterez sur la fiche produit.</p>
        {data.contents.map(c => <div key={c.id} className="product-row"><Input aria-label="Élément du kit" placeholder="Ex. Toile imprimée 20 × 20 cm" maxLength={200} value={c.name} onChange={e => set({ contents: data.contents.map(x => x.id === c.id ? { ...x, name: e.target.value } : x) })} />
          <Input aria-label="Précision" placeholder="Précision (facultatif)" maxLength={500} value={c.notes} onChange={e => set({ contents: data.contents.map(x => x.id === c.id ? { ...x, notes: e.target.value } : x) })} />
          <Button type="button" variant="ghost" size="icon" aria-label={'Retirer ' + (c.name || 'cet élément')} onClick={() => set({ contents: data.contents.filter(x => x.id !== c.id) })}><Trash2 size={16} /></Button></div>)}
        {!data.contents.length && <p className="muted">Aucun élément pour l’instant.</p>}
        <div><Button type="button" variant="outline" onClick={() => set({ contents: [...data.contents, newContent()] })}><Plus size={16} />Ajouter un élément</Button></div>
      </section></TabsContent>}

      {isKit && <TabsContent value="materiaux"><div className="flex flex-col gap-4">
        <section className="stats">
          <div className="stat"><span>Coût matières par kit</span><strong>{euro(summary.cost)}</strong>{summary.missing > 0 && <small>{summary.missing} sans coût</small>}</div>
          <div className="stat"><span>Prix de vente</span><strong>{data.price !== null ? euro(data.price) : '—'}</strong></div>
          <div className="stat"><span>Marge brute</span><strong>{summary.margin !== null ? euro(summary.margin) : '—'}</strong>{summary.marginPercent !== null && <small>{summary.marginPercent} % du prix</small>}</div>
          <div className="stat"><span>Déjà acheté</span><strong>{data.materials.filter(m => m.bought).length}/{data.materials.length}</strong></div>
        </section>
        {materialPurposes.map(purpose => <section key={purpose} className="panel stage-form">
          <div className="panel-title"><h2>{purpose === 'kit' ? 'Matières du kit' : 'Pour fabriquer les kits'}</h2></div>
          <p className="muted">{purpose === 'kit' ? 'Ce qui est fourni dans chaque boîte. Le coût par kit entre dans le calcul de la marge.' : 'Outils, emballage, impression, étiquettes : ce qu’il faut acheter pour produire, sans entrer dans le coût du kit.'}</p>
          {data.materials.filter(m => m.purpose === purpose).map(m => <MaterialCard key={m.id} material={m} onChange={patch => set({ materials: data.materials.map(x => x.id === m.id ? { ...x, ...patch } : x) })} onRemove={() => set({ materials: data.materials.filter(x => x.id !== m.id) })} />)}
          <div><Button type="button" variant="outline" onClick={() => set({ materials: [...data.materials, newMaterial(purpose)] })}><Plus size={16} />Ajouter un matériau</Button></div>
        </section>)}
      </div></TabsContent>}

      <TabsContent value="pdf"><div className="flex flex-col gap-4">
        <p className="muted">{isKit ? 'La notice du kit' : 'Le modèle'} dans chaque langue : fichier PDF téléversé ou lien (Drive, Dropbox…).</p>
        {pdfLanguages.map(lang => { const f = data.pdfs[lang]; return <section key={lang} className="panel stage-form">
          <div className="panel-title"><h2>{pdfLanguageLabels[lang]}</h2><span className={'badge ' + (f ? 'green' : 'orange')}>{f ? 'Ajouté' : 'Manquant'}</span></div>
          {f && <FileLinks files={[{ ...f, fileUrl: fileUrl(f) }]} onRemove={() => { const { [lang]: _gone, ...rest } = data.pdfs; set({ pdfs: rest }); }} />}
          <FileAdder what="PDF" upload={() => uploadUrl() as Promise<string>} onAdd={async file => set({ pdfs: { ...data.pdfs, [lang]: { ...file, label: file.label || `${pdfLanguageLabels[lang]}` } } })} />
          {f && <p className="muted">Ajouter un nouveau fichier remplace l’actuel.</p>}
        </section>; })}
      </div></TabsContent>

      <TabsContent value="todo"><section className="panel stage-form">
        <div className="panel-title"><h2>Avant la mise en vente</h2><span className="muted">{done}/{total}</span></div>
        <div className="progress" role="img" aria-label={`${done} tâches faites sur ${total}`}><span style={{ width: total ? done / total * 100 + '%' : '0%' }} /></div>
        {data.tasks.map(t => <div key={t.id} className="product-task"><input type="checkbox" aria-label={'Fait : ' + t.title} checked={t.done} onChange={e => set({ tasks: data.tasks.map(x => x.id === t.id ? { ...x, done: e.target.checked } : x) })} />
          <Input aria-label="Tâche" className={t.done ? 'line-through opacity-60' : ''} maxLength={300} value={t.title} onChange={e => set({ tasks: data.tasks.map(x => x.id === t.id ? { ...x, title: e.target.value } : x) })} />
          <Button type="button" variant="ghost" size="icon" aria-label={'Retirer ' + t.title} onClick={() => set({ tasks: data.tasks.filter(x => x.id !== t.id) })}><Trash2 size={16} /></Button></div>)}
        <div><Button type="button" variant="outline" onClick={() => set({ tasks: [...data.tasks, newTask()] })}><Plus size={16} />Ajouter une tâche</Button></div>
      </section></TabsContent>
    </Tabs>
    {product && <div className="flex justify-end"><Button type="button" variant="outline" className="text-destructive" disabled={busy} onClick={() => void erase()}><Trash2 size={16} />Supprimer le produit</Button></div>}
  </form>;
}

function MaterialCard({ material: m, onChange, onRemove }: { material: Material, onChange: (patch: Partial<Material>) => void, onRemove: () => void }) {
  return <div className="product-material">
    <div className="product-row"><Input aria-label="Matériau" placeholder="Ex. Fil de coton mouliné, jaune citron" maxLength={200} value={m.name} onChange={e => onChange({ name: e.target.value })} />
      <Button type="button" variant="ghost" size="icon" aria-label={'Retirer ' + (m.name || 'ce matériau')} onClick={onRemove}><Trash2 size={16} /></Button></div>
    <div className="product-row3">
      <div><span className={fieldLabel}>Quantité</span><Input aria-label="Quantité" placeholder="Ex. 2 écheveaux" maxLength={60} value={m.quantity} onChange={e => onChange({ quantity: e.target.value })} /></div>
      <div><span className={fieldLabel}>{m.purpose === 'kit' ? 'Coût par kit (€)' : 'Coût estimé (€)'}</span><Input aria-label="Coût" inputMode="decimal" value={m.unitCost ?? ''} onChange={e => onChange({ unitCost: num(e.target.value) })} placeholder="Ex. 1,20" /></div>
      <div><span className={fieldLabel}>Catégorie</span><select aria-label="Catégorie" value={m.purpose} onChange={e => onChange({ purpose: e.target.value as Material['purpose'] })}>{materialPurposes.map(p => <option key={p} value={p}>{materialPurposeLabels[p]}</option>)}</select></div>
    </div>
    <div className="product-links"><span className={fieldLabel}><ShoppingBasket size={13} className="inline" /> Où l’acheter</span>
      {m.links.map(l => <div key={l.id} className="product-link">
        <Input aria-label="Boutique" placeholder="Boutique" maxLength={80} value={l.shop} onChange={e => onChange({ links: m.links.map(x => x.id === l.id ? { ...x, shop: e.target.value } : x) })} />
        <Input aria-label="Lien d’achat" type="url" placeholder="https://…" value={l.url} onChange={e => onChange({ links: m.links.map(x => x.id === l.id ? { ...x, url: e.target.value } : x) })} />
        <Input aria-label="Note sur le lien" placeholder="Prix, lot…" maxLength={200} value={l.note} onChange={e => onChange({ links: m.links.map(x => x.id === l.id ? { ...x, note: e.target.value } : x) })} />
        {/^https:\/\//i.test(l.url) && <a className="product-open" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={'Ouvrir ' + (l.shop || 'le lien')}><ExternalLink size={16} /></a>}
        <Button type="button" variant="ghost" size="icon" aria-label="Retirer ce lien" onClick={() => onChange({ links: m.links.filter(x => x.id !== l.id) })}><Trash2 size={16} /></Button>
      </div>)}
      <div><Button type="button" variant="ghost" size="sm" onClick={() => onChange({ links: [...m.links, newShopLink()] })}><Plus size={14} />Ajouter un lien d’achat</Button></div>
    </div>
    <label className="product-bought"><input type="checkbox" checked={m.bought} onChange={e => onChange({ bought: e.target.checked })} />Déjà acheté</label>
  </div>;
}
