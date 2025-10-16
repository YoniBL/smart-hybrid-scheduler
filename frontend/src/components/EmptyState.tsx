import React from "react";

type Props = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({ title, description, actionLabel, onAction }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-illustration">📅</div>
      <h3>{title}</h3>
      {description && <p className="empty-desc">{description}</p>}
      {actionLabel && onAction && (
        <button className="empty-btn" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}
