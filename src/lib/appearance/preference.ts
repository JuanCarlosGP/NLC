import { APPEARANCE_KEY, type AppearanceId } from "./themes";
import { DEFAULT_NATIVE_APPEARANCE, parseNativeAppearance } from "./native-store";
type Storage = {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
};
export type PreferenceState = {
    theme: AppearanceId;
    ready: boolean;
    error: boolean;
};
export function createAppearancePreference(storage: Storage, apply: (id: AppearanceId) => void) {
    let state: PreferenceState = { theme: DEFAULT_NATIVE_APPEARANCE, ready: false, error: false };
    let confirmed = DEFAULT_NATIVE_APPEARANCE;
    let revision = 0;
    let writes: Promise<void> = Promise.resolve();
    let loading: Promise<void> | null = null;
    const listeners = new Set<() => void>();
    function update(patch: Partial<PreferenceState>) { state = { ...state, ...patch }; for (const listener of [...listeners])
        listener(); }
    function select(theme: AppearanceId) {
        const current = ++revision;
        apply(theme);
        update({ theme, error: false });
        const task = writes.then(async () => { await storage.setItem(APPEARANCE_KEY, theme); confirmed = theme; });
        writes = task.catch(() => { });
        return task.catch(() => { if (revision === current) {
            apply(confirmed);
            update({ theme: confirmed, error: true });
        } });
    }
    function load() {
        return loading ??= (async () => {
            const beforeRead = revision;
            try {
                const stored = parseNativeAppearance(await storage.getItem(APPEARANCE_KEY));
                if (revision === beforeRead) {
                    confirmed = stored;
                    apply(stored);
                    update({ theme: stored });
                }
            }
            catch {
                if (revision === beforeRead)
                    update({ error: true });
            }
            finally {
                update({ ready: true });
            }
        })();
    }
    return { getSnapshot: () => state, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, load, select };
}
