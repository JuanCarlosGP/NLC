export const desktopCss = `
[data-nlc-ui="desktop-workspace"] {
  --nlc-page-max: 1440px;
  --nlc-workspace-gutter: clamp(24px, 3vw, 56px);
  --nlc-media-cell: 25%;
  --nlc-shortcut-basis: calc(33.333% - 8px);
  --nlc-shortcut-max: none;
}
[data-nlc-ui="desktop-workspace"] [data-nlc-ui="zone-hero"],
[data-nlc-ui="desktop-workspace"] [data-nlc-ui="zone-switch"] {
  display: none;
}
.nlc-settings-header,
[data-nlc-ui="settings-workspace"] {
  width: 100%;
  max-width: 920px;
  align-self: center;
}
.nlc-settings-header {
  color: var(--nlc-color-ink);
  font: 14px var(--nlc-font-sans);
}
.nlc-settings-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 16px 0 20px;
}
.nlc-settings-header h1 {
  margin: 0;
  font: 600 30px/1.2 var(--nlc-font-sans);
}
.nlc-settings-nav {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 18px;
  border-bottom: 1px solid var(--nlc-color-rule);
}
.nlc-settings-nav button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  margin-bottom: -1px;
  padding: 0 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--nlc-color-inkSoft);
  font: inherit;
  cursor: pointer;
}
.nlc-settings-nav button[aria-pressed="true"] {
  border-bottom-color: var(--nlc-color-accent);
  color: var(--nlc-color-ink);
}
.nlc-settings-nav button:hover {
  background: var(--nlc-color-sheetHover);
  color: var(--nlc-color-ink);
}
.nlc-settings-nav button:focus-visible,
[data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-row"]:focus-visible {
  outline: 1px solid var(--nlc-color-accent);
  outline-offset: -2px;
}
[data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-group"] {
  display: grid;
  grid-template-columns: minmax(112px, 1fr) minmax(0, 4fr);
  align-items: start;
  column-gap: 20px;
  row-gap: 8px;
  border-bottom: 1px solid var(--nlc-color-rule);
  padding-block: 10px 16px;
}
[data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-group-title"] {
  grid-column: 1;
  padding: 13px 0 0;
  color: var(--nlc-color-ink);
  font-size: 14px;
  letter-spacing: normal;
  text-transform: none;
}
[data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-group-body"] {
  grid-column: 2;
  min-width: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
[data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-group-hint"] {
  grid-column: 2;
  padding: 0 16px;
}
[data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-row"] {
  min-height: 44px;
  padding-block: 11px;
  border-radius: 6px;
}
[data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-row"][role="button"]:not([aria-disabled="true"]):hover {
  background: var(--nlc-color-sheetHover);
}
[data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-row-meta"] {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  column-gap: 12px;
}
[data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-row-meta"] > :last-child {
  text-align: right;
  overflow-wrap: anywhere;
}
[data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-divider"] {
  margin-inline: 16px;
}
[data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-source-picker"] {
  padding: 6px 16px;
}
[data-nlc-ui="settings-workspace"] .nlc-appearance-select {
  padding-inline: 10px !important;
  border: 1px solid var(--nlc-color-rule) !important;
  color: var(--nlc-color-inkSoft) !important;
}
html[data-nlc-theme="geist-pixel"] .nlc-settings-header h1 { font-weight: 400; }
@media (max-width: 700px) {
  [data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-group"] {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding-block: 10px;
  }
  [data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-group-title"] { padding-top: 0; }
}
@media (max-width: 480px) {
  .nlc-settings-nav { gap: 4px; }
  .nlc-settings-nav button { padding-inline: 6px; }
  .nlc-settings-nav button > svg { display: none; }
  [data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-row-meta"] { display: flex; }
  [data-nlc-ui="settings-workspace"] [data-nlc-ui="settings-row-meta"] > :last-child { text-align: left; }
}

[data-nlc-ui="desktop-workspace"] [data-nlc-ui="health-actions"],
[data-nlc-ui="desktop-workspace"] [data-nlc-ui="record-cards"] {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 12px;
}
@media (min-width: 1300px) {
  [data-nlc-ui="desktop-workspace"] {
    --nlc-media-cell: 20%;
    --nlc-shortcut-basis: calc(25% - 9px);
  }
}
@media (min-width: 1600px) {
  [data-nlc-ui="desktop-workspace"] { --nlc-media-cell: 16.6667%; }
}

.nlc-sidebar,
.nlc-desktop-toolbar,
.nlc-desktop-player {
  box-sizing: border-box;
  font: 14px var(--nlc-font-sans);
  color: var(--nlc-color-ink);
}
.nlc-sidebar {
  width: 224px;
  flex: 0 0 224px;
  min-height: 0;
  overflow: auto;
  padding: 20px 14px;
  border-right: 1px solid var(--nlc-color-rule);
  background: var(--nlc-color-sheet);
}
.nlc-sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  margin: 0 4px 22px;
  color: inherit;
  font-size: 17px;
  font-weight: 700;
  text-decoration: none;
}
.nlc-sidebar-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--nlc-color-accent);
  color: var(--nlc-color-accentText);
}
.nlc-sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nlc-sidebar-zones {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--nlc-color-rule);
}
.nlc-sidebar-label {
  padding: 0 10px 6px;
  color: var(--nlc-color-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
.nlc-sidebar-item,
.nlc-desktop-icon,
.nlc-player-track {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--nlc-color-inkSoft);
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.nlc-sidebar-item {
  gap: 10px;
  min-height: 36px;
  padding: 6px 10px;
}
.nlc-sidebar-item > svg { flex: none; }
.nlc-sidebar-item[aria-current],
.nlc-sidebar-item[aria-pressed="true"],
.nlc-sidebar-item[aria-expanded="true"] {
  color: var(--nlc-color-ink);
  border-color: var(--nlc-color-rule);
  background: var(--nlc-color-sheetRaised);
}
.nlc-sidebar-item[aria-current] > svg,
.nlc-sidebar-item[aria-pressed="true"] > svg { color: var(--nlc-color-accent); }
.nlc-sidebar-item:hover,
.nlc-desktop-icon:hover,
.nlc-player-track:hover {
  color: var(--nlc-color-ink);
  background: var(--nlc-color-sheetHover);
}
.nlc-sidebar-badge {
  width: 7px;
  height: 7px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--nlc-color-warn);
}
.nlc-desktop-toolbar {
  display: flex;
  flex: 0 0 52px;
  align-items: center;
  gap: 10px;
  padding: 0 var(--nlc-workspace-gutter);
  border-bottom: 1px solid var(--nlc-color-rule);
  background: var(--nlc-color-void);
  color: var(--nlc-color-muted);
}
.nlc-desktop-toolbar strong { color: var(--nlc-color-ink); font-weight: 600; }
.nlc-desktop-icon {
  width: 34px;
  height: 34px;
  justify-content: center;
  padding: 0;
}
.nlc-desktop-player {
  display: grid;
  grid-template-columns: minmax(135px, 1fr) minmax(235px, 2fr) minmax(90px, 1fr);
  flex: none;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--nlc-color-rule);
  background: var(--nlc-color-sheet);
}
.nlc-player-track { gap: 10px; padding: 3px; }
.nlc-player-track > span { min-width: 0; }
.nlc-player-track strong,
.nlc-player-track small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nlc-player-track strong { color: var(--nlc-color-ink); font-weight: 600; }
.nlc-player-track small { margin-top: 3px; color: var(--nlc-color-muted); }
.nlc-player-transport { display: grid; gap: 2px; }
.nlc-player-buttons { display: flex; justify-content: center; gap: 6px; }
.nlc-player-play {
  background: var(--nlc-color-accent);
  color: var(--nlc-color-accentText);
}
.nlc-player-play:hover { background: var(--nlc-color-ink); color: var(--nlc-color-accentText); }
.nlc-player-timeline {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--nlc-color-muted);
}
.nlc-player-timeline input[type="range"] {
  width: 0;
  min-height: 16px;
  flex: 1;
  margin: 0;
  accent-color: var(--nlc-color-accent);
}
.nlc-player-queue { justify-self: end; }
.nlc-sidebar :focus-visible,
.nlc-desktop-toolbar :focus-visible,
.nlc-desktop-player :focus-visible {
  outline: 1px solid var(--nlc-color-accent);
  outline-offset: 2px;
}
html[data-nlc-theme="geist-pixel"] :is(.nlc-sidebar-item, .nlc-sidebar-mark, .nlc-sidebar-badge) { border-radius: 0; }
html[data-nlc-theme="geist-pixel"] :is(.nlc-sidebar, .nlc-desktop-toolbar, .nlc-desktop-player) :is(strong, .nlc-sidebar-brand, .nlc-sidebar-label) { font-weight: 400; }
html[data-nlc-theme="geist-pixel"] .nlc-player-timeline input[type="range"] { min-height: 16px; }
`;
