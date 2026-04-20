import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function SlidePanel({ open, onClose, title, children, width = 360, side = "right" }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: number;
  side?: "left" | "right";
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: side === "right" ? width : -width, opacity: 0.8 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: side === "right" ? width : -width, opacity: 0.8 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={`absolute top-0 ${side === "right" ? "right-0" : "left-0"} h-full bg-surface border-${side === "right" ? "l" : "r"} border-[var(--color-border-default)] shadow-2xl z-30 overflow-y-auto`}
          style={{ width }}
        >
          {title && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] sticky top-0 bg-surface z-10">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
              <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-lg leading-none">&times;</button>
            </div>
          )}
          <div className={title ? "p-4" : ""}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
