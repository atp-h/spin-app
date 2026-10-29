import React, { useState } from 'react';

const MAX_WEIGHT = 5;

// items are { label, weight } slices; every change hands the full new list to onChange
function ItemList({ items, onChange, onFillFromPlayers, disabled, open, onToggle, eliminated = [] }) {
  const [newItem, setNewItem] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    const label = newItem.trim();
    if (disabled || !label) return;
    onChange([...items, { label, weight: 1 }]);
    setNewItem('');
  };

  const bulkLabels = bulkText.split('\n').map(l => l.trim()).filter(Boolean);

  const handleBulkAdd = () => {
    if (disabled || !bulkLabels.length) return;
    onChange([...items, ...bulkLabels.map(label => ({ label, weight: 1 }))]);
    setBulkText('');
    setBulkMode(false);
  };

  const startEditing = (index) => {
    if (disabled) return;
    setEditingIndex(index);
    setEditValue(items[index].label);
  };

  const saveEdit = (index) => {
    const label = editValue.trim();
    if (label && label !== items[index].label) {
      onChange(items.map((item, i) => (i === index ? { ...item, label } : item)));
    }
    setEditingIndex(null);
  };

  const cycleWeight = (index) => {
    if (disabled) return;
    onChange(items.map((item, i) => (i === index ? { ...item, weight: item.weight >= MAX_WEIGHT ? 1 : item.weight + 1 } : item)));
  };

  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);

  return (
    <div className={`item-list ${open ? 'open' : ''}`}>
      <button type="button" className="item-list-toggle" onClick={onToggle} aria-expanded={open}>
        <span>
          <strong>Items</strong> <span className="muted">({items.length})</span>
        </span>
        <span className="item-list-preview">
          {!open && items.slice(0, 4).map(i => i.label).join(' · ')}
          {!open && items.length > 4 && ' …'}
        </span>
        <span className="chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="item-list-body">
          {bulkMode ? (
            <div className="bulk-add">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'Eén item per regel\nPizza\nSushi\nTacos'}
                rows={5}
                autoFocus
              />
              <div className="bulk-actions">
                <button type="button" className="btn-ghost" onClick={() => setBulkMode(false)}>Annuleren</button>
                <button type="button" className="btn-primary" onClick={handleBulkAdd} disabled={disabled || !bulkLabels.length}>
                  {bulkLabels.length ? `${bulkLabels.length} toevoegen` : 'Toevoegen'}
                </button>
              </div>
            </div>
          ) : (
            <form className="add-item" onSubmit={handleAdd}>
              <input
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Add new item..."
              />
              <button type="submit" disabled={disabled || !newItem.trim()}>Add</button>
            </form>
          )}

          <div className="item-tools">
            {!bulkMode && (
              <button type="button" className="chip-btn" onClick={() => setBulkMode(true)} disabled={disabled}>
                📋 Lijst plakken
              </button>
            )}
            {onFillFromPlayers && (
              <button type="button" className="chip-btn" onClick={onFillFromPlayers} disabled={disabled}>
                🍺 Aanwezige spelers
              </button>
            )}
          </div>

          <div className="items">
            {items.map((item, index) => {
              const out = eliminated.includes(item.label);
              return (
                <div key={index} className={`item ${out ? 'eliminated' : ''}`}>
                  {editingIndex === index ? (
                    <>
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(index);
                          if (e.key === 'Escape') setEditingIndex(null);
                        }}
                        onBlur={() => saveEdit(index)}
                        autoFocus
                      />
                    </>
                  ) : (
                    <>
                      <span onClick={() => startEditing(index)} title="Klik om te bewerken">
                        {item.label}
                      </span>
                      <button
                        type="button"
                        className={`weight-badge ${item.weight > 1 ? 'heavy' : ''}`}
                        onClick={() => cycleWeight(index)}
                        disabled={disabled}
                        title={`Kans: ${Math.round((item.weight / totalWeight) * 100)}% — klik voor meer gewicht`}
                        aria-label={`Gewicht ${item.weight}`}
                      >
                        ×{item.weight}
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange(items.filter((_, i) => i !== index))}
                        title="Remove"
                        disabled={disabled}
                      >
                        &#10005;
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {items.length > 1 && (
            <p className="item-hint">Tip: tik op ×1 om een item meer kans te geven (tot ×{MAX_WEIGHT}).</p>
          )}
        </div>
      )}
    </div>
  );
}

export default ItemList;
