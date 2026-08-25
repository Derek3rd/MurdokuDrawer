import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GridCanvas } from '../components/GridCanvas';
import SuspectMarker from '../components/SuspectMarker';
import iconCancella from '../assets/ui/cancella.svg';
import iconCroce from '../assets/ui/croce.svg';
import { usePlayStore } from '../store/usePlayStore';
import { loadPuzzle } from '../storage/puzzleStorage';
import { areaBottomLabelAnchor, computeAreas } from '../lib/grid';
import { describeClue } from '../lib/describeClue';
import { areaCustomName, areaDisplayName } from '../lib/areaLabel';
import { elementConnections, fixedFootprintGroups, isCornerDiagonalFilled, resolveElementVisual } from '../lib/elementShape';
import { isMultiCellType, parseCellId, resolveElementType, type CellId, type Puzzle } from '../types/puzzle';

/** Chiave riservata usata per la vittima nelle mappe confirmed/candidates, come un sospettato in più. */
const VICTIM_ID = 'victim';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((ch) => ch + ch).join('') : clean;
  const value = parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function PlayPage() {
  const { id } = useParams();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const {
    puzzleId,
    playState,
    history,
    load,
    toggleCandidate,
    clearCellCandidates,
    toggleManualMark,
    confirmSuspect,
    unconfirmSuspect,
    undo,
    reset,
  } = usePlayStore();
  const [selectedSuspectId, setSelectedSuspectId] = useState<string | null>(null);
  const [result, setResult] = useState<'pending' | 'correct' | 'incorrect'>('pending');
  // In questa modalità il tap segna/toglie una X manuale sulla cella (non legata a un
  // sospettato), invece di segnare un candidato per il sospettato selezionato.
  const [markMode, setMarkMode] = useState(false);
  // In questa modalità il tap svuota tutte le posizioni probabili segnate su una cella.
  const [clearMode, setClearMode] = useState(false);

  useEffect(() => {
    if (!id) return;
    const p = loadPuzzle(id);
    setPuzzle(p);
    load(id);
    if (p) setSelectedSuspectId(p.suspects[0]?.id ?? null);
  }, [id, load]);

  const areas = useMemo(() => (puzzle ? computeAreas(puzzle) : null), [puzzle]);
  const footprintGroups = useMemo(
    () => (puzzle ? fixedFootprintGroups(puzzle.elements, (type) => resolveElementType(type, puzzle.customElementTypes)) : []),
    [puzzle],
  );
  const footprintCoveredCells = useMemo(() => new Set(footprintGroups.flatMap((g) => g.cellIds)), [footprintGroups]);

  if (!puzzle || !areas || puzzleId !== id) return <p>Caricamento...</p>;

  const confirmed = playState.confirmed;

  // Blocca il tentativo di confermare `suspectId` in `c` se la riga/colonna è già
  // occupata da un altro sospettato confermato (esclude la propria posizione attuale,
  // per permettere di spostare la conferma).
  const isLockedForOther = (c: CellId, suspectId: string): boolean => {
    const { row, col } = parseCellId(c);
    return Object.entries(confirmed).some(([sid, cid]) => {
      if (sid === suspectId) return false;
      const p = parseCellId(cid);
      return p.row === row || p.col === col;
    });
  };

  const isOccupiable = (c: CellId): boolean => {
    const el = puzzle.elements.find((e) => e.cellId === c);
    if (!el) return true;
    const entry = resolveElementType(el.type, puzzle.customElementTypes);
    return !entry || entry.occupiable;
  };

  // Cella esclusa da un qualsiasi sospettato già confermato (stessa riga o colonna):
  // indicazione sempre visibile, indipendente da quale sospettato è selezionato. Le celle
  // già non occupabili per via di un oggetto non vengono segnate: la X automatica serve
  // solo a segnalare celle altrimenti valide.
  const isAutoExcludedCell = (c: CellId): boolean => {
    if (!isOccupiable(c)) return false;
    const { row, col } = parseCellId(c);
    return Object.values(confirmed).some((cid) => {
      if (cid === c) return false;
      const p = parseCellId(cid);
      return p.row === row || p.col === col;
    });
  };

  // Click breve: in modalità "segna cella" segna/toglie una X manuale sulla cella
  // (uguale nell'aspetto a quella automatica, ma non legata ad un sospettato); in modalità
  // "svuota cella" cancella sia le posizioni probabili sia l'eventuale X manuale segnate lì
  // (non quella automatica, calcolata a parte); altrimenti segna/toglie un candidato per il
  // sospettato selezionato. Le X automatiche di riga/colonna restano sempre: il giocatore non
  // può toglierle.
  const onCellTap = (c: CellId) => {
    if (puzzle.disabledCells.includes(c)) return; // cella fuori dalla mappa
    if (markMode) {
      toggleManualMark(c);
      return;
    }
    if (clearMode) {
      clearCellCandidates(c);
      return;
    }
    if (!selectedSuspectId) return;
    if (confirmed[selectedSuspectId]) return; // già confermato, niente candidati
    toggleCandidate(c, selectedSuspectId);
    setResult('pending');
  };

  // Pressione prolungata: conferma (o rimuove la conferma) la posizione definitiva.
  const onCellLongPress = (c: CellId) => {
    if (puzzle.disabledCells.includes(c)) return; // cella fuori dalla mappa
    if (!selectedSuspectId) return;
    if (confirmed[selectedSuspectId] === c) {
      unconfirmSuspect(selectedSuspectId);
      setResult('pending');
      return;
    }
    if (isLockedForOther(c, selectedSuspectId)) {
      alert('Riga o colonna già occupata da un altro sospettato confermato.');
      return;
    }
    const el = puzzle.elements.find((e) => e.cellId === c);
    const elEntry = el ? resolveElementType(el.type, puzzle.customElementTypes) : undefined;
    if (elEntry && !elEntry.occupiable) {
      alert(`Un sospettato non può stare sopra "${elEntry.label}".`);
      return;
    }
    confirmSuspect(selectedSuspectId, c);
    setResult('pending');
  };

  const checkSolution = () => {
    const allConfirmed = puzzle.suspects.every((s) => confirmed[s.id]) && !!confirmed[VICTIM_ID];
    if (!allConfirmed) {
      alert('Conferma la posizione di tutti i sospettati e della vittima prima di verificare.');
      return;
    }
    const ok =
      puzzle.suspects.every((s) => confirmed[s.id] === s.solutionCellId) &&
      confirmed[VICTIM_ID] === puzzle.victim.solutionCellId;
    setResult(ok ? 'correct' : 'incorrect');
  };

  const killer = puzzle.suspects.find((s) => s.id === puzzle.killerId);

  return (
    <div>
      <section className="mk-card">
        <div className="mk-row" style={{ justifyContent: 'space-between' }}>
          <h2>{puzzle.name}</h2>
          <Link to={`/editor/${puzzle.id}`} className="mk-btn secondary">
            Modifica
          </Link>
        </div>

        <div className="mk-row" style={{ marginBottom: '0.5rem' }}>
          {puzzle.suspects.map((s) => (
            <span
              key={s.id}
              className={`mk-suspect-pill ${selectedSuspectId === s.id ? 'active' : ''}`}
              style={{ background: s.color, opacity: confirmed[s.id] ? 1 : 0.85 }}
              onClick={() => {
                setSelectedSuspectId(s.id);
                setMarkMode(false);
                setClearMode(false);
              }}
            >
              {s.name}
              {confirmed[s.id] ? ' ✓' : ''}
            </span>
          ))}
          <span
            className={`mk-suspect-pill ${selectedSuspectId === VICTIM_ID ? 'active' : ''}`}
            style={{ background: puzzle.victim.color, opacity: confirmed[VICTIM_ID] ? 1 : 0.85 }}
            onClick={() => {
              setSelectedSuspectId(VICTIM_ID);
              setMarkMode(false);
              setClearMode(false);
            }}
          >
            V{confirmed[VICTIM_ID] ? ' ✓' : ''}
          </span>
        </div>

        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          Seleziona un sospettato (o la vittima V), poi tocca una cella per segnare un candidato (●), tieni premuto
          per confermarne la posizione definitiva. Con "Segna cella" attivo, il tap segna invece una cella come
          non occupabile da nessuno: le X grigie (automatiche o manuali) hanno lo stesso aspetto, ma solo quelle
          manuali si possono togliere. Con "Svuota cella" attivo, il tap cancella in un colpo solo sia le posizioni
          probabili sia l'eventuale X manuale segnate su quella cella.
        </p>

        <div className="mk-toolbar">
          <button
            className={`mk-btn ${markMode ? '' : 'secondary'}`}
            onClick={() => {
              setMarkMode((m) => !m);
              setClearMode(false);
              setSelectedSuspectId(null);
            }}
          >
            <img src={iconCroce} alt="" className="mk-btn-icon" /> Segna cella
          </button>
          <button
            className={`mk-btn ${clearMode ? '' : 'secondary'}`}
            onClick={() => {
              setClearMode((m) => !m);
              setMarkMode(false);
              setSelectedSuspectId(null);
            }}
          >
            <img src={iconCancella} alt="" className="mk-btn-icon" /> Svuota cella
          </button>
          <button className="mk-btn" onClick={checkSolution}>
            Verifica soluzione
          </button>
          <button className="mk-btn secondary" disabled={history.length === 0} onClick={() => undo()}>
            ↩️ Annulla
          </button>
          <button
            className="mk-btn danger"
            onClick={() => {
              if (confirm('Ricominciare da capo?')) {
                reset();
                setResult('pending');
              }
            }}
          >
            Reset
          </button>
        </div>

        <GridCanvas
          puzzle={puzzle}
          windows={puzzle.windows}
          disabledCellsHidden
          cellClassName={(c) => {
            if (isAutoExcludedCell(c) || playState.manualMarks.includes(c)) return 'locked';
            return undefined;
          }}
          cellStyle={(c) => {
            if (!selectedSuspectId) return undefined;
            if (!(playState.candidates[c] ?? []).includes(selectedSuspectId)) return undefined;
            const color =
              selectedSuspectId === VICTIM_ID
                ? puzzle.victim.color
                : puzzle.suspects.find((s) => s.id === selectedSuspectId)?.color;
            if (!color) return undefined;
            return { boxShadow: `inset 0 0 0 999px ${hexToRgba(color, 0.3)}` };
          }}
          areaLabels={areas.areaIds
            .map((areaId) => {
              const text = areaCustomName(areaId, puzzle.areaNames, areas);
              return text ? { ...areaBottomLabelAnchor(areas.areaCells[areaId]), text } : null;
            })
            .filter((l): l is NonNullable<typeof l> => l !== null)}
          spanningImages={footprintGroups}
          onCellClick={onCellTap}
          onCellLongPress={onCellLongPress}
          renderCell={(c) => {
            const el = footprintCoveredCells.has(c) ? undefined : puzzle.elements.find((e) => e.cellId === c);
            const elEntry = el ? resolveElementType(el.type, puzzle.customElementTypes) : undefined;
            const connections = el ? elementConnections(el, puzzle.elements) : [];
            const diagonalFilled = el ? isCornerDiagonalFilled(el, puzzle.elements, connections) : false;
            const visual = el && elEntry ? resolveElementVisual(elEntry, connections, diagonalFilled) : undefined;
            const confirmedSuspect = puzzle.suspects.find((s) => confirmed[s.id] === c);
            const victimConfirmedHere = !confirmedSuspect && confirmed[VICTIM_ID] === c;
            const candidateIds = playState.candidates[c] ?? [];
            return (
              <>
                {elEntry && visual && (
                  <span
                    className={`mk-element-icon ${isMultiCellType(elEntry) ? 'mk-element-icon-full' : ''}`}
                    title={elEntry.label}
                    style={visual.rotationDeg ? { transform: `rotate(${visual.rotationDeg}deg)` } : undefined}
                  >
                    {visual.image ? <img src={visual.image} alt="" /> : visual.icon}
                  </span>
                )}
                {confirmedSuspect && (
                  <SuspectMarker color={confirmedSuspect.color} letter={confirmedSuspect.name[0]?.toUpperCase() ?? ''} />
                )}
                {victimConfirmedHere && <SuspectMarker color={puzzle.victim.color} letter="V" dashed title="Vittima" />}
                {!confirmedSuspect && !victimConfirmedHere && candidateIds.length > 0 && (
                  <div className="mk-candidate-grid">
                    {candidateIds.map((sid) => {
                      if (sid === VICTIM_ID) {
                        return (
                          <span key={sid} className="mk-candidate-letter" style={{ color: puzzle.victim.color }}>
                            V
                          </span>
                        );
                      }
                      const s = puzzle.suspects.find((x) => x.id === sid);
                      return s ? (
                        <span key={sid} className="mk-candidate-letter" style={{ color: s.color }}>
                          {s.name[0]?.toUpperCase()}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </>
            );
          }}
        />

        {result === 'correct' && (
          <p className="mk-status-ok">
            🎉 Soluzione corretta! Il killer è <strong>{killer?.name}</strong>, la vittima (V) si trova nella cella{' '}
            {confirmed[VICTIM_ID]}.
          </p>
        )}
        {result === 'incorrect' && <p className="mk-status-bad">Non corretto, riprova.</p>}
      </section>

      <section className="mk-card">
        <h2>Indizi</h2>
        {puzzle.suspects.map((s) => {
          const clues = puzzle.clues.filter((c) => c.suspectId === s.id);
          if (clues.length === 0) return null;
          return (
            <div key={s.id} style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: s.color }}>{s.name}</strong>
              <ul className="mk-clue-list">
                {clues.map((c) => (
                  <li key={c.id} className="mk-clue-item">
                    {describeClue(c, puzzle, areas)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {puzzle.globalRules.length > 0 && (
          <>
            <strong>Regole globali</strong>
            <ul className="mk-clue-list">
              {puzzle.globalRules.map((r) => (
                <li key={r.id} className="mk-clue-item">
                  {r.type === 'allAreasHaveSuspect' && 'Ogni area contiene almeno un sospettato'}
                  {r.type === 'evenCountInAreas' &&
                    `Numero pari di sospettati in: ${r.areaIds.map((id) => areaDisplayName(id, puzzle.areaNames, areas)).join(', ')}`}
                  {r.type === 'custom' && r.description}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
