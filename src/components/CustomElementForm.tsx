import { useState } from 'react';
import type { CustomElementType } from '../types/puzzle';

interface CustomElementFormProps {
  onSubmit: (entry: Omit<CustomElementType, 'id'>) => void;
  onCancel: () => void;
}

export default function CustomElementForm({ onSubmit, onCancel }: CustomElementFormProps) {
  const [name, setName] = useState('');
  const [sourceMode, setSourceMode] = useState<'upload' | 'url'>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [imageDataUri, setImageDataUri] = useState('');
  const [occupiable, setOccupiable] = useState(true);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setImageDataUri(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  };

  const image = sourceMode === 'upload' ? imageDataUri : imageUrl.trim();
  const canSubmit = name.trim() !== '' && image !== '';

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), image, occupiable });
  };

  return (
    <div className="mk-card">
      <label className="mk-field">
        Nome oggetto
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Divano" />
      </label>

      <div className="mk-row" style={{ marginTop: '0.5rem' }}>
        <label className="mk-field">
          Immagine
          <select value={sourceMode} onChange={(e) => setSourceMode(e.target.value as 'upload' | 'url')}>
            <option value="upload">Carica un file</option>
            <option value="url">Link ad un'immagine</option>
          </select>
        </label>
        {sourceMode === 'upload' ? (
          <label className="mk-field">
            File (PNG, SVG, JPG...)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
        ) : (
          <label className="mk-field" style={{ flex: 1 }}>
            URL immagine
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://esempio.com/divano.png"
            />
          </label>
        )}
        {image && <img src={image} alt="Anteprima" style={{ width: 48, height: 48, objectFit: 'contain' }} />}
      </div>

      <label className="mk-field" style={{ marginTop: '0.5rem' }}>
        <span>
          <input type="checkbox" checked={occupiable} onChange={(e) => setOccupiable(e.target.checked)} /> I
          sospettati possono stare sopra questo oggetto
        </span>
      </label>

      <div className="mk-row" style={{ marginTop: '0.5rem' }}>
        <button className="mk-btn" onClick={submit} disabled={!canSubmit}>
          Crea oggetto
        </button>
        <button className="mk-btn secondary" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </div>
  );
}
