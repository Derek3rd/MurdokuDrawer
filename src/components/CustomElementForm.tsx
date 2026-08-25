import { useState } from 'react';
import type { CustomElementType } from '../types/puzzle';

interface CustomElementFormProps {
  onSubmit: (entry: Omit<CustomElementType, 'id'>) => void;
  onCancel: () => void;
}

interface ImagePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ImagePicker({ label, value, onChange }: ImagePickerProps) {
  const [sourceMode, setSourceMode] = useState<'upload' | 'url'>('upload');

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  };

  return (
    <div className="mk-row" style={{ alignItems: 'center' }}>
      <label className="mk-field">
        {label}
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
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://esempio.com/img.png" />
        </label>
      )}
      {value && <img src={value} alt="Anteprima" style={{ width: 40, height: 40, objectFit: 'contain' }} />}
    </div>
  );
}

export default function CustomElementForm({ onSubmit, onCancel }: CustomElementFormProps) {
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [occupiable, setOccupiable] = useState(true);
  const [multiCell, setMultiCell] = useState(false);
  const [capImage, setCapImage] = useState('');
  const [cornerImage, setCornerImage] = useState('');
  const [straightImage, setStraightImage] = useState('');

  const canSubmit =
    name.trim() !== '' && image !== '' && (!multiCell || (capImage !== '' && cornerImage !== '' && straightImage !== ''));

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      image,
      occupiable,
      ...(multiCell ? { capImage, cornerImage, straightImage } : {}),
    });
  };

  return (
    <div className="mk-card">
      <label className="mk-field">
        Nome oggetto
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Divano" />
      </label>

      <div style={{ marginTop: '0.5rem' }}>
        <ImagePicker label={multiCell ? 'Immagine (cella isolata)' : 'Immagine'} value={image} onChange={setImage} />
      </div>

      <label className="mk-field" style={{ marginTop: '0.5rem' }}>
        <span>
          <input type="checkbox" checked={occupiable} onChange={(e) => setOccupiable(e.target.checked)} /> I
          sospettati possono stare sopra questo oggetto
        </span>
      </label>

      <label className="mk-field" style={{ marginTop: '0.5rem' }}>
        <span>
          <input type="checkbox" checked={multiCell} onChange={(e) => setMultiCell(e.target.checked)} /> Oggetto
          multi-cella (es. un tavolo lungo): si piazza trascinando su più celle in linea
        </span>
      </label>

      {multiCell && (
        <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>
            Servono altre 3 immagini per le celle collegate a una, due (ad angolo) o due (opposte) celle vicine
            dello stesso oggetto.
          </p>
          <ImagePicker label="Immagine (un collegamento)" value={capImage} onChange={setCapImage} />
          <ImagePicker label="Immagine (due collegamenti ad angolo)" value={cornerImage} onChange={setCornerImage} />
          <ImagePicker label="Immagine (due collegamenti opposti)" value={straightImage} onChange={setStraightImage} />
        </div>
      )}

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
