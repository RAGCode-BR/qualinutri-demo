import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  children?: ReactNode;
};

export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="empty-items">
      <p><strong>{title}</strong></p>
      {children && <p>{children}</p>}
    </div>
  );
}
