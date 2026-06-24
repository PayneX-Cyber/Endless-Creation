import './ActionCard.css';

interface ActionCardProps {
  title: string;
  body: string;
  meta: string;
}

export function ActionCard({ title, body, meta }: ActionCardProps) {
  return (
    <button className="action-card" type="button">
      <span className="action-card__meta">{meta}</span>
      <strong>{title}</strong>
      <span>{body}</span>
    </button>
  );
}
