import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPuzzles, readPuzzleFromFile, savePuzzle } from '../storage/puzzleStorage';
import { createEmptyPuzzle } from '../types/puzzle';

export default function HomePage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState(6);
  const [height, setHeight] = useState(6);
  const [puzzles, setPuzzles] = useState(listPuzzles());
  const [error, setError] = useState<string | null>(null);

  const createPuzzle = () => {
    const p = createEmptyPuzzle(width, height);
    savePuzzle(p);
    navigate(`/editor/${p.id}`);
  };

  const handleImport = async (file: File) => {
    try {
      const p = await readPuzzleFromFile(file);
      savePuzzle(p);
      navigate(`/editor/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import fallito');
    }
  };

  return (
    <div>
      <section className="mk-card">
        <h2>Crea un nuovo Murdoku</h2>
        <div className="mk-row">
          <label className="mk-field">
            Colonne (X)
            <input
              type="number"
              min={2}
              max={16}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <label className="mk-field">
            Righe (Y)
            <input
              type="number"
              min={2}
              max={16}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
          </label>
        </div>
        <p>Sospettati: {Math.max(0, Math.min(width, height) - 1)}</p>
        <button className="mk-btn" onClick={createPuzzle}>
          Crea ed apri l'editor
        </button>
        <span style={{ margin: '0 0.5rem' }}>oppure</span>
        <button className="mk-btn secondary" onClick={() => fileInput.current?.click()}>
          Importa JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = '';
          }}
        />
        {error && <p className="mk-status-bad">{error}</p>}
      </section>

      <section className="mk-card">
        <h2>I tuoi puzzle</h2>
        {puzzles.length === 0 && <p>Nessun puzzle salvato ancora.</p>}
        <ul className="mk-list">
          {puzzles.map((p) => (
            <li key={p.id}>
              <span>
                {p.name} ({p.width}x{p.height})
              </span>
              <span className="mk-row">
                <button className="mk-btn secondary" onClick={() => navigate(`/editor/${p.id}`)}>
                  Modifica
                </button>
                <button className="mk-btn" onClick={() => navigate(`/play/${p.id}`)}>
                  Gioca
                </button>
              </span>
            </li>
          ))}
        </ul>
        {puzzles.length > 0 && (
          <button className="mk-btn secondary" onClick={() => setPuzzles(listPuzzles())} style={{ marginTop: '0.5rem' }}>
            Aggiorna elenco
          </button>
        )}
      </section>
    </div>
  );
}
