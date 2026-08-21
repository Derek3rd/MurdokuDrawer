import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GridCanvas } from '../components/GridCanvas';
import ClueForm from '../components/ClueForm';
import { useEditorStore } from '../store/useEditorStore';
import { computeAreas } from '../lib/grid';
import { areaDisplayName, areaCustomName } from '../lib/areaLabel';
import { describeClue } from '../lib/describeClue';
import { downloadPuzzleAsFile } from '../storage/puzzleStorage';
import { findVictimCell, solutionPositions, victimLetter } from '../lib/solve';
import { ELEMENT_CATALOG, elementCatalogEntry, parseCellId, type CellId, type ElementType } from '../types/puzzle';

type Tool = 'walls' | 'elements' | 'suspects';

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { puzzle, loadPuzzleById, rename, resize, toggleWallRight, toggleWallBottom, addElement, removeElement,
    setAreaName, setSuspectSolution, renameSuspect, setKiller, addClue, removeClue, addGlobalRule, removeGlobalRule } =
    useEditorStore();

  useEffect(() => {
    if (id) loadPuzzleById(id);
  }, [id, loadPuzzleById]);

  const [tool, setTool] = useState<Tool>('walls');
  const [selectedSuspectId, setSelectedSuspectId] = useState<string | null>(puzzle.suspects[0]?.id ?? null);
  const [selectedElementType, setSelectedElementType] = useState<ElementType>(ELEMENT_CATALOG[0].type);
  const [clueEditorFor, setClueEditorFor] = useState<string | null>(null);
  const [customRuleText, setCustomRuleText] = useState('');

  const areas = useMemo(() => computeAreas(puzzle), [puzzle]);
  const positions = useMemo(() => solutionPositions(puzzle), [puzzle]);
  const victim = useMemo(() => findVictimCell(puzzle, positions, areas), [puzzle, positions, areas]);

  if (!puzzle || puzzle.id !== id) return <p>Caricamento...</p>;

  const elementAt = (c: CellId) => puzzle.elements.find((e) => e.cellId === c);
  const suspectAt = (c: CellId) => puzzle.suspects.find((s) => s.solutionCellId === c);

  const rowColConflict = (c: CellId, suspectId: string): boolean => {
    const { row, col } = parseCellId(c);
    return puzzle.suspects.some(
      (s) =>
        s.id !== suspectId &&
        s.solutionCellId &&
        (parseCellId(s.solutionCellId).row === row || parseCellId(s.solutionCellId).col === col),
    );
  };

  const onCellClick = (c: CellId) => {
    if (tool === 'walls') {
      const areaId = areas.cellArea[c];
      const current = areaCustomName(areaId, puzzle.areaNames, areas) ?? '';
      const name = prompt("Nome per quest'area (lascia vuoto per rimuovere il nome):", current);
      if (name !== null) setAreaName(c, name);
    } else if (tool === 'elements') {
      const existing = elementAt(c);
      if (existing?.type === selectedElementType) {
        removeElement(existing.id);
      } else if (existing) {
        removeElement(existing.id);
        addElement({ type: selectedElementType, cellId: c });
      } else {
        addElement({ type: selectedElementType, cellId: c });
      }
    } else if (tool === 'suspects') {
      if (!selectedSuspectId) return;
      const existing = suspectAt(c);
      if (existing && existing.id !== selectedSuspectId) {
        alert(`Cella già occupata da ${existing.name}`);
        return;
      }
      const current = puzzle.suspects.find((s) => s.id === selectedSuspectId);
      if (current?.solutionCellId === c) {
        setSuspectSolution(selectedSuspectId, null); // click di nuovo per rimuovere
      } else {
        setSuspectSolution(selectedSuspectId, c);
      }
    }
  };

  const onEdgeClick = ({ side, cell }: { side: 'right' | 'bottom'; cell: CellId }) => {
    if (tool !== 'walls') return;
    if (side === 'right') toggleWallRight(cell);
    else toggleWallBottom(cell);
  };

  return (
    <div>
      <section className="mk-card">
        <div className="mk-row">
          <label className="mk-field" style={{ flex: 1 }}>
            Nome puzzle
            <input value={puzzle.name} onChange={(e) => rename(e.target.value)} />
          </label>
          <label className="mk-field">
            Colonne (X)
            <input
              type="number"
              min={2}
              max={20}
              value={puzzle.width}
              onChange={(e) => resize(Number(e.target.value), puzzle.height)}
            />
          </label>
          <label className="mk-field">
            Righe (Y)
            <input
              type="number"
              min={2}
              max={20}
              value={puzzle.height}
              onChange={(e) => resize(puzzle.width, Number(e.target.value))}
            />
          </label>
        </div>
        <div className="mk-row" style={{ marginTop: '0.5rem' }}>
          <button className="mk-btn secondary" onClick={() => downloadPuzzleAsFile(puzzle)}>
            Esporta JSON
          </button>
          <button className="mk-btn" onClick={() => navigate(`/play/${puzzle.id}`)}>
            Gioca questo Murdoku
          </button>
        </div>
      </section>

      <section className="mk-card">
        <div className="mk-toolbar">
          <button className={`mk-btn ${tool === 'walls' ? '' : 'secondary'}`} onClick={() => setTool('walls')}>
            🧱 Muri / Aree
          </button>
          <button className={`mk-btn ${tool === 'elements' ? '' : 'secondary'}`} onClick={() => setTool('elements')}>
            🗿 Oggetti
          </button>
          <button className={`mk-btn ${tool === 'suspects' ? '' : 'secondary'}`} onClick={() => setTool('suspects')}>
            🕵️ Sospettati
          </button>
        </div>

        {tool === 'suspects' && (
          <div className="mk-row" style={{ marginBottom: '0.5rem' }}>
            {puzzle.suspects.map((s) => (
              <span
                key={s.id}
                className={`mk-suspect-pill ${selectedSuspectId === s.id ? 'active' : ''}`}
                style={{ background: s.color }}
                onClick={() => setSelectedSuspectId(s.id)}
              >
                {s.name}
              </span>
            ))}
          </div>
        )}

        {tool === 'elements' && (
          <div className="mk-row" style={{ marginBottom: '0.5rem' }}>
            {ELEMENT_CATALOG.map((entry) => (
              <span
                key={entry.type}
                className={`mk-suspect-pill ${selectedElementType === entry.type ? 'active' : ''}`}
                style={{ background: '#495057' }}
                onClick={() => setSelectedElementType(entry.type)}
                title={entry.label}
              >
                {entry.icon} {entry.label}
              </span>
            ))}
          </div>
        )}

        <GridCanvas
          puzzle={puzzle}
          editableWalls={tool === 'walls'}
          onEdgeClick={onEdgeClick}
          onCellClick={onCellClick}
          cellClassName={(c) => {
            if (tool === 'suspects' && selectedSuspectId && rowColConflict(c, selectedSuspectId)) return 'locked';
            if (victim.cellId === c) return 'victim';
            return undefined;
          }}
          renderCell={(c) => {
            const el = elementAt(c);
            const sus = suspectAt(c);
            const name = puzzle.areaNames.find((a) => a.cellId === c)?.name;
            return (
              <>
                {name && <span className="mk-area-name">{name}</span>}
                {el && <span className="mk-element-icon">{elementCatalogEntry(el.type)?.icon}</span>}
                {sus && (
                  <span className="mk-confirmed" style={{ background: sus.color }}>
                    {sus.name[0]?.toUpperCase()}
                  </span>
                )}
                {victim.cellId === c && !sus && (
                  <span className="mk-victim-badge" title="Vittima">
                    {victimLetter(puzzle)}
                  </span>
                )}
              </>
            );
          }}
        />
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#666' }}>
          {tool === 'walls' &&
            'Trascina tra le celle per disegnare i muri che delimitano le aree. Clicca una cella per darle un nome.'}
          {tool === 'elements' &&
            'Scegli un oggetto sopra, poi clicca una cella per piazzarlo (clicca di nuovo lo stesso oggetto per rimuoverlo).'}
          {tool === 'suspects' &&
            'Seleziona un sospettato sopra, poi clicca la cella soluzione. Le celle in grigio sono bloccate da riga/colonna già occupate.'}
        </p>
        {victim.cellId ? (
          <p className="mk-status-ok">
            💀 Vittima ({victimLetter(puzzle)}) calcolata in cella {victim.cellId}
          </p>
        ) : (
          <p className="mk-status-unknown">Vittima non ancora determinabile: {victim.reason}</p>
        )}
      </section>

      <section className="mk-card">
        <h2>Sospettati e killer</h2>
        <ul className="mk-list">
          {puzzle.suspects.map((s) => (
            <li key={s.id}>
              <span className="mk-row" style={{ alignItems: 'center' }}>
                <span className="mk-badge" style={{ background: s.color }}>
                  &nbsp;
                </span>
                <input value={s.name} onChange={(e) => renameSuspect(s.id, e.target.value)} style={{ width: '10rem' }} />
                <span style={{ fontSize: '0.8rem', color: '#666' }}>
                  {s.solutionCellId ? `cella ${s.solutionCellId}` : 'nessuna cella'}
                </span>
              </span>
              <label style={{ fontSize: '0.85rem' }}>
                <input
                  type="radio"
                  name="killer"
                  checked={puzzle.killerId === s.id}
                  onChange={() => setKiller(s.id)}
                />{' '}
                Killer
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="mk-card">
        <h2>Indizi</h2>
        {puzzle.suspects.map((s) => (
          <div key={s.id} style={{ marginBottom: '0.75rem' }}>
            <strong style={{ color: s.color }}>{s.name}</strong>
            <ul className="mk-clue-list">
              {puzzle.clues
                .filter((c) => c.suspectId === s.id)
                .map((c) => (
                  <li key={c.id} className="mk-clue-item">
                    <span>{describeClue(c, puzzle, areas)}</span>
                    <button className="mk-btn danger" onClick={() => removeClue(c.id)}>
                      Rimuovi
                    </button>
                  </li>
                ))}
            </ul>
            {clueEditorFor === s.id ? (
              <ClueForm
                puzzle={puzzle}
                suspectId={s.id}
                areas={areas}
                onSubmit={(clue) => {
                  addClue(clue);
                  setClueEditorFor(null);
                }}
                onCancel={() => setClueEditorFor(null)}
              />
            ) : (
              <button className="mk-btn secondary" onClick={() => setClueEditorFor(s.id)}>
                + Aggiungi indizio
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="mk-card">
        <h2>Regole globali</h2>
        <ul className="mk-clue-list">
          {puzzle.globalRules.map((r) => (
            <li key={r.id} className="mk-clue-item">
              <span>
                {r.type === 'allAreasHaveSuspect' && 'Ogni area contiene almeno un sospettato'}
                {r.type === 'evenCountInAreas' &&
                  `Numero pari di sospettati in: ${r.areaIds.map((id) => areaDisplayName(id, puzzle.areaNames, areas)).join(', ')}`}
                {r.type === 'custom' && r.description}
              </span>
              <button className="mk-btn danger" onClick={() => removeGlobalRule(r.id)}>
                Rimuovi
              </button>
            </li>
          ))}
        </ul>
        <div className="mk-row" style={{ marginTop: '0.5rem' }}>
          <button className="mk-btn secondary" onClick={() => addGlobalRule({ type: 'allAreasHaveSuspect' })}>
            + Tutte le aree hanno un sospettato
          </button>
        </div>
        <div className="mk-row" style={{ marginTop: '0.5rem' }}>
          <input
            placeholder="Regola libera (testo)"
            value={customRuleText}
            onChange={(e) => setCustomRuleText(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="mk-btn secondary"
            onClick={() => {
              if (!customRuleText.trim()) return;
              addGlobalRule({ type: 'custom', description: customRuleText.trim() });
              setCustomRuleText('');
            }}
          >
            + Aggiungi regola libera
          </button>
        </div>
      </section>
    </div>
  );
}
