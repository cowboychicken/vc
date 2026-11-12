import {
  type Card,
  cardLabel,
  isRed,
  rankOf,
  RANK_LABELS,
  suitOf,
  SUIT_NAMES,
  SUIT_SYMBOLS,
} from "../engine";

interface Props {
  card: Card;
  selected?: boolean;
  onToggle?: (card: Card) => void;
  small?: boolean;
}

export function CardFace({ card, selected = false, onToggle, small = false }: Props) {
  const label = `${RANK_LABELS[rankOf(card)]} of ${SUIT_NAMES[suitOf(card)]}`;
  const cls = `card${isRed(card) ? " red" : ""}${selected ? " selected" : ""}${small ? " small" : ""}`;
  const body = (
    <>
      <span className="corner">
        <span>{RANK_LABELS[rankOf(card)]}</span>
        <span>{SUIT_SYMBOLS[suitOf(card)]}</span>
      </span>
      <span className="pip" aria-hidden="true">
        {SUIT_SYMBOLS[suitOf(card)]}
      </span>
    </>
  );
  if (!onToggle) {
    return (
      <span className={cls} role="img" aria-label={label} title={cardLabel(card)}>
        {body}
      </span>
    );
  }
  return (
    <button type="button" className={cls} aria-pressed={selected} aria-label={label} onClick={() => onToggle(card)}>
      {body}
    </button>
  );
}

export function CardBack() {
  return <span className="card back" aria-hidden="true" />;
}
