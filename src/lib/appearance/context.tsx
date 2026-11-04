import type { ReactNode } from "react";
// The desktop appearance selector is supplied by context.web.tsx.
// Native keeps the existing palette and typography.
export function AppearanceProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
