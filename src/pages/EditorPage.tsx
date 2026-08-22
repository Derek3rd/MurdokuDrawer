import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GridCanvas } from '../components/GridCanvas';
import ClueForm from '../components/ClueForm';
import CustomElementForm from '../components/CustomElementForm';
import { useEditorStore } from '../store/useEditorStore';
import { areaColor } from '../components/GridCanvas';
import { areaCentroidCell, computeAreas } from '../lib/grid';
import { areaLabel, areaDisplayName, areaCustomName } from '../lib/areaLabel';
import { describeClue } from '../lib/describeClue';
import { downloadPuzzleAsFile } from '../storage/puzzleStorage';
import { ELEMENT_CATALOG, parseCellId, resolveElementType, type CellId, type Direction } from '../types/puzzle';

type Tool = 'walls' | 'elements' | 'suspects';

/** Chiave riservata usata per selezionare/piazzare la vittima nello strumento "Sospettati". */
const VICTIM_ID = 'victim';

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { puzzle, loadPuzzleById, rename, resize, toggleWallRight, toggleWallBottom, toggleWindow,
    toggleCellDisabled, addElement, removeElement, addCustomElementType, removeCustomElementType, setAreaName,
    setSuspectSolution, renameSuspect, setVictimSolution, setKiller, addClue, removeClue, clearCluesForSuspect,
    addGlobalRule, removeGlobalRule } =
    useEditorStore();

  useEffect(() => {
    if (id) loadPuzzleById(id);
  }, [id, loadPuzzleById]);

  const [tool, setTool] = useState<Tool>('walls');
  const [selectedSuspectId, setSelectedSuspectId] = useState<string | null>(puzzle.suspects[0]?.id ?? null);
  const [selectedElementType, setSelectedElementType] = useState<string>(ELEMENT_CATALOG[0].type);
  const [showCustomElementForm, setShowCustomElementForm] = useState(false);
  const [clueEditorFor, setClueEditorFor] = useState<string | null>(null);
  const [customRuleText, setCustomRuleText] = useState('');

  const areas = useMemo(() => computeAreas(puzzle), [puzzle]);

  if (!puzzle || puzzle.id !== id) return <p>Caricamento...</p>;

  const elementAt = (c: CellId) => puzzle.elements.find((e) => e.cellId === c);
  const suspectAt = (c: CellId) => puzzle.suspects.find((s) => s.solutionCellId === c);
  // Occupante di una cella tra sospettati e vittima (entrambi soggetti allo stesso vincolo
  // di posizione unica e allo stesso blocco riga/colonna).
  const occupantAt = (c: CellId): { id: string; label: string } | undefined => {
    const sus = suspectAt(c);
    if (sus) return { id: sus.id, label: sus.name };
    if (puzzle.victim.solutionCellId === c) return { id: VICTIM_ID, label: 'V' };
    return undefined;
  };
  const nonOccupiableLabel = (c: CellId): string | undefined => {
    const el = elementAt(c);
    const entry = el ? resolveElementType(el.type, puzzle.customElementTypes) : undefined;
    return entry && !entry.occupiable ? entry.label : undefined;
  };

  // Cella esclusa dalla riga/colonna di un qualsiasi sospettato o della vittima già piazzati:
  // indicazione sempre visibile, indipendente da chi è selezionato nello strumento.
  const isExcludedCell = (c: CellId): boolean => {
    const { row, col } = parseCellId(c);
    const placedCells = [...puzzle.suspects.map((s) => s.solutionCellId), puzzle.victim.solutionCellId];
    return placedCells.some((cid) => {
      if (!cid || cid === c) return false;
      const p = parseCellId(cid);
      return p.row === row || p.col === col;
    });
  };

  const onCellClick = (c: CellId) => {
    if (tool === 'walls') {
      toggleCellDisabled(c);
    } else if (puzzle.disabledCells.includes(c)) {
      return; // cella disattivata: non fa parte della mappa
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
      const existing = occupantAt(c);
      if (existing && existing.id !== selectedSuspectId) {
        alert(`Cella già occupata da ${existing.label}`);
        return;
      }
      const blockedBy = nonOccupiableLabel(c);
      if (blockedBy) {
        alert(`Un sospettato non può stare sopra "${blockedBy}".`);
        return;
      }
      if (selectedSuspectId === VICTIM_ID) {
        setVictimSolution(puzzle.victim.solutionCellId === c ? null : c); // click di nuovo per rimuovere
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

  const onWindowClick = ({ cellId, side }: { cellId: CellId; side: Direction }) => {
    if (tool !== 'walls') return;
    toggleWindow(cellId, side);
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
              max={16}
              value={puzzle.width}
              onChange={(e) => resize(Number(e.target.value), puzzle.height)}
            />
          </label>
          <label className="mk-field">
            Righe (Y)
            <input
              type="number"
              min={2}
              max={16}
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
            <span
              className={`mk-suspect-pill ${selectedSuspectId === VICTIM_ID ? 'active' : ''}`}
              style={{ background: puzzle.victim.color }}
              onClick={() => setSelectedSuspectId(VICTIM_ID)}
            >
              V (vittima)
            </span>
          </div>
        )}

        {tool === 'elements' && (
          <>
            <div className="mk-row" style={{ marginBottom: '0.5rem', alignItems: 'center' }}>
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
              {puzzle.customElementTypes.map((entry) => (
                <span
                  key={entry.id}
                  className={`mk-suspect-pill ${selectedElementType === entry.id ? 'active' : ''}`}
                  style={{ background: '#495057' }}
                  onClick={() => setSelectedElementType(entry.id)}
                  title={entry.occupiable ? entry.name : `${entry.name} (non occupabile)`}
                >
                  <img src={entry.image} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />{' '}
                  {entry.name}
                  {!entry.occupiable && ' 🚫'}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Eliminare l'oggetto personalizzato "${entry.name}"?`)) {
                        removeCustomElementType(entry.id);
                        if (selectedElementType === entry.id) setSelectedElementType(ELEMENT_CATALOG[0].type);
                      }
                    }}
                    style={{ marginLeft: '0.3rem' }}
                    title="Elimina"
                  >
                    ✕
                  </span>
                </span>
              ))}
              <button className="mk-btn secondary" onClick={() => setShowCustomElementForm((v) => !v)}>
                + Nuovo oggetto
              </button>
            </div>
            {showCustomElementForm && (
              <CustomElementForm
                onSubmit={(entry) => {
                  const id = addCustomElementType(entry);
                  setSelectedElementType(id);
                  setShowCustomElementForm(false);
                }}
                onCancel={() => setShowCustomElementForm(false)}
              />
            )}
          </>
        )}

        <GridCanvas
          puzzle={puzzle}
          editableWalls={tool === 'walls'}
          onEdgeClick={onEdgeClick}
          onCellClick={onCellClick}
          windows={puzzle.windows}
          onWindowClick={onWindowClick}
          editableWindows={tool === 'walls'}
          cellClassName={(c) => {
            if (tool === 'suspects' && isExcludedCell(c)) return 'locked';
            if (puzzle.victim.solutionCellId === c) return 'victim';
            return undefined;
          }}
          renderCell={(c) => {
            const el = elementAt(c);
            const elEntry = el ? resolveElementType(el.type, puzzle.customElementTypes) : undefined;
            const sus = suspectAt(c);
            const isVictimHere = puzzle.victim.solutionCellId === c;
            const areaId = areas.cellArea[c];
            const areaName = areaCustomName(areaId, puzzle.areaNames, areas);
            const name = areaName && areaCentroidCell(areas.areaCells[areaId]) === c ? areaName : undefined;
            return (
              <>
                {name && <span className="mk-area-name">{name}</span>}
                {elEntry && (
                  <span className="mk-element-icon" title={elEntry.label}>
                    {elEntry.image ? <img src={elEntry.image} alt="" /> : elEntry.icon}
                  </span>
                )}
                {sus && (
                  <span className="mk-confirmed" style={{ background: sus.color }}>
                    {sus.name[0]?.toUpperCase()}
                  </span>
                )}
                {isVictimHere && !sus && (
                  <span className="mk-victim-badge" title="Vittima">
                    V
                  </span>
                )}
              </>
            );
          }}
        />
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#666' }}>
          {tool === 'walls' &&
            "Trascina tra le celle per i muri, sul bordo esterno per le finestre. Clicca una cella per attivarla/disattivarla (griglie non rettangolari). Dai un nome alle aree nell'elenco qui sotto."}
          {tool === 'elements' &&
            'Scegli un oggetto sopra, poi clicca una cella per piazzarlo (clicca di nuovo lo stesso oggetto per rimuoverlo).'}
          {tool === 'suspects' &&
            'Seleziona un sospettato (o la vittima V) sopra, poi clicca la cella soluzione. Le celle in grigio sono bloccate da riga/colonna già occupate.'}
        </p>
        <p className={puzzle.victim.solutionCellId ? 'mk-status-ok' : 'mk-status-unknown'}>
          {puzzle.victim.solutionCellId
            ? `💀 Vittima (V) piazzata in cella ${puzzle.victim.solutionCellId}`
            : 'Vittima non ancora piazzata: selezionala nello strumento "Sospettati" e scegli una cella.'}
        </p>
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
          <li>
            <span className="mk-row" style={{ alignItems: 'center' }}>
              <span className="mk-badge" style={{ background: puzzle.victim.color }}>
                &nbsp;
              </span>
              <strong style={{ width: '10rem', display: 'inline-block' }}>V (vittima)</strong>
              <span style={{ fontSize: '0.8rem', color: '#666' }}>
                {puzzle.victim.solutionCellId ? `cella ${puzzle.victim.solutionCellId}` : 'nessuna cella'}
              </span>
            </span>
          </li>
        </ul>
      </section>

      <section className="mk-card">
        <h2>Aree</h2>
        {areas.areaIds.length === 0 ? (
          <p>Nessuna area: disegna dei muri per crearne.</p>
        ) : (
          <ul className="mk-list">
            {areas.areaIds.map((areaId, i) => {
              const anchor = areaCentroidCell(areas.areaCells[areaId]);
              const currentName = areaCustomName(areaId, puzzle.areaNames, areas) ?? '';
              return (
                <li key={areaId}>
                  <span className="mk-row" style={{ alignItems: 'center' }}>
                    <span className="mk-badge" style={{ background: areaColor(i) }}>
                      &nbsp;
                    </span>
                    <input
                      value={currentName}
                      placeholder={areaLabel(areaId)}
                      onChange={(e) => setAreaName(anchor, e.target.value)}
                      style={{ width: '12rem' }}
                    />
                    <span style={{ fontSize: '0.8rem', color: '#666' }}>
                      {areas.areaCells[areaId].length} celle
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mk-card">
        <h2>Indizi</h2>
        {puzzle.suspects.map((s) => {
          const suspectClues = puzzle.clues.filter((c) => c.suspectId === s.id);
          return (
          <div key={s.id} style={{ marginBottom: '0.75rem' }}>
            <strong style={{ color: s.color }}>{s.name}</strong>
            <ul className="mk-clue-list">
              {suspectClues.map((c) => (
                  <li key={c.id} className="mk-clue-item">
                    <span>{describeClue(c, puzzle, areas)}</span>
                    <button className="mk-btn danger" onClick={() => removeClue(c.id)}>
                      Rimuovi
                    </button>
                  </li>
                ))}
            </ul>
            {suspectClues.length > 0 && (
              <button
                className="mk-btn danger"
                onClick={() => {
                  if (confirm(`Svuotare tutti gli indizi di ${s.name}?`)) clearCluesForSuspect(s.id);
                }}
              >
                Svuota tutti gli indizi
              </button>
            )}
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
          );
        })}
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
