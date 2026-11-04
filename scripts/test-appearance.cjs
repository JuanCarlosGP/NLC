const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test, beforeEach } = require('node:test');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.tsx'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: file }).outputText, file);
const React = require('react');
const renderer = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const platform = { OS: 'android' };
const memory = new Map();
let storageFailure = false;
const backgrounds = [];
const storage = { async getItem(key) { return memory.get(key) ?? null; }, async setItem(key, value) { if (storageFailure)
        throw new Error('storage'); memory.set(key, value); } };
const NativeText = React.forwardRef((props, ref) => React.createElement('native-text', { ...props, ref }));
const NativeInput = React.forwardRef((props, ref) => React.createElement('native-input', { ...props, ref }));
const rn = { Platform: platform, Text: NativeText, TextInput: NativeInput, View: ({ children, ...props }) => React.createElement('native-view', props, children), StyleSheet: { create(styles) { for (const style of Object.values(styles))
            Object.freeze(style); return Object.freeze(styles); } } };
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) { if (request === 'react-native')
    return rn; if (request === '@react-native-async-storage/async-storage')
    return { __esModule: true, default: storage }; if (request === 'expo-system-ui')
    return { setBackgroundColorAsync: async (color) => { backgrounds.push(color); } }; if (request.startsWith('@/'))
    request = path.join(__dirname, '../src', request.slice(2)); return originalLoad.call(this, request, parent, isMain); };
const store = require('../src/lib/appearance/native-store.ts');
const { createAppearancePreference } = require('../src/lib/appearance/preference.ts');
const density = require('../src/lib/appearance/density.ts');
const theme = require('../src/lib/theme.ts');
const { APPEARANCE_KEY } = require('../src/lib/appearance/themes.ts');
beforeEach(() => { platform.OS = 'android'; store.setNativeAppearance('geist-pixel'); storageFailure = false; memory.clear(); backgrounds.length = 0; });
test('native first launch defaults to Pixel, restores Classic, and persists offline', async () => {
    const preference = createAppearancePreference(storage, store.setNativeAppearance);
    await preference.load();
    assert.deepEqual(preference.getSnapshot(), { theme: 'geist-pixel', ready: true, error: false });
    assert.equal(theme.colors.void, '#000000');
    await preference.select('classic');
    assert.equal(memory.get(APPEARANCE_KEY), 'classic');
    const reopened = createAppearancePreference(storage, store.setNativeAppearance);
    await reopened.load();
    assert.equal(reopened.getSnapshot().theme, 'classic');
    assert.equal(theme.colors.void, '#0E0D0C');
    assert.equal(store.parseNativeAppearance('unknown'), 'geist-pixel');
});
test('failed writes recover the last confirmed theme without touching unrelated preferences', async () => {
    memory.set(APPEARANCE_KEY, 'classic');
    memory.set('nlc.locale', 'es');
    const preference = createAppearancePreference(storage, store.setNativeAppearance);
    await preference.load();
    storageFailure = true;
    await preference.select('geist-pixel');
    assert.equal(preference.getSnapshot().theme, 'classic');
    assert.equal(preference.getSnapshot().error, true);
    assert.equal(store.getNativeAppearance(), 'classic');
    assert.equal(memory.get('nlc.locale'), 'es');
    storageFailure = false;
    await preference.select('geist-pixel');
    assert.equal(preference.getSnapshot().error, false);
    assert.equal(memory.get(APPEARANCE_KEY), 'geist-pixel');
});
test('queued writes resolve in selection order and failures do not revert a newer choice', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let writes = 0;
    const recorded = [];
    const slow = { getItem: async () => 'classic', setItem: async (key, value) => { writes++; if (writes === 1) {
            await gate;
            throw new Error('first failed');
        } recorded.push(value); } };
    const preference = createAppearancePreference(slow, store.setNativeAppearance);
    await preference.load();
    const first = preference.select('geist-pixel');
    const second = preference.select('classic');
    release();
    await Promise.all([first, second]);
    assert.equal(preference.getSnapshot().theme, 'classic');
    assert.equal(preference.getSnapshot().error, false);
    assert.deepEqual(recorded, ['classic']);
});
test('a slow preference read cannot overwrite a selection and subscriptions clean up', async () => {
    let finish;
    const storage = { getItem: () => new Promise(resolve => { finish = resolve; }), setItem: async () => { } };
    const preference = createAppearancePreference(storage, store.setNativeAppearance);
    let updates = 0;
    const unsubscribe = preference.subscribe(() => updates++);
    const loading = preference.load();
    await preference.select('geist-pixel');
    finish('classic');
    await loading;
    assert.equal(preference.getSnapshot().theme, 'geist-pixel');
    unsubscribe();
    const before = updates;
    await preference.select('classic');
    assert.equal(updates, before);
});
test('read errors leave the app usable and expose a recoverable preference error', async () => {
    const preference = createAppearancePreference({ getItem: async () => { throw new Error('unavailable'); }, setItem: async () => { } }, store.setNativeAppearance);
    await preference.load();
    assert.equal(preference.getSnapshot().ready, true);
    assert.equal(preference.getSnapshot().error, true);
    await preference.select('classic');
    assert.equal(preference.getSnapshot().error, false);
});
test('frozen native sheets update colors, fonts, corners and density once; geometry stays numeric', () => {
    const styles = density.createStyles(() => ({ card: { ...theme.type.body, padding: density.space(16), gap: 10, borderRadius: 14, elevation: 8, shadowOpacity: 0.5, width: 160, height: 44, transform: [{ translateY: 18 }] } }));
    const pixel = styles.card;
    assert.equal(pixel.color, '#BEBEBE');
    assert.equal(pixel.fontFamily, 'GeistPixelSquare');
    assert.equal(pixel.fontSize, 14);
    assert.equal(pixel.lineHeight, 20);
    assert.equal(pixel.padding, 12);
    assert.equal(pixel.gap, 8);
    assert.equal(pixel.borderRadius, 0);
    assert.equal(pixel.elevation, 8);
    assert.equal(pixel.shadowColor, 'transparent');
    assert.equal(pixel.shadowOpacity, 0);
    assert.equal(pixel.height, 44);
    assert.equal(pixel.width, 160);
    assert.deepEqual(pixel.transform, [{ translateY: 18 }]);
    assert.ok(Object.isFrozen(pixel));
    store.setNativeAppearance('classic');
    const classic = styles.card;
    assert.notEqual(classic, pixel);
    assert.equal(classic.fontFamily, 'Figtree_400Regular');
    assert.equal(classic.fontSize, 15);
    assert.equal(classic.lineHeight, 22);
    assert.equal(classic.padding, 16);
    assert.equal(classic.borderRadius, 14);
    assert.equal(classic.elevation, 8);
    assert.equal(pixel.padding, 12);
    store.setNativeAppearance('geist-pixel');
    assert.equal(styles.card, pixel);
});
test('inline metrics and typography preserve safe insets, negative spacing and original Classic sizes', () => {
    assert.equal(density.insetSpace(24, 16), 36);
    assert.equal(density.space(-20), -16);
    assert.equal(density.textSize(32), 26);
    assert.equal(density.leading(38), 32);
    assert.equal(density.radius(999), 0);
    assert.equal(theme.type.pageTitle.fontSize, 26);
    assert.equal(theme.type.pageTitle.fontFamily, 'GeistPixelSquare');
    store.setNativeAppearance('classic');
    assert.equal(density.insetSpace(24, 16), 40);
    assert.equal(density.space(-20), -20);
    assert.equal(theme.type.pageTitle.fontSize, 32);
    assert.equal(theme.type.pageTitle.fontFamily, 'InstrumentSerif_400Regular');
    assert.equal(density.radius(999), 999);
});
test('web still emits CSS variables and keeps its original component contract', () => {
    platform.OS = 'web';
    const sheet = density.createStyles(() => ({ card: { padding: 16, fontSize: 15, color: theme.colors.ink, width: 160, borderRadius: 14 } }));
    assert.match(sheet.card.padding, /--nlc-space-16/);
    assert.match(sheet.card.fontSize, /--nlc-text-15/);
    assert.match(sheet.card.color, /--nlc-color-ink/);
    assert.equal(sheet.card.width, 160);
    assert.equal(sheet.card.borderRadius, 14);
    assert.match(density.insetSpace(24, 16), /^calc\(24px/);
});
const flatten = style => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};
test('memoized native content changes theme without remounting player state or losing a draft', async () => {
    const { AppearanceProvider } = require('../src/lib/appearance/context.tsx');
    const { useAppearance } = require('../src/lib/appearance/shared.ts');
    const { useThemeId } = require('../src/lib/appearance/use-theme-id.ts');
    const { TextInput } = require('../src/components/ui/themed-text.tsx');
    let mounts = 0;
    let unmounts = 0;
    const styles = density.createStyles(() => ({ input: { ...theme.type.body, borderColor: theme.colors.rule } }));
    function Player({ children }) { const [position] = React.useState(123.5); React.useEffect(() => { mounts++; return () => unmounts++; }, []); return React.createElement('player', { position }, children); }
    const Draft = React.memo(function Draft() { useThemeId(); const [value, setValue] = React.useState('76,8'); return React.createElement(TextInput, { value, onChangeText: setValue, style: styles.input }); });
    function Switch() { const ctx = useAppearance(); return React.createElement('theme-switch', { change: ctx.setTheme, theme: ctx.theme }); }
    let app;
    await renderer.act(async () => { app = renderer.create(React.createElement(AppearanceProvider, null, React.createElement(Player, null, React.createElement(Draft), React.createElement(Switch)))); });
    await renderer.act(async () => { app.root.findByType('native-input').props.onChangeText('77,1'); });
    assert.equal(flatten(app.root.findByType('native-input').props.style).fontFamily, 'GeistPixelSquare');
    assert.equal(flatten(app.root.findByType('native-input').props.style).minHeight, 44);
    await renderer.act(async () => { await app.root.findByType('theme-switch').props.change('classic'); });
    assert.equal(flatten(app.root.findByType('native-input').props.style).fontFamily, 'Figtree_400Regular');
    assert.equal(app.root.findByType('native-input').props.value, '77,1');
    assert.equal(app.root.findByType('player').props.position, 123.5);
    assert.equal(mounts, 1);
    assert.equal(unmounts, 0);
    await renderer.act(async () => { await app.root.findByType('theme-switch').props.change('geist-pixel'); });
    assert.equal(flatten(app.root.findByType('native-input').props.style).fontFamily, 'GeistPixelSquare');
    assert.equal(app.root.findByType('native-input').props.value, '77,1');
    assert.equal(memory.get(APPEARANCE_KEY), 'geist-pixel');
    assert.equal(unmounts, 0);
    assert.ok(backgrounds.includes('#000000'));
    assert.ok(backgrounds.includes('#0E0D0C'));
    await renderer.act(async () => app.unmount());
    assert.equal(unmounts, 1);
});
test('native input keeps forwarding its ref, accessibility and events through theme changes', async () => {
    const { TextInput } = require('../src/components/ui/themed-text.tsx');
    const ref = React.createRef();
    let input;
    let changed = '';
    await renderer.act(async () => { input = renderer.create(React.createElement(TextInput, { ref, accessibilityLabel: 'Peso', value: '77', onChangeText: value => changed = value }), { createNodeMock: () => ({ focus() { } }) }); });
    assert.ok(ref.current);
    const host = input.root.findByType('native-input');
    assert.equal(host.props.accessibilityLabel, 'Peso');
    host.props.onChangeText('78');
    assert.equal(changed, '78');
    await renderer.act(async () => input.unmount());
});
test('font asset is local and every static UI sheet is a live factory', () => {
    const root = path.resolve(__dirname, '..');
    const layout = fs.readFileSync(path.join(root, 'src/app/_layout.tsx'), 'utf8');
    assert.match(layout, /GeistPixelSquare: require\("\.\.\/\.\.\/assets\/fonts\/geist\/GeistPixel-Square\.otf"\)/);
    assert.doesNotMatch(layout, /Platform.OS === "web" \? \{ GeistPixelSquare/);
    assert.ok(fs.statSync(path.join(root, 'assets/fonts/geist/GeistPixel-Square.otf')).size > 100000);
    function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
    for (const file of files(path.join(root, 'src')).filter(file => /\.tsx?$/.test(file) && !file.endsWith('/appearance/density.ts'))) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /createStyles\(\{/, 'eager style sheet: ' + file);
    }
    for (const file of ['track-row', 'album-row', 'artist-row', 'library-tile'])
        assert.match(fs.readFileSync(path.join(root, 'src/components/library', file + '.tsx'), 'utf8'), /useThemeId\(\)/);
});
test('composed sheet factories do not compact shared spacing or typography twice', () => {
    const base = density.createStyles(() => ({ field: { ...theme.type.body, padding: 16 } }));
    const derived = density.createStyles(() => ({ input: { ...base.field, gap: 12 } }));
    assert.equal(derived.input.padding, 12);
    assert.equal(derived.input.fontSize, 14);
    assert.equal(derived.input.lineHeight, 20);
    store.setNativeAppearance('classic');
    assert.equal(derived.input.padding, 16);
    assert.equal(derived.input.fontSize, 15);
});
test('appearance never changes the deterministic tint stored with a project', () => {
    const pixel = theme.coverTint('my-project');
    store.setNativeAppearance('classic');
    assert.equal(theme.coverTint('my-project'), pixel);
});
