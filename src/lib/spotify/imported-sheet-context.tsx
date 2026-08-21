import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ImportedSheetContextValue = {
  playlistId: string | null;
  openImported: (id: string) => void;
  closeImported: () => void;
};

const ImportedSheetContext = createContext<ImportedSheetContextValue | null>(null);

export function ImportedSheetProvider({ children }: { children: ReactNode }) {
  const [playlistId, setPlaylistId] = useState<string | null>(null);

  const openImported = useCallback((id: string) => setPlaylistId(id), []);
  const closeImported = useCallback(() => setPlaylistId(null), []);

  const value = useMemo(
    () => ({ playlistId, openImported, closeImported }),
    [closeImported, openImported, playlistId],
  );

  return <ImportedSheetContext.Provider value={value}>{children}</ImportedSheetContext.Provider>;
}

export function useImportedSheet(): ImportedSheetContextValue {
  const ctx = useContext(ImportedSheetContext);
  if (!ctx) throw new Error("useImportedSheet must be used within ImportedSheetProvider");
  return ctx;
}
