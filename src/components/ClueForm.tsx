import { useState } from 'react';
import type { AreaMap } from '../lib/grid';
import { areaLabel } from '../lib/areaLabel';
import type { Clue, ClueTargetType, Direction, DistributiveOmit, Puzzle } from '../types/puzzle';

type ClueType = Clue['type'];

const CLUE_TYPE_LABELS: Record<ClueType, string> = {
  direction: 'Direzione (N/S/E/O)',
  inArea: 'È nell\'area',
  onElement: 'È sull\'oggetto',
  nearElement: 'È vicino all\'oggetto',
  alone: 'È da solo nella sua area',
  together: 'È insieme ad un altro sospettato',
};

interface ClueFormProps {
  puzzle: Puzzle;
  suspectId: string;
  areas: AreaMap;
  onSubmit: (clue: DistributiveOmit<Clue, 'id'>) => void;
  onCancel: () => void;
}

export default function ClueForm({ puzzle, suspectId, areas, onSubmit, onCancel }: ClueFormProps) {
  const [type, setType] = useState<ClueType>('direction');
  const [direction, setDirection] = useState<Direction>('N');
  const [targetType, setTargetType] = useState<ClueTargetType>('suspect');
  const [targetId, setTargetId] = useState('');
  const [adjacent, setAdjacent] = useState(false);
  const [areaId, setAreaId] = useState(areas.areaIds[0] ?? '');
  const [elementId, setElementId] = useState(puzzle.elements[0]?.id ?? '');
  const [otherSuspectId, setOtherSuspectId] = useState(
    puzzle.suspects.find((s) => s.id !== suspectId)?.id ?? '',
  );

  const otherSuspects = puzzle.suspects.filter((s) => s.id !== suspectId);
  const targetOptions =
    targetType === 'suspect' ? otherSuspects.map((s) => ({ id: s.id, label: s.name }))
    : targetType === 'element' ? puzzle.elements.map((e) => ({ id: e.id, label: e.label }))
    : [];

  const submit = () => {
    if (type === 'direction') {
      if (targetType === 'cell') {
        if (!targetId) return;
        onSubmit({ suspectId, type, direction, targetType, targetId, adjacent });
      } else {
        if (!targetId) return;
        onSubmit({ suspectId, type, direction, targetType, targetId, adjacent });
      }
    } else if (type === 'inArea') {
      if (!areaId) return;
      onSubmit({ suspectId, type, areaId });
    } else if (type === 'onElement' || type === 'nearElement') {
      if (!elementId) return;
      onSubmit({ suspectId, type, elementId });
    } else if (type === 'alone') {
      onSubmit({ suspectId, type });
    } else if (type === 'together') {
      if (!otherSuspectId) return;
      onSubmit({ suspectId, type, otherSuspectId });
    }
  };

  return (
    <div className="mk-card">
      <label className="mk-field">
        Tipo di indizio
        <select value={type} onChange={(e) => setType(e.target.value as ClueType)}>
          {Object.entries(CLUE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {type === 'direction' && (
        <div className="mk-row">
          <label className="mk-field">
            Direzione
            <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
              <option value="N">Nord</option>
              <option value="S">Sud</option>
              <option value="E">Est</option>
              <option value="O">Ovest</option>
            </select>
          </label>
          <label className="mk-field">
            Rispetto a
            <select
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value as ClueTargetType);
                setTargetId('');
              }}
            >
              <option value="suspect">Un altro sospettato</option>
              <option value="element">Un oggetto</option>
              <option value="cell">Una cella specifica</option>
            </select>
          </label>
          {targetType !== 'cell' ? (
            <label className="mk-field">
              Elemento
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">-- seleziona --</option>
                {targetOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="mk-field">
              Cella (riga-colonna)
              <input placeholder="es. 2-3" value={targetId} onChange={(e) => setTargetId(e.target.value)} />
            </label>
          )}
          <label className="mk-field">
            <span>
              <input type="checkbox" checked={adjacent} onChange={(e) => setAdjacent(e.target.checked)} /> Adiacente
            </span>
          </label>
        </div>
      )}

      {type === 'inArea' && (
        <label className="mk-field">
          Area
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            {areas.areaIds.map((id) => (
              <option key={id} value={id}>
                {areaLabel(id)}
              </option>
            ))}
          </select>
        </label>
      )}

      {(type === 'onElement' || type === 'nearElement') && (
        <label className="mk-field">
          Oggetto
          <select value={elementId} onChange={(e) => setElementId(e.target.value)}>
            {puzzle.elements.length === 0 && <option value="">Nessun oggetto sulla mappa</option>}
            {puzzle.elements.map((el) => (
              <option key={el.id} value={el.id}>
                {el.icon} {el.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {type === 'together' && (
        <label className="mk-field">
          Altro sospettato
          <select value={otherSuspectId} onChange={(e) => setOtherSuspectId(e.target.value)}>
            {otherSuspects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mk-row" style={{ marginTop: '0.5rem' }}>
        <button className="mk-btn" onClick={submit}>
          Aggiungi indizio
        </button>
        <button className="mk-btn secondary" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </div>
  );
}
