import type { AppearanceId } from "./themes";
export const DEFAULT_NATIVE_APPEARANCE: AppearanceId = "geist-pixel";
let selected: AppearanceId = DEFAULT_NATIVE_APPEARANCE;
const listeners = new Set<() => void>();
export function getNativeAppearance(): AppearanceId { return selected; }
export function setNativeAppearance(next: AppearanceId) {
    if (selected === next)
        return;
    selected = next;
    for (const listener of [...listeners])
        listener();
}
export function subscribeNativeAppearance(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function parseNativeAppearance(value: unknown): AppearanceId { return value === "classic" || value === "geist-pixel" ? value : DEFAULT_NATIVE_APPEARANCE; }
