import suspectIcon from '../assets/icons/sospettato.svg';

interface SuspectMarkerProps {
  color: string;
  letter: string;
  /** Bordo tratteggiato per distinguere la vittima da un sospettato. */
  dashed?: boolean;
  title?: string;
}

/**
 * Marcatore di posizione confermata per un sospettato (o la vittima): una sagoma colorata
 * col colore assegnato (via CSS mask, così basta una sola immagine per tutti i colori) con
 * la lettera iniziale sovrapposta.
 */
export default function SuspectMarker({ color, letter, dashed, title }: SuspectMarkerProps) {
  return (
    <span className={`mk-confirmed ${dashed ? 'mk-confirmed-dashed' : ''}`} title={title}>
      <span
        className="mk-confirmed-icon"
        style={{
          backgroundColor: color,
          // L'SVG viene incorporato come data URI con apici singoli non percent-encoded (dal
          // plugin asset di Vite): un url() senza apici si romperebbe su quei caratteri, quindi
          // il valore va racchiuso tra doppi apici.
          WebkitMaskImage: `url("${suspectIcon}")`,
          maskImage: `url("${suspectIcon}")`,
        }}
      />
      <span className="mk-confirmed-letter">{letter}</span>
    </span>
  );
}
