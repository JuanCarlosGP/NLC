import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { triggerLongPressUiHaptic } from "@/lib/ui-haptics";
import type { WealthTx } from "@/lib/wealth/types";

type TxActionsContextValue = {
  open: boolean;
  tx: WealthTx | null;
  setOpen: (open: boolean) => void;
  openTxActions: (tx: WealthTx) => void;
};

const TxActionsContext = createContext<TxActionsContextValue | null>(null);

export function TxActionsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tx, setTx] = useState<WealthTx | null>(null);

  const openTxActions = useCallback((next: WealthTx) => {
    triggerLongPressUiHaptic();
    setTx(next);
    setOpen(true);
  }, []);

  return (
    <TxActionsContext.Provider value={{ open, tx, setOpen, openTxActions }}>
      {children}
    </TxActionsContext.Provider>
  );
}

export function useTxActions(): TxActionsContextValue {
  const ctx = useContext(TxActionsContext);
  if (!ctx) throw new Error("useTxActions must be used within TxActionsProvider");
  return ctx;
}
