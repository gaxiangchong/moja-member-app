import { useEffect, useRef, useState } from 'react';
import {
  clearHomeAdSlideImage,
  createHomeAdSlide,
  deleteHomeAdSlide,
  fetchHomeAdSlides,
  resolveApiAssetUrl,
  updateHomeAdSlide,
  uploadHomeAdSlideImage,
  type HomeAdSlide,
  type HomeAdSlideInput,
} from '../api';

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const DEFAULT_BACKGROUND = 'linear-gradient(135deg, #fef3c7, #fde68a)';

type EditorForm = {
  title: string;
  body: string;
  backgroundCss: string;
  sortOrder: string;
  isActive: boolean;
};

function emptyForm(nextSortOrder: number): EditorForm {
  return { title: '', body: '', backgroundCss: DEFAULT_BACKGROUND, sortOrder: String(nextSortOrder), isActive: true };
}

function formFromSlide(s: HomeAdSlide): EditorForm {
  return {
    title: s.title,
    body: s.body,
    backgroundCss: s.backgroundCss,
    sortOrder: String(s.sortOrder ?? 0),
    isActive: s.isActive !== false,
  };
}

function SlidePreview({
  slide,
  style,
  showLabel = true,
}: {
  slide: { imageUrl?: string | null; backgroundCss: string; title: string };
  style?: React.CSSProperties;
  showLabel?: boolean;
}) {
  const imageUrl = slide.imageUrl ? resolveApiAssetUrl(slide.imageUrl) : '';
  return (
    <div
      className="adSlidePreview"
      style={{
        ...(imageUrl
          ? { backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: slide.backgroundCss || DEFAULT_BACKGROUND }),
        ...style,
      }}
    >
      {!imageUrl && showLabel ? <span className="adSlidePreviewTitle">{slide.title || 'Untitled'}</span> : null}
    </div>
  );
}

export function HomeAds() {
  const [slides, setSlides] = useState<HomeAdSlide[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<HomeAdSlide | null>(null);
  const [form, setForm] = useState<EditorForm>(() => emptyForm(0));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before the fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    fetchHomeAdSlides()
      .then(setSlides)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load slides'))
      .finally(() => setLoading(false));
  }, []);

  const sorted = slides ? [...slides].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) : [];

  function openCreate() {
    const nextSort = slides && slides.length ? Math.max(...slides.map((s) => s.sortOrder ?? 0)) + 10 : 0;
    setEditingSlide(null);
    setForm(emptyForm(nextSort));
    setFormError(null);
    setImageError(null);
    setSavedAt(null);
    setEditorOpen(true);
  }

  function openEdit(s: HomeAdSlide) {
    setEditingSlide(s);
    setForm(formFromSlide(s));
    setFormError(null);
    setImageError(null);
    setSavedAt(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
  }

  async function handleSave() {
    setFormError(null);
    if (!form.title.trim()) return setFormError('Title is required.');
    if (!form.body.trim()) return setFormError('Body is required.');
    if (!form.backgroundCss.trim()) return setFormError('Fallback background is required.');

    const input: HomeAdSlideInput = {
      title: form.title.trim(),
      body: form.body.trim(),
      backgroundCss: form.backgroundCss.trim(),
      sortOrder: Number.isFinite(Number(form.sortOrder)) ? Number(form.sortOrder) : 0,
      isActive: form.isActive,
    };

    setSaving(true);
    try {
      const saved = editingSlide
        ? await updateHomeAdSlide(editingSlide.id, input)
        : await createHomeAdSlide(input);
      setEditingSlide(saved);
      setForm(formFromSlide(saved));
      setSlides((prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((s) => s.id === saved.id);
        if (idx < 0) return [...prev, saved];
        return prev.map((s) => (s.id === saved.id ? saved : s));
      });
      setSavedAt(Date.now());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save slide');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingSlide) return;
    if (!window.confirm(`Delete "${editingSlide.title}"? This can't be undone.`)) return;
    setSaving(true);
    try {
      await deleteHomeAdSlide(editingSlide.id);
      setSlides((prev) => (prev ? prev.filter((s) => s.id !== editingSlide.id) : prev));
      closeEditor();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete slide');
    } finally {
      setSaving(false);
    }
  }

  async function handleImageFile(file: File) {
    if (!editingSlide) return;
    setImageError(null);
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setImageError('Unsupported image type. Use PNG, JPEG, WEBP, or GIF.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Image too large. Max 3 MB.');
      return;
    }
    setImageBusy(true);
    try {
      const updated = await uploadHomeAdSlideImage(editingSlide.id, file);
      setEditingSlide(updated);
      setSlides((prev) => (prev ? prev.map((s) => (s.id === updated.id ? updated : s)) : prev));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setImageBusy(false);
    }
  }

  async function handleRemoveImage() {
    if (!editingSlide) return;
    setImageBusy(true);
    setImageError(null);
    try {
      const updated = await clearHomeAdSlideImage(editingSlide.id);
      setEditingSlide(updated);
      setSlides((prev) => (prev ? prev.map((s) => (s.id === updated.id ? updated : s)) : prev));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to remove image');
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <div className="viewStack">
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2 className="panelTitle">Home ad carousel</h2>
            <p className="viewMuted" style={{ margin: '4px 0 0' }}>
              Slides shown on the client home screen between the points card and the rewards tiles. Active slides rotate automatically.
            </p>
          </div>
          <button type="button" className="toolbarButton toolbarButton--primary" onClick={openCreate}>
            + New slide
          </button>
        </div>
      </section>

      {loading ? <p className="viewMuted">Loading…</p> : null}
      {error ? <p className="viewError">{error}</p> : null}

      {!loading && !error ? (
        <section className="panel">
          <table className="dataTable">
            <thead>
              <tr>
                <th></th>
                <th>Title</th>
                <th>Body</th>
                <th>Sort</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id} className="dataTableRowClickable" onClick={() => openEdit(s)}>
                  <td><SlidePreview slide={s} style={{ width: 72, height: 44 }} showLabel={false} /></td>
                  <td>{s.title}</td>
                  <td className="dataTableMuted" style={{ maxWidth: 320, whiteSpace: 'normal' }}>{s.body}</td>
                  <td>{s.sortOrder}</td>
                  <td>
                    <span className={`badge badge--${s.isActive === false ? 'neutral' : 'success'}`}>
                      {s.isActive === false ? 'Hidden' : 'Visible'}
                    </span>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="dataTableEmpty">No ad slides yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {editorOpen ? (
        <div className="drawerBackdrop" onMouseDown={closeEditor}>
          <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
            <div className="drawerHead">
              <h2 className="panelTitle">{editingSlide ? 'Edit slide' : 'New slide'}</h2>
              <button type="button" className="drawerClose" onClick={closeEditor} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="drawerBody">
              <section>
                <h3 className="drawerSectionTitle">Preview</h3>
                <SlidePreview
                  slide={{ imageUrl: editingSlide?.imageUrl, backgroundCss: form.backgroundCss, title: form.title }}
                  style={{ width: '100%', height: 96 }}
                />
              </section>

              <section>
                <h3 className="drawerSectionTitle">Photo</h3>
                {editingSlide ? (
                  <>
                    <div
                      className={`imageDropzone${dragOver ? ' dragOver' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) void handleImageFile(file);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <p className="imageDropzoneHint">
                        {imageBusy ? 'Uploading…' : 'Click or drag a photo here — PNG, JPEG, WEBP, or GIF, max 3 MB'}
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) void handleImageFile(file);
                        }}
                      />
                    </div>
                    {imageError ? <p className="viewError">{imageError}</p> : null}
                    {editingSlide.imageUrl ? (
                      <div className="drawerRowActions" style={{ marginTop: 10 }}>
                        <button type="button" className="toolbarButton" onClick={() => fileInputRef.current?.click()} disabled={imageBusy}>
                          Replace photo
                        </button>
                        <button type="button" className="toolbarButton" onClick={handleRemoveImage} disabled={imageBusy}>
                          Remove photo
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="viewMuted">Save the slide first, then upload its photo.</p>
                )}
              </section>

              <section>
                <h3 className="drawerSectionTitle">Content</h3>
                <label className="filterField">
                  Title
                  <input
                    type="text" maxLength={120} value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </label>
                <label className="filterField" style={{ marginTop: 12 }}>
                  Body
                  <input
                    type="text" maxLength={500} value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  />
                </label>
                <label className="filterField" style={{ marginTop: 12 }}>
                  Fallback background <span className="viewMuted">— used when no photo is set; any CSS background value</span>
                  <input
                    type="text" maxLength={300} placeholder={DEFAULT_BACKGROUND} value={form.backgroundCss}
                    onChange={(e) => setForm((f) => ({ ...f, backgroundCss: e.target.value }))}
                  />
                </label>
              </section>

              <section>
                <h3 className="drawerSectionTitle">Visibility</h3>
                <div className="drawerFieldGrid">
                  <label className="filterField">
                    Sort order <span className="viewMuted">— lower shows first</span>
                    <input
                      type="number" value={form.sortOrder}
                      onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="switchRow" style={{ marginTop: 10 }}>
                  <span className="switch">
                    <input
                      type="checkbox" checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    />
                    <span className="switchTrack" aria-hidden />
                  </span>
                  <span>Show in client app</span>
                </label>
              </section>
            </div>

            <div className="drawerFooter">
              <div>
                {formError ? <span className="viewError">{formError}</span> : null}
                {!formError && savedAt ? <span className="viewMuted">Saved.</span> : null}
              </div>
              <div className="drawerRowActions">
                {editingSlide ? (
                  <button type="button" className="toolbarButton" onClick={handleDelete} disabled={saving}>
                    Delete
                  </button>
                ) : null}
                <button type="button" className="toolbarButton toolbarButton--primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : editingSlide ? 'Save changes' : 'Create slide'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
