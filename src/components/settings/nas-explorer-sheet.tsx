import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight, File, Folder } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { listWebDavDir } from "@/lib/nas/webdav-source";
import {
  isPathInside,
  parentDir,
  toWebDavPath,
  type WebDavEntry,
} from "@/lib/nas/webdav";
import type { NasSettings } from "@/lib/settings/storage";
import { nasBaseUrl } from "@/lib/settings/storage";
import { useI18n } from "@/lib/i18n/context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { webInteractiveStyle } from "@/lib/interactive";
import { colors, fonts, type } from "@/lib/theme";

const RIPPLE = { color: "rgba(240, 235, 227, 0.12)" };
const LIST_CAP = 120;

function configuredLibraries(
  settings: NasSettings,
  t: (path: string) => string,
): { label: string; path: string }[] {
  const items: { label: string; path: string }[] = [];
  const add = (label: string, raw: string) => {
    const path = toWebDavPath(raw.trim());
    if (!path) return;
    if (items.some((item) => item.path === path)) return;
    items.push({ label, path });
  };
  add(t("explorer.music"), settings.sharePath);
  add(t("explorer.podcasts"), settings.podcastSharePath);
  add(t("explorer.video"), settings.videoSharePath);
  add(t("explorer.wealth"), settings.wealthSharePath);
  add(t("explorer.focus"), settings.focusSharePath);
  return items;
}

function commonParent(paths: string[]): string {
  if (!paths.length) return "/";
  const parts = paths.map((path) => (toWebDavPath(path) || "/").split("/").filter(Boolean));
  const first = parts[0] ?? [];
  let i = 0;
  while (i < first.length && parts.every((part) => part[i] === first[i])) i += 1;
  return i === 0 ? "/" : `/${first.slice(0, i).join("/")}`;
}

function roleFor(path: string, libraries: { label: string; path: string }[]): string | null {
  const normalized = toWebDavPath(path) || "/";
  return libraries.find((item) => item.path === normalized)?.label ?? null;
}

function containingRole(path: string, libraries: { label: string; path: string }[]): string | null {
  const exact = roleFor(path, libraries);
  if (exact) return exact;
  const normalized = toWebDavPath(path) || "/";
  return libraries.find((item) => item.path !== "/" && isPathInside(item.path, normalized))?.label ?? null;
}

export function NasExplorerSheet({
  open,
  onOpenChange,
  settings,
  password,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: NasSettings;
  password: string;
}) {
  const { t } = useI18n();
  const libraries = useMemo(() => configuredLibraries(settings, t), [settings, t]);
  const root = useMemo(() => commonParent(libraries.map((item) => item.path)), [libraries]);
  const inspectSeq = useRef(0);
  const [path, setPath] = useState(root);
  const [entries, setEntries] = useState<WebDavEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canBrowse = Boolean(settings.host.trim() && password);
  const role = containingRole(path, libraries);

  async function load(target: string) {
    const seq = ++inspectSeq.current;
    const next = toWebDavPath(target) || "/";
    setBusy(true);
    setError(null);
    try {
      const listed = await listWebDavDir(settings, password, next);
      if (seq !== inspectSeq.current) return;
      setEntries(listed);
      setPath(next);
    } catch (caught) {
      if (seq !== inspectSeq.current) return;
      setEntries([]);
      setPath(next);
      setError(caught instanceof Error ? caught.message : t("explorer.readFail"));
    } finally {
      if (seq === inspectSeq.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) {
      inspectSeq.current += 1;
      return;
    }
    if (!canBrowse) {
      setPath(root);
      setEntries([]);
      setError(null);
      setBusy(false);
      return;
    }
    void load(root);
    // Fresh listing each time the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, root, canBrowse, settings.host, settings.port, settings.username, settings.useHttps, password]);

  function go(next: string) {
    if (busy) return;
    triggerUiHaptic();
    void load(next);
  }

  const shown = entries.slice(0, LIST_CAP);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel={t("explorer.close")}
      viewportRatio={0.82}
    >
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.titleMeta}>
          <Text style={type.label}>{t("explorer.nas")}</Text>
          <Text style={type.pageTitle}>{t("explorer.title")}</Text>
          <Text style={type.body}>
            {canBrowse
              ? t("explorer.subtitleBrowse", { url: nasBaseUrl(settings) })
              : t("explorer.subtitleConfig")}
          </Text>
        </View>

        {libraries.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("explorer.libraries")}</Text>
            <View style={styles.card}>
              {libraries.map((item) => (
                <Pressable
                  key={`${item.label}-${item.path}`}
                  accessibilityRole="button"
                  accessibilityLabel={t("explorer.openLib", { name: item.label })}
                  android_ripple={RIPPLE}
                  disabled={!canBrowse || busy}
                  onPress={() => go(item.path)}
                  style={({ pressed }) => [
                    styles.libRow,
                    webInteractiveStyle(),
                    { opacity: !canBrowse || busy ? 0.55 : pressed ? 0.82 : 1 },
                  ]}
                >
                  <Folder color={colors.accent} size={16} strokeWidth={1.85} />
                  <View style={styles.libCopy}>
                    <Text style={styles.libLabel}>{item.label}</Text>
                    <Text style={styles.libPath} numberOfLines={1}>
                      {item.path}
                    </Text>
                  </View>
                  <ChevronRight color={colors.muted} size={16} strokeWidth={1.85} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Text style={styles.empty}>{t("explorer.noLibraries")}</Text>
        )}

        {canBrowse ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("explorer.browse")}</Text>
            <View style={styles.exploreHead}>
              <Text style={styles.currentPath} numberOfLines={1}>
                {path}
              </Text>
              {role ? <Text style={styles.role}>{role}</Text> : null}
            </View>
            <View style={styles.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("explorer.upA11y")}
                accessibilityState={{ disabled: path === "/" || busy }}
                android_ripple={RIPPLE}
                disabled={path === "/" || busy}
                onPress={() => go(parentDir(path))}
                style={({ pressed }) => [
                  styles.row,
                  webInteractiveStyle(),
                  { opacity: path === "/" ? 0.4 : pressed ? 0.82 : 1 },
                ]}
              >
                <ChevronLeft color={colors.muted} size={16} strokeWidth={1.85} />
                <Text style={styles.muted}>{t("explorer.up")}</Text>
              </Pressable>
              {error && !busy ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              ) : null}
              {busy && !entries.length ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={colors.ink} />
                </View>
              ) : null}
              {!busy && !error && shown.length === 0 ? (
                <Text style={styles.empty}>{t("explorer.empty")}</Text>
              ) : (
                shown.map((entry) => {
                  const badge = entry.dir ? roleFor(entry.path, libraries) : null;
                  return entry.dir ? (
                    <Pressable
                      key={entry.path}
                      accessibilityRole="button"
                      accessibilityLabel={t("explorer.openEntryA11y", { name: entry.name })}
                      android_ripple={RIPPLE}
                      disabled={busy}
                      onPress={() => go(entry.path)}
                      style={({ pressed }) => [
                        styles.row,
                        webInteractiveStyle(),
                        { opacity: busy ? 0.55 : pressed ? 0.82 : 1 },
                      ]}
                    >
                      <Folder color={colors.accent} size={16} strokeWidth={1.85} />
                      <Text style={styles.name} numberOfLines={1}>
                        {entry.name}
                      </Text>
                      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
                      <ChevronRight color={colors.muted} size={16} strokeWidth={1.85} />
                    </Pressable>
                  ) : (
                    <View key={entry.path} style={styles.row}>
                      <File color={colors.muted} size={16} strokeWidth={1.85} />
                      <Text style={styles.muted} numberOfLines={1}>
                        {entry.name}
                      </Text>
                    </View>
                  );
                })
              )}
              {entries.length > LIST_CAP ? (
                <Text style={styles.empty}>{t("explorer.moreCount", { count: entries.length - LIST_CAP })}</Text>
              ) : null}
              {busy && entries.length ? (
                <View pointerEvents="none" style={styles.overlay}>
                  <ActivityIndicator color={colors.ink} />
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </SheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 22,
  },
  titleMeta: { gap: 8 },
  section: { gap: 10 },
  sectionLabel: {
    ...type.label,
    paddingHorizontal: 2,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 12,
    overflow: "hidden",
  },
  libRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  libCopy: { flex: 1, gap: 2 },
  libLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  libPath: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  exploreHead: {
    gap: 4,
    paddingHorizontal: 2,
  },
  currentPath: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  role: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.accent,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  name: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  muted: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.muted,
  },
  badge: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.accent,
  },
  loading: {
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(14, 13, 12, 0.28)",
  },
});
