import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { PantryItem, Unit, Category } from '@preppal/types';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'cups', 'pieces', 'tsp', 'tbsp'];
const CATEGORIES: Category[] = ['produce', 'dairy', 'protein', 'pantry', 'spice', 'other'];
const CATEGORY_ICONS: Record<Category, string> = {
  produce: '🥦', dairy: '🥛', protein: '🥩', pantry: '🫙', spice: '🧂', other: '📦',
};

const fieldInp: React.CSSProperties = {
  background: 'var(--surf2)',
  border: '1px solid var(--bdr2)',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 12,
  color: 'var(--txt)',
  outline: 'none',
  fontFamily: 'var(--fb)',
  width: '100%',
  boxSizing: 'border-box',
};

const fieldSel: React.CSSProperties = {
  ...fieldInp,
  cursor: 'pointer',
  appearance: 'none' as React.CSSProperties['appearance'],
};

const fieldLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--txt2)',
  textTransform: 'uppercase' as React.CSSProperties['textTransform'],
  letterSpacing: '1px',
  display: 'block',
  marginBottom: 4,
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtractedItem {
  _id: string;
  name: string;
  quantity: number;
  unit: Unit;
  category: Category;
  confidence_score: number;
  original_receipt_text: string;
  deleted: boolean;
}

interface DupResolution {
  item: ExtractedItem;
  existing: PantryItem;
  action: 'update' | 'add-new' | 'skip';
}

type Phase = 'idle' | 'processing' | 'review' | 'duplicates' | 'saving' | 'success' | 'error';

interface Props {
  onClose: () => void;
  onSaved: () => Promise<void>;
  existingItems: PantryItem[];
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div
      className="animate-spin"
      style={{
        width: 36,
        height: 36,
        border: '3px solid var(--surf3)',
        borderTopColor: 'var(--acc)',
        borderRadius: '50%',
        flexShrink: 0,
      }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ScanReceiptModal({ onClose, onSaved, existingItems }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [reviewItems, setReviewItems] = useState<ExtractedItem[]>([]);
  const [dupResolutions, setDupResolutions] = useState<DupResolution[]>([]);
  const [pendingNonDups, setPendingNonDups] = useState<ExtractedItem[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ── Image processing ────────────────────────────────────────────────────────

  const processImage = async (file: File) => {
    if (file.size > 32 * 1024 * 1024) {
      setErrorMsg('File is too large. Please use a file under 32 MB.');
      setPhase('error');
      return;
    }

    setPhase('processing');
    setStatusMsg('Uploading image…');

    const { session } = useAuthStore.getState();
    if (!session) {
      setErrorMsg('Not authenticated. Please refresh and try again.');
      setPhase('error');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('image', file);

      setStatusMsg('Parsing receipt…');

      const { data, error } = await supabase.functions.invoke('parse-receipt', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      if (error) throw error;

      if (!data?.items || !Array.isArray(data.items)) {
        throw new Error('No items found');
      }

      const items: ExtractedItem[] = (data.items as any[])
        .map((item, i) => ({
          _id: `${i}-${Date.now()}`,
          name: String(item.name ?? '').trim(),
          quantity:
            typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
          unit: UNITS.includes(item.unit) ? (item.unit as Unit) : 'pieces',
          category: CATEGORIES.includes(item.category)
            ? (item.category as Category)
            : 'other',
          confidence_score:
            typeof item.confidence_score === 'number' ? item.confidence_score : 0.5,
          original_receipt_text: String(item.original_receipt_text ?? '').trim(),
          deleted: false,
        }))
        .filter((i) => i.name.length > 0);

      if (items.length === 0) {
        setErrorMsg(
          "We couldn't find any grocery items on this receipt. Try another photo or add items manually."
        );
        setPhase('error');
        return;
      }

      setReviewItems(items);
      setPhase('review');
    } catch (err) {
      console.error('[ScanReceipt] processImage error:', err);
      setErrorMsg(
        "We couldn't read this receipt clearly. Try another photo or add items manually."
      );
      setPhase('error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    e.target.value = '';
  };

  // ── Review helpers ──────────────────────────────────────────────────────────

  const updateItem = (id: string, field: keyof ExtractedItem, value: unknown) => {
    setReviewItems((prev) =>
      prev.map((i) => (i._id === id ? { ...i, [field]: value } : i))
    );
  };

  // ── Confirm / save flow ─────────────────────────────────────────────────────

  const handleConfirm = () => {
    const toAdd = reviewItems.filter((i) => !i.deleted && i.name.trim());
    if (toAdd.length === 0) { onClose(); return; }

    const dups: DupResolution[] = [];
    const nonDups: ExtractedItem[] = [];

    for (const item of toAdd) {
      const existing = existingItems.find(
        (p) => p.name.toLowerCase().trim() === item.name.toLowerCase().trim()
      );
      if (existing) {
        dups.push({ item, existing, action: 'update' });
      } else {
        nonDups.push(item);
      }
    }

    if (dups.length > 0) {
      setDupResolutions(dups);
      setPendingNonDups(nonDups);
      setPhase('duplicates');
      return;
    }

    saveItems(toAdd, []);
  };

  const handleDuplicatesConfirm = () => {
    saveItems(pendingNonDups, dupResolutions);
  };

  const saveItems = async (nonDups: ExtractedItem[], dups: DupResolution[]) => {
    setPhase('saving');

    const { session } = useAuthStore.getState();
    if (!session) {
      setErrorMsg('Not authenticated. Please refresh and try again.');
      setPhase('error');
      return;
    }

    let count = 0;

    try {
      if (nonDups.length > 0) {
        const inserts = nonDups.map((item) => ({
          user_id: session.user.id,
          name: item.name.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          expiry_date: null,
          notes: null,
          barcode: null,
          open_food_facts_id: null,
        }));
        const { error } = await supabase.from('pantry_items').insert(inserts);
        if (error) throw error;
        count += inserts.length;
      }

      for (const dup of dups) {
        if (dup.action === 'skip') continue;

        if (dup.action === 'update') {
          const newQty = dup.existing.quantity + dup.item.quantity;
          const { error } = await supabase
            .from('pantry_items')
            .update({ quantity: newQty })
            .eq('id', dup.existing.id);
          if (error) throw error;
          count++;
        } else if (dup.action === 'add-new') {
          const { error } = await supabase.from('pantry_items').insert({
            user_id: session.user.id,
            name: dup.item.name.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
            quantity: dup.item.quantity,
            unit: dup.item.unit,
            category: dup.item.category,
            expiry_date: null,
            notes: null,
            barcode: null,
            open_food_facts_id: null,
          });
          if (error) throw error;
          count++;
        }
      }

      setSavedCount(count);
      await onSaved();
      setPhase('success');
    } catch (err: any) {
      console.error('[ScanReceipt] saveItems error:', err);
      setErrorMsg('Failed to save items. Please try again.');
      setPhase('error');
    }
  };

  // ── Phase renders ────────────────────────────────────────────────────────────

  const renderIdle = () => (
    <>
      <ModalHeader title="📷 SCAN RECEIPT" onClose={onClose} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--txt2)', lineHeight: 1.6 }}>
          Upload a photo or PDF of your grocery receipt. We'll extract the items
          and let you review them before adding to your pantry.
        </p>

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          style={{
            border: '2px dashed var(--bdr2)',
            borderRadius: 14,
            padding: '40px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color .15s',
          }}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          onMouseOver={(e) =>
            ((e.currentTarget as HTMLDivElement).style.borderColor = 'var(--acc)')
          }
          onMouseOut={(e) =>
            ((e.currentTarget as HTMLDivElement).style.borderColor = 'var(--bdr2)')
          }
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)', marginBottom: 4 }}>
            Drop receipt here
          </div>
          <div style={{ fontSize: 12, color: 'var(--txt2)' }}>
            Image (JPG, PNG) or PDF · max 32 MB
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn"
            style={{ flex: 1 }}
            onClick={() => cameraInputRef.current?.click()}
          >
            📷 Take Photo
          </button>
          <button
            type="button"
            className="tbBtn"
            style={{ flex: 1, borderRadius: 9, fontSize: 13 }}
            onClick={() => fileInputRef.current?.click()}
          >
            📁 Upload File
          </button>
        </div>

        {/* Accepts images and PDFs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {/* capture="environment" opens the rear camera on mobile (images only) */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          {...{ capture: 'environment' }}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </>
  );

  const renderProcessing = () => (
    <>
      <ModalHeader title="📷 SCAN RECEIPT" />
      <div
        style={{
          padding: '64px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <Spinner />
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)' }}>{statusMsg}</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)' }}>This may take a few seconds…</div>
      </div>
    </>
  );

  const renderReview = () => {
    const visible = reviewItems.filter((i) => !i.deleted);

    return (
      <>
        <ModalHeader
          title="REVIEW PANTRY ITEMS"
          subtitle={`${visible.length} item${visible.length !== 1 ? 's' : ''} extracted from receipt`}
          onClose={onClose}
        />

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {reviewItems.map((item) => {
            if (item.deleted) return null;
            return (
              <div
                key={item._id}
                style={{
                  padding: '14px 24px',
                  borderBottom: '1px solid var(--bdr)',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  alignItems: 'start',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div
                    style={{ display: 'grid', gridTemplateColumns: '2fr 80px 90px', gap: 8 }}
                  >
                    <div>
                      <label style={fieldLabel}>Name</label>
                      <input
                        style={fieldInp}
                        value={item.name}
                        onChange={(e) => updateItem(item._id, 'name', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={fieldLabel}>Qty</label>
                      <input
                        style={fieldInp}
                        type="number"
                        min="0.01"
                        step="any"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item._id, 'quantity', Number(e.target.value) || 1)
                        }
                      />
                    </div>
                    <div>
                      <label style={fieldLabel}>Unit</label>
                      <select
                        style={fieldSel}
                        value={item.unit}
                        onChange={(e) => updateItem(item._id, 'unit', e.target.value as Unit)}
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={fieldLabel}>Category</label>
                    <select
                      style={fieldSel}
                      value={item.category}
                      onChange={(e) =>
                        updateItem(item._id, 'category', e.target.value as Category)
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {item.original_receipt_text && (
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--txt3)',
                        fontFamily: 'monospace',
                        marginTop: 2,
                      }}
                    >
                      "{item.original_receipt_text}"
                    </div>
                  )}
                </div>

                {/* Delete row */}
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => updateItem(item._id, 'deleted', true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--txt3)',
                    cursor: 'pointer',
                    fontSize: 16,
                    padding: '4px 6px',
                    borderRadius: 6,
                    marginTop: 20,
                    transition: 'color .15s',
                  }}
                  onMouseOver={(e) => ((e.currentTarget as HTMLButtonElement).style.color = '#FF6040')}
                  onMouseOut={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.color = 'var(--txt3)')
                  }
                >
                  ✕
                </button>
              </div>
            );
          })}

          {visible.length === 0 && (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: 'var(--txt2)',
                fontSize: 13,
              }}
            >
              All items removed. Cancel or try a different receipt.
            </div>
          )}
        </div>

        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--bdr)',
            display: 'flex',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <button type="button" onClick={onClose} className="btn" style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={visible.length === 0}
            className="tbBtn"
            style={{
              flex: 2,
              borderRadius: 9,
              fontSize: 14,
              opacity: visible.length === 0 ? 0.5 : 1,
              cursor: visible.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Add {visible.length} Item{visible.length !== 1 ? 's' : ''} to Pantry
          </button>
        </div>
      </>
    );
  };

  const renderDuplicates = () => (
    <>
      <ModalHeader
        title="EXISTING ITEMS"
        subtitle="These items are already in your pantry — choose an action for each"
        onClose={onClose}
      />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {dupResolutions.map((dup, idx) => (
          <div
            key={dup.item._id}
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--bdr)',
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)' }}>
                {CATEGORY_ICONS[dup.existing.category]} {dup.existing.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 3 }}>
                Currently {dup.existing.quantity} {dup.existing.unit} · Adding{' '}
                {dup.item.quantity} {dup.item.unit}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {(
                [
                  {
                    action: 'update' as const,
                    label: `Update to ${dup.existing.quantity + dup.item.quantity} ${dup.existing.unit}`,
                  },
                  { action: 'add-new' as const, label: 'Add as new item' },
                  { action: 'skip' as const, label: 'Skip' },
                ] as const
              ).map(({ action, label }) => {
                const active = dup.action === action;
                return (
                  <button
                    key={action}
                    type="button"
                    onClick={() =>
                      setDupResolutions((prev) =>
                        prev.map((d, i) => (i === idx ? { ...d, action } : d))
                      )
                    }
                    style={{
                      flex: 1,
                      padding: '8px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: `1px solid ${active ? 'var(--acc)' : 'var(--bdr2)'}`,
                      background: active ? 'rgba(200,255,0,0.1)' : 'var(--surf2)',
                      color: active ? 'var(--acc)' : 'var(--txt2)',
                      cursor: 'pointer',
                      transition: 'all .15s',
                      lineHeight: 1.35,
                      textAlign: 'center' as const,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--bdr)',
          display: 'flex',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setPhase('review')}
          className="btn"
          style={{ flex: 1 }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleDuplicatesConfirm}
          className="tbBtn"
          style={{ flex: 2, borderRadius: 9, fontSize: 14 }}
        >
          Confirm
        </button>
      </div>
    </>
  );

  const renderSaving = () => (
    <>
      <ModalHeader title="SAVING ITEMS" />
      <div
        style={{
          padding: '64px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <Spinner />
        <div style={{ fontSize: 14, color: 'var(--txt2)' }}>Saving to your pantry…</div>
      </div>
    </>
  );

  const renderSuccess = () => (
    <>
      <ModalHeader title="✓ ITEMS ADDED" onClose={onClose} />
      <div
        style={{
          padding: '56px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 52 }}>✅</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)' }}>
          {savedCount} item{savedCount !== 1 ? 's' : ''} added to your pantry!
        </div>
        <div style={{ fontSize: 13, color: 'var(--txt2)' }}>Your pantry has been updated.</div>
        <button
          type="button"
          onClick={onClose}
          className="tbBtn"
          style={{ marginTop: 8, borderRadius: 9, fontSize: 14, padding: '10px 36px' }}
        >
          Done
        </button>
      </div>
    </>
  );

  const renderError = () => (
    <>
      <ModalHeader title="SCAN RECEIPT" onClose={onClose} />
      <div
        style={{
          padding: '48px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 44 }}>⚠️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)' }}>
          Couldn't Read Receipt
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--txt2)',
            lineHeight: 1.6,
            maxWidth: 320,
          }}
        >
          {errorMsg ||
            "We couldn't read this receipt clearly. Try another photo or add items manually."}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button type="button" onClick={onClose} className="btn">
            Add Manually
          </button>
          <button
            type="button"
            onClick={() => { setPhase('idle'); setErrorMsg(''); }}
            className="tbBtn"
            style={{ borderRadius: 9 }}
          >
            Try Again
          </button>
        </div>
      </div>
    </>
  );

  // ── Modal shell ───────────────────────────────────────────────────────────────

  const phaseRender: Record<Phase, () => React.ReactNode> = {
    idle: renderIdle,
    processing: renderProcessing,
    review: renderReview,
    duplicates: renderDuplicates,
    saving: renderSaving,
    success: renderSuccess,
    error: renderError,
  };

  return (
    <div
      className="modalOverlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modalPanel"
        style={{
          width: 540,
          padding: 0,
          overflow: 'hidden',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {phaseRender[phase]()}
      </div>
    </div>
  );
}

// ── Shared header sub-component ────────────────────────────────────────────────

function ModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
}) {
  return (
    <div
      style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--bdr)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: subtitle ? 'flex-start' : 'center',
        flexShrink: 0,
      }}
    >
      <div>
        <div className="modalTitle">{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {onClose && (
        <button type="button" className="modalClose" onClick={onClose}>
          ✕
        </button>
      )}
    </div>
  );
}
