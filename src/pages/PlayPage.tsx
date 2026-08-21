import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GridCanvas } from '../components/GridCanvas';
import { usePlayStore } from '../store/usePlayStore';
import { loadPuzzle } from '../storage/puzzleStorage';
import { computeAreas } from '../lib/grid';
import { describeClue } from '../lib/describeClue';
import { areaDisplayName } from '../lib/areaLabel';
import { findVictimCell, type Positions } from '../lib/solve';
import { elementCatalogEntry, parseCellId, type CellId, type Puzzle } from '../types/puzzle';

type Mode = 'candidate' | 'confirm';

export default function PlayPage() {
  const { id } = useParams();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const { puzzleId, playState, load, toggleCandidate, confirmSuspect, unconfirmSuspect, reset } = usePlayStore();
  const [mode, setMode] = useState<Mode>('candidate');
  const [selectedSuspectId, setSelectedSuspectId] = useState<string | null>(null);
  const [result, setResult] = useState<'pending' | 'correct' | 'incorrect'>('pending');

  useEffect(() => {
    if (!id) return;
    const p = loadPuzzle(id);
    setPuzzle(p);
    load(id);
    if (p) setSelectedSuspectId(p.suspects[0]?.id ?? null);
  }, [id, load]);

  const areas = useMemo(() => (puzzle ? computeAreas(puzzle) : null), [puzzle]);

  if (!puzzle || !areas || puzzleId !== id) return <p>Caricamento...</p>;

  const confirmed = playState.confirmed;

  const isLockedForOther = (c: CellId, suspectId: string): boolean => {
    const { row, col } = parseCellId(c);
    return Object.entries(confirmed).some(([sid, cid]) => {
      if (sid === suspectId) return false;
      const p = parseCellId(cid);
      return p.row === row || p.col === col;
    });
  };

  const onCellClick = (c: CellId) => {
    if (!selectedSuspectId) return;
    if (mode === 'candidate') {
      if (confirmed[selectedSuspectId]) return; // già confermato, niente candidati
      toggleCandidate(c, selectedSuspectId);
    } else {
      if (confirmed[selectedSuspectId] === c) {
        unconfirmSuspect(selectedSuspectId);
        return;
      }
      if (isLockedForOther(c, selectedSuspectId)) {
        alert('Riga o colonna già occupata da un altro sospettato confermato.');
        return;
      }
      confirmSuspect(selectedSuspectId, c);
    }
    setResult('pending');
  };

  const checkSolution = () => {
    const allConfirmed = puzzle.suspects.every((s) => confirmed[s.id]);
    if (!allConfirmed) {
      alert('Conferma la posizione di tutti i sospettati prima di verificare.');
      return;
    }
    const ok = puzzle.suspects.every((s) => confirmed[s.id] === s.solutionCellId);
    setResult(ok ? 'correct' : 'incorrect');
  };

  const victim = result === 'correct' ? findVictimCell(puzzle, confirmed as Positions, areas) : { cellId: null };
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
              onClick={() => setSelectedSuspectId(s.id)}
            >
              {s.name}
              {confirmed[s.id] ? ' ✓' : ''}
            </span>
          ))}
        </div>

        <div className="mk-toolbar">
          <button className={`mk-btn ${mode === 'candidate' ? '' : 'secondary'}`} onClick={() => setMode('candidate')}>
            ✏️ Segna candidato
          </button>
          <button className={`mk-btn ${mode === 'confirm' ? '' : 'secondary'}`} onClick={() => setMode('confirm')}>
            ✅ Conferma posizione
          </button>
          <button className="mk-btn" onClick={checkSolution}>
            Verifica soluzione
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
          cellClassName={(c) => {
            if (selectedSuspectId && mode === 'confirm' && !confirmed[selectedSuspectId] && isLockedForOther(c, selectedSuspectId))
              return 'locked';
            if (victim.cellId === c) return 'victim';
            return undefined;
          }}
          onCellClick={onCellClick}
          renderCell={(c) => {
            const el = puzzle.elements.find((e) => e.cellId === c);
            const elEntry = el ? elementCatalogEntry(el.type) : undefined;
            const confirmedSuspect = puzzle.suspects.find((s) => confirmed[s.id] === c);
            const candidateIds = playState.candidates[c] ?? [];
            const name = puzzle.areaNames.find((a) => a.cellId === c)?.name;
            return (
              <>
                {name && <span className="mk-area-name">{name}</span>}
                {elEntry && <span className="mk-element-icon" title={elEntry.label}>{elEntry.icon}</span>}
                {confirmedSuspect && (
                  <span className="mk-confirmed" style={{ background: confirmedSuspect.color }}>
                    {confirmedSuspect.name.replace(/\D/g, '') || confirmedSuspect.name[0]}
                  </span>
                )}
                {!confirmedSuspect && candidateIds.length > 0 && (
                  <div className="mk-candidate-grid">
                    {candidateIds.map((sid) => {
                      const s = puzzle.suspects.find((x) => x.id === sid);
                      return s ? <span key={sid} className="mk-candidate-dot" style={{ background: s.color }} /> : null;
                    })}
                  </div>
                )}
                {victim.cellId === c && result === 'correct' && <span title="Vittima">💀</span>}
              </>
            );
          }}
        />

        {result === 'correct' && (
          <p className="mk-status-ok">
            🎉 Soluzione corretta! Il killer è <strong>{killer?.name}</strong>
            {victim.cellId ? `, la vittima si trova nella cella ${victim.cellId}.` : '.'}
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
