import type { ReactNode } from "react";

type ScrollableTableProps = {
  children: ReactNode;
};

export function ScrollableTable({ children }: ScrollableTableProps) {
  return <div className="scroll-x">{children}</div>;
}
