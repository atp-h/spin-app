import React, { useState } from 'react';

function ItemList({ items, onAdd, onRemove, onEdit, newItem, setNewItem }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    if (newItem.trim()) {
      onAdd(newItem.trim());
    }
  };

  const startEditing = (index, value) => {
    setEditingIndex(index);
    setEditValue(value);
  };

  const saveEdit = (index) => {
    if (editValue.trim()) {
      onEdit(index, editValue.trim());
    }
    setEditingIndex(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  return (
    <div className="item-list">
      <h3>Items ({items.length})</h3>
      <form className="add-item" onSubmit={handleAdd}>
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add new item..."
        />
        <button type="submit">Add</button>
      </form>
      <div className="items">
        {items.map((item, index) => (
          <div key={index} className="item">
            {editingIndex === index ? (
              <>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && saveEdit(index)}
                  autoFocus
                />
                <button onClick={() => saveEdit(index)} title="Save">&#10003;</button>
                <button onClick={cancelEdit} title="Cancel">&#10005;</button>
              </>
            ) : (
              <>
                <span onClick={() => startEditing(index, item)} style={{ cursor: 'pointer' }}>
                  {item}
                </span>
                <button onClick={() => onRemove(index)} title="Remove">&#10005;</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ItemList;
