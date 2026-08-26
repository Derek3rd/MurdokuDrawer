import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GridCanvas } from '../components/GridCanvas';
import ClueForm from '../components/ClueForm';
import CustomElementForm from '../components/CustomElementForm';
import SuspectMarker from '../components/SuspectMarker';
import { useEditorStore } from '../store/useEditorStore';
import { areaColor } from '../components/GridCanvas';
import { areaBottomLabelAnchor, areaCentroidCell, computeAreas, isWallBetween } from '../lib/grid';
import { areaLabel, areaDisplayName, areaCustomName } from '../lib/areaLabel';
import { describeClue } from '../lib/describeClue';
import { downloadPuzzleAsFile } from '../storage/puzzleStorage';
import { elementConnections, fixedFootprintGroups, isCornerDiagonalFilled, resolveElementVisual } from '../lib/elementShape';
import {
  cellId,
  ELEMENT_CATALOG,
  isFixedFootprintType,
  isMultiCellType,
  parseCellId,
  resolveElementType,
  type CellId,
  type Direction,
} from '../types/puzzle';

type Tool = 'walls' | 'elements' | 'suspects';
/** Sotto-azione dello strumento "Muri / Aree": solo una alla volta per evitare clic accidentali. */
type WallSubTool = 'walls' | 'cells' | 'windows';

/** Chiave riservata usata per selezionare/piazzare la vittima nello strumento "Sospettati". */
const VICTIM_ID = 'victim';

/** Etichetta leggibile per una categoria di oggetti (nome della sottocartella in assets/icons/). */
function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { puzzle, loadPuzzleById, rename, resize, toggleWallRight, toggleWallBottom, toggleWindow,
    toggleCellDisabled, addElement, addElementChain, addElementToGroup, removeElement, addCustomElementType,
    removeCustomElementType, setAreaName, setSuspectSolution, renameSuspect, setVictimSolution, setKiller, addClue,
    removeClue, clearCluesForSuspect, addGlobalRule, removeGlobalRule } =
    useEditorStore();

  useEffect(() => {
    if (id) loadPuzzleById(id);
  }, [id, loadPuzzleById]);

  const [tool, setTool] = useState<Tool>('walls');
  const [wallSubTool, setWallSubTool] = useState<WallSubTool>('walls');
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
  // indicazione sempre visibile, indipendente da chi è selezionato nello strumento. Le celle
  // già non occupabili per via di un oggetto (es. un tavolo) non vengono segnate: la X
  // automatica serve solo a segnalare celle altrimenti valide.
  const isExcludedCell = (c: CellId): boolean => {
    if (nonOccupiableLabel(c)) return false;
    const { row, col } = parseCellId(c);
    const placedCells = [...puzzle.suspects.map((s) => s.solutionCellId), puzzle.victim.solutionCellId];
    return placedCells.some((cid) => {
      if (!cid || cid === c) return false;
      const p = parseCellId(cid);
      return p.row === row || p.col === col;
    });
  };

  const selectedElementEntry = resolveElementType(selectedElementType, puzzle.customElementTypes);
  const selectedElementIsMultiCell = isMultiCellType(selectedElementEntry);
  const selectedElementIsFixedFootprint = isFixedFootprintType(selectedElementEntry);

  // Oggetti del catalogo raggruppati per categoria (sottocartella di provenienza in assets/icons/),
  // nell'ordine di prima comparsa, per mostrarli a sezioni nella tavolozza dello strumento "Oggetti".
  const elementsByCategory: [string, typeof ELEMENT_CATALOG][] = [];
  for (const entry of ELEMENT_CATALOG) {
    let group = elementsByCategory.find(([cat]) => cat === entry.category);
    if (!group) {
      group = [entry.category, []];
      elementsByCategory.push(group);
    }
    group[1].push(entry);
  }

  // Oggetti ad impronta fissa (es. letto): un'unica immagine copre l'intero gruppo di celle, al
  // posto dell'icona per-cella. `footprintCoveredCells` elenca le celle già coperte da un overlay,
  // così il rendering per-cella normale può saltarle (mentre sospettati/candidati restano normali).
  // (Niente useMemo: siamo dopo il return anticipato sopra, quindi gli hook non possono stare qui.)
  const footprintGroups = fixedFootprintGroups(puzzle.elements, (type) =>
    resolveElementType(type, puzzle.customElementTypes),
  );
  const footprintCoveredCells = new Set(footprintGroups.flatMap((g) => g.cellIds));

  // Cella adiacente (N/S/E/O) con un elemento dello stesso tipo, se presente: usata per collegare
  // un click singolo ad un oggetto multi-cella già piazzato (permette di formare incroci a T/croce).
  const adjacentSameTypeElement = (c: CellId, type: string) => {
    const { row, col } = parseCellId(c);
    const neighborIds = [cellId(row - 1, col), cellId(row + 1, col), cellId(row, col - 1), cellId(row, col + 1)];
    for (const n of neighborIds) {
      if (isWallBetween(c, n, puzzle.wallsRight, puzzle.wallsBottom)) continue;
      const el = puzzle.elements.find((e) => e.cellId === n && e.type === type);
      if (el) return el;
    }
    return undefined;
  };

  // Trascinamento su più celle (solo per oggetti multi-cella a connettori, es. tappeto/tavolo: gli
  // oggetti ad impronta fissa come il letto non usano il trascinamento, vedi
  // handleFixedFootprintClick): una sola cella si comporta come il click semplice
  // (aggiungi/sostituisci/rimuovi, collegandosi ad un oggetto adiacente dello stesso tipo se già
  // presente), più celle formano un unico oggetto collegato, rimpiazzando eventuali oggetti già
  // presenti sul percorso.
  const onElementDragComplete = (cells: CellId[]) => {
    if (cells.length === 0 || puzzle.disabledCells.includes(cells[0])) return;
    if (cells.length === 1) {
      const c = cells[0];
      const existing = elementAt(c);
      if (existing?.type === selectedElementType) {
        removeElement(existing.id);
        return;
      }
      if (existing) removeElement(existing.id);
      const anchor = selectedElementIsMultiCell ? adjacentSameTypeElement(c, selectedElementType) : undefined;
      if (anchor) {
        addElementToGroup(selectedElementType, c, anchor.cellId);
      } else {
        addElement({ type: selectedElementType, cellId: c });
      }
      return;
    }
    for (const c of cells) {
      const existing = elementAt(c);
      if (existing) removeElement(existing.id);
    }
    addElementChain(selectedElementType, cells);
  };

  // Oggetti ad impronta fissa (es. letto/auto): niente trascinamento ad area. Si clicca la cella
  // in alto a sinistra da cui partire; ad ogni click successivo su QUELLA STESSA cella (l'ancora
  // del gruppo già piazzato) si passa alla taglia dichiarata successiva (es. auto_2x1 -> auto_1x2
  // -> auto_2x3 -> ... e poi di nuovo da capo), saltando le taglie che non entrano in quella
  // posizione (bordo della griglia, muri, celle disattivate o già occupate). Cliccare una cella
  // diversa (anche se fa parte dello stesso oggetto ma non è l'ancora) ricomincia lì da capo con
  // la prima taglia.
  const footprintSizeOrder = (images: Partial<Record<string, string>>) =>
    Object.keys(images)
      .map((key) => {
        const [width, height] = key.split('x').map(Number);
        return { key, width, height };
      })
      .sort((a, b) => a.width - b.width || a.height - b.height);

  const handleFixedFootprintClick = (c: CellId) => {
    const images = selectedElementEntry?.fixedFootprintImages;
    if (!images) return;
    const sizes = footprintSizeOrder(images);
    if (sizes.length === 0) return;

    const existing = elementAt(c);
    const sameTypeGroup =
      existing?.type === selectedElementType
        ? existing.groupId
          ? puzzle.elements.filter((e) => e.groupId === existing.groupId && e.type === selectedElementType)
          : [existing]
        : [];

    let anchor = c;
    let startIndex = 0;
    let groupToRemove = sameTypeGroup;

    if (sameTypeGroup.length > 0) {
      const positions = sameTypeGroup.map((e) => parseCellId(e.cellId));
      const rowMin = Math.min(...positions.map((p) => p.row));
      const colMin = Math.min(...positions.map((p) => p.col));
      if (cellId(rowMin, colMin) === c) {
        const rowMax = Math.max(...positions.map((p) => p.row));
        const colMax = Math.max(...positions.map((p) => p.col));
        const currentKey = `${colMax - colMin + 1}x${rowMax - rowMin + 1}`;
        const currentIndex = sizes.findIndex((s) => s.key === currentKey);
        startIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % sizes.length;
      }
    } else if (existing) {
      groupToRemove = [existing];
    }

    const { row: anchorRow, col: anchorCol } = parseCellId(anchor);
    const removedIds = new Set(groupToRemove.map((e) => e.cellId));

    const fits = (width: number, height: number) => {
      if (anchorRow + height > puzzle.height || anchorCol + width > puzzle.width) return false;
      for (let r = anchorRow; r < anchorRow + height; r++) {
        for (let cc = anchorCol; cc < anchorCol + width; cc++) {
          const id = cellId(r, cc);
          if (puzzle.disabledCells.includes(id)) return false;
          if (elementAt(id) && !removedIds.has(id)) return false;
          if (cc + 1 < anchorCol + width && isWallBetween(id, cellId(r, cc + 1), puzzle.wallsRight, puzzle.wallsBottom)) {
            return false;
          }
          if (r + 1 < anchorRow + height && isWallBetween(id, cellId(r + 1, cc), puzzle.wallsRight, puzzle.wallsBottom)) {
            return false;
          }
        }
      }
      return true;
    };

    let chosen: { key: string; width: number; height: number } | null = null;
    for (let i = 0; i < sizes.length; i++) {
      const candidate = sizes[(startIndex + i) % sizes.length];
      if (fits(candidate.width, candidate.height)) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen) return;

    for (const e of groupToRemove) removeElement(e.id);
    const cells: CellId[] = [];
    for (let r = anchorRow; r < anchorRow + chosen.height; r++) {
      for (let cc = anchorCol; cc < anchorCol + chosen.width; cc++) {
        cells.push(cellId(r, cc));
      }
    }
    addElementChain(selectedElementType, cells);
  };

  const onCellClick = (c: CellId) => {
    if (tool === 'walls') {
      if (wallSubTool === 'cells') toggleCellDisabled(c);
    } else if (puzzle.disabledCells.includes(c)) {
      return; // cella disattivata: non fa parte della mappa
    } else if (tool === 'elements') {
      if (selectedElementIsFixedFootprint) {
        handleFixedFootprintClick(c);
        return;
      }
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
    if (tool !== 'walls' || wallSubTool !== 'walls') return;
    if (side === 'right') toggleWallRight(cell);
    else toggleWallBottom(cell);
  };

  const onWindowClick = ({ cellId, side }: { cellId: CellId; side: Direction }) => {
    if (tool !== 'walls' || wallSubTool !== 'windows') return;
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

        {tool === 'walls' && (
          <div className="mk-row" style={{ marginBottom: '0.5rem' }}>
            <button
              className={`mk-btn ${wallSubTool === 'walls' ? '' : 'secondary'}`}
              onClick={() => setWallSubTool('walls')}
            >
              🧱 Disegna muri
            </button>
            <button
              className={`mk-btn ${wallSubTool === 'cells' ? '' : 'secondary'}`}
              onClick={() => setWallSubTool('cells')}
            >
              ⬛ Attiva/disattiva celle
            </button>
            <button
              className={`mk-btn ${wallSubTool === 'windows' ? '' : 'secondary'}`}
              onClick={() => setWallSubTool('windows')}
            >
              🪟 Finestre
            </button>
          </div>
        )}

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
            {elementsByCategory.map(([category, entries]) => (
              <div key={category} style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>
                  {categoryLabel(category)}
                </div>
                <div className="mk-row" style={{ alignItems: 'center' }}>
                  {entries.map((entry) => (
                    <span
                      key={entry.type}
                      className={`mk-suspect-pill ${selectedElementType === entry.type ? 'active' : ''}`}
                      style={{ background: '#495057' }}
                      onClick={() => setSelectedElementType(entry.type)}
                      title={isMultiCellType(entry) ? `${entry.label} (multi-cella: trascina in linea)` : entry.label}
                    >
                      {entry.icon} {entry.label}
                      {isMultiCellType(entry) && ' 🔗'}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {puzzle.customElementTypes.length > 0 && (
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>
                Personalizzati
              </div>
            )}
            <div className="mk-row" style={{ marginBottom: '0.5rem', alignItems: 'center' }}>
              {puzzle.customElementTypes.map((entry) => (
                <span
                  key={entry.id}
                  className={`mk-suspect-pill ${selectedElementType === entry.id ? 'active' : ''}`}
                  style={{ background: '#495057' }}
                  onClick={() => setSelectedElementType(entry.id)}
                  title={[
                    entry.occupiable ? entry.name : `${entry.name} (non occupabile)`,
                    isMultiCellType(entry) ? 'multi-cella: trascina in linea' : '',
                  ]
                    .filter(Boolean)
                    .join(' — ')}
                >
                  <img src={entry.image} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />{' '}
                  {entry.name}
                  {!entry.occupiable && ' 🚫'}
                  {isMultiCellType(entry) && ' 🔗'}
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
          editableWalls={tool === 'walls' && wallSubTool === 'walls'}
          onEdgeClick={onEdgeClick}
          onCellClick={onCellClick}
          elementDragMode={tool === 'elements' && selectedElementIsMultiCell && !selectedElementIsFixedFootprint}
          onElementDragComplete={onElementDragComplete}
          windows={puzzle.windows}
          onWindowClick={onWindowClick}
          editableWindows={tool === 'walls' && wallSubTool === 'windows'}
          spanningImages={footprintGroups}
          areaLabels={areas.areaIds
            .map((areaId) => {
              const text = areaCustomName(areaId, puzzle.areaNames, areas);
              return text ? { ...areaBottomLabelAnchor(areas.areaCells[areaId]), text } : null;
            })
            .filter((l): l is NonNullable<typeof l> => l !== null)}
          cellClassName={(c) => {
            if (tool === 'suspects' && isExcludedCell(c)) return 'locked';
            if (puzzle.victim.solutionCellId === c) return 'victim';
            return undefined;
          }}
          renderCell={(c) => {
            const el = footprintCoveredCells.has(c) ? undefined : elementAt(c);
            const elEntry = el ? resolveElementType(el.type, puzzle.customElementTypes) : undefined;
            const connections = el ? elementConnections(el, puzzle.elements) : [];
            const diagonalFilled = el ? isCornerDiagonalFilled(el, puzzle.elements, connections) : false;
            const visual = el && elEntry ? resolveElementVisual(elEntry, connections, diagonalFilled) : undefined;
            const sus = suspectAt(c);
            const isVictimHere = puzzle.victim.solutionCellId === c;
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
                {sus && <SuspectMarker color={sus.color} letter={sus.name[0]?.toUpperCase() ?? ''} />}
                {isVictimHere && !sus && <SuspectMarker color={puzzle.victim.color} letter="V" dashed title="Vittima" />}
              </>
            );
          }}
        />
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#666' }}>
          {tool === 'walls' && wallSubTool === 'walls' &&
            "Trascina da un incrocio della griglia a un altro (solo linee dritte, orizzontali o verticali) per disegnare o cancellare i muri tra i due punti in un colpo solo. In alternativa, clicca un incrocio e poi un altro allineato per selezionarli allo stesso modo. Dai un nome alle aree nell'elenco qui sotto."}
          {tool === 'walls' && wallSubTool === 'cells' &&
            'Clicca una cella per attivarla o disattivarla (per creare griglie non rettangolari).'}
          {tool === 'walls' && wallSubTool === 'windows' &&
            'Clicca il bordo esterno del perimetro per segnare o togliere una finestra.'}
          {tool === 'elements' && !selectedElementIsMultiCell &&
            'Scegli un oggetto sopra, poi clicca una cella per piazzarlo (clicca di nuovo lo stesso oggetto per rimuoverlo).'}
          {tool === 'elements' && selectedElementIsMultiCell && !selectedElementIsFixedFootprint &&
            'Oggetto multi-cella 🔗: trascina lungo le celle (anche ad angolo) per piazzarlo su più celle collegate. Per un incrocio a T o a croce, senza sollevare il dito torna indietro su una cella già toccata del percorso e riparti in un\'altra direzione. Clicca una cella isolata per piazzarlo da solo, oppure una cella adiacente a un pezzo già presente dello stesso oggetto per agganciarla.'}
          {tool === 'elements' && selectedElementIsFixedFootprint &&
            'Oggetto ad impronta fissa 🔗: clicca la cella in alto a sinistra da cui partire per piazzarlo con la prima taglia disponibile. Clicca di nuovo quella stessa cella per passare alla taglia successiva (cambia orientamento/dimensione), ciclando tra tutte quelle disponibili. Clicca una cella diversa per ricominciare da lì.'}
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
