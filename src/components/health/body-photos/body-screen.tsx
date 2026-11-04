import { space } from "@/lib/appearance/density";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, Pressable, Text, TextInput, View } from "react-native";
import { ArrowLeft, ArrowUpRight, Images } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/ui/screen";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { useBodyPhotos } from "@/lib/health/body-photos/body-context";
import { BODY_POSES, bodyPhotoCount, comparisonPair, type BodyPose, type BodyReview, type BodyPhoto, type PickedBodyPhoto } from "@/lib/health/body-photos/model";
import { pickBodyPhoto } from "@/lib/health/body-photos/picker";
import { useI18n } from "@/lib/i18n/context";
import { colors, type } from "@/lib/theme";
import { Button, styles } from "../training/ui";
import { PhotoFrame } from "./photo-frame";
import { ReviewComposer, bodyErrorKey } from "./review-composer";

export function BodyPhotosHomeCard() {
  const router = useRouter(); const { t } = useI18n(); const { entries, ready, loadFailed } = useBodyPhotos();
  return <Pressable accessibilityRole="button" onPress={() => router.push("/health/body-photos")} style={[styles.card, styles.spread]}>
    <Images size={24} color={colors.accent} strokeWidth={1.6} /><View style={{ flex: 1, gap: space(5) }}><Text style={type.sectionTitle}>{t("body.title")}</Text><Text style={type.meta}>{t(ready ? loadFailed ? "body.loadError" : "body.count" : "common.loading", { entries: entries.length, photos: entries.reduce((sum, entry) => sum + bodyPhotoCount(entry), 0) })}</Text></View><ArrowUpRight size={20} color={colors.inkSoft} /></Pressable>;
}
type SelectedPhoto = { entry: BodyReview; pose: BodyPose; photo: BodyPhoto };
type PendingPhoto = { id: string; pose: BodyPose; picked: PickedBodyPhoto };
function disposePicked(picked?: PickedBodyPhoto) { if (picked) void Promise.resolve(picked.dispose()).catch(() => {}); }
export function BodyPhotosScreen() {
  const router = useRouter(); const insets = useSafeAreaInsets(); const { t, locale } = useI18n(); const { entries, ready, loadFailed, refresh, setPhoto, remove } = useBodyPhotos();
  const [tab, setTab] = useState<"history" | "compare">("history"); const [activeId, setActiveId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false); const [editing, setEditing] = useState<BodyReview | null>(null);
  const [query, setQuery] = useState(""); const [limit, setLimit] = useState(20); const [pose, setPose] = useState<BodyPose>("front");
  const [dateA, setDateA] = useState<string | null>(null); const [dateB, setDateB] = useState<string | null>(null); const [choosing, setChoosing] = useState<"a" | "b" | null>(null);
  const [viewer, setViewer] = useState<SelectedPhoto | null>(null); const [pending, setPending] = useState<PendingPhoto | null>(null); const pendingRef = useRef<PendingPhoto | null>(null);
  const [picking, setPicking] = useState(false); const [busy, setBusy] = useState(false); const lock = useRef(false); const mounted = useRef(true);
  const [error, setError] = useState<string | null>(null); const [photoError, setPhotoError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; pose?: BodyPose } | null>(null);
  const comparable = useMemo(() => entries.filter((entry) => bodyPhotoCount(entry) > 0), [entries]);
  useEffect(() => {
    if (!dateA || !entries.some((entry) => entry.id === dateA) || !dateB || !entries.some((entry) => entry.id === dateB)) {
      const [a, b] = comparisonPair(comparable); setDateA(a); setDateB(b);
    }
    if (activeId && !entries.some((entry) => entry.id === activeId)) setActiveId(null);
  }, [entries, comparable, activeId, dateA, dateB]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; disposePicked(pendingRef.current?.picked); }; }, []);
  const active = entries.find((entry) => entry.id === activeId) ?? null;
  const a = entries.find((entry) => entry.id === dateA); const b = entries.find((entry) => entry.id === dateB);
  const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const filtered = entries.filter((entry) => `${entry.date} ${dateLabel(entry.date)} ${entry.note}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
  async function selectPhoto(entry: BodyReview, view: BodyPose) {
    if (lock.current) return; lock.current = true; setPicking(true); setError(null);
    try {
      const picked = await pickBodyPhoto();
      if (picked && !mounted.current) { await picked.dispose(); return; }
      if (picked) { const next = { id: entry.id, pose: view, picked }; pendingRef.current = next; setPending(next); setPhotoError(null); }
    } catch (err) { if (mounted.current) setError(bodyErrorKey(err)); }
    finally { lock.current = false; if (mounted.current) setPicking(false); }
  }
  function clearPending() { const current = pendingRef.current; pendingRef.current = null; setPending(null); setPhotoError(null); disposePicked(current?.picked); }
  async function savePhoto() {
    if (!pending || lock.current) return; lock.current = true; setBusy(true); setPhotoError(null);
    try { await setPhoto(pending.id, pending.pose, pending.picked); clearPending(); }
    catch (err) { setPhotoError(bodyErrorKey(err)); } finally { lock.current = false; setBusy(false); }
  }
  async function confirmDelete() {
    if (!deleting || lock.current) return; lock.current = true; setBusy(true); setError(null);
    try { if (deleting.pose) await setPhoto(deleting.id, deleting.pose, null); else await remove(deleting.id); setDeleting(null); }
    catch (err) { setError(bodyErrorKey(err)); setDeleting(null); } finally { lock.current = false; setBusy(false); }
  }
  function compare(entry?: BodyReview) { const pair = comparisonPair(comparable, entry?.id); setDateA(pair[0]); setDateB(pair[1]); setTab("compare"); }
  function showPhoto(entry: BodyReview, view: BodyPose) { const photo = entry.photos[view]; if (photo) setViewer({ entry, pose: view, photo }); }
  return <><Screen keyboardShouldPersistTaps="handled">
    <View style={styles.spread}><Pressable accessibilityRole="button" accessibilityLabel={t("body.backToHealth")} onPress={() => router.push("/")} style={{ paddingVertical: space(12), paddingRight: space(6) }}><ArrowLeft size={22} color={colors.ink} /></Pressable>
      <View style={{ flex: 1, gap: space(4) }}><Text style={type.pageTitle}>{t("body.title")}</Text></View></View>

    {!ready ? <Text style={type.meta}>{t("common.loading")}</Text> : loadFailed ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{t("body.loadError")}</Text><Button title={t("common.retry")} onPress={() => void refresh()} /></View> : <>
      <View style={styles.row}><Button title={t("body.history")} primary={tab === "history"} onPress={() => { setTab("history"); setActiveId(null); setError(null); }} /><Button title={t("body.compare")} primary={tab === "compare"} onPress={() => compare()} /></View>
      <Text style={type.meta}>{t("body.count", { entries: entries.length, photos: entries.reduce((sum, entry) => sum + bodyPhotoCount(entry), 0) })}</Text>
      {tab === "history" ? active ? <>
        <Text style={type.sectionTitle}>{dateLabel(active.date)}</Text>
        {active.note ? <Text style={type.body}>{active.note}</Text> : null}
        <View style={styles.row}><Button title={t("body.edit")} disabled={busy || picking} onPress={() => { setEditing(active); setEditorOpen(true); }} /><Button title={t("body.compare")} onPress={() => compare(active)} /></View>
        {picking ? <Text style={type.meta}>{t("body.picking")}</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(12) }}>{BODY_POSES.map((view) => <View key={view} style={[styles.card, { flexBasis: "45%", flexGrow: 1, minWidth: 135, padding: space(10) }]}>
          <Text style={type.sectionTitle}>{t(`body.${view}`)}</Text>
          <PhotoFrame photo={active.photos[view]} label={t("body.viewPhoto", { pose: t(`body.${view}`), date: dateLabel(active.date) })} style={{ width: "100%" }} onOpen={() => showPhoto(active, view)} />
          <Button title={`${t(active.photos[view] ? "body.replace" : "body.add")} · ${t(`body.${view}`)}`} disabled={busy || picking} onPress={() => void selectPhoto(active, view)} />
          {active.photos[view] ? <Button title={`${t("body.removePhoto")} · ${t(`body.${view}`)}`} danger disabled={busy || picking} onPress={() => setDeleting({ id: active.id, pose: view })} /> : null}
        </View>)}</View>
        <Text style={type.meta}>{t("body.formats")}</Text><Button title={t("body.removeReview")} danger disabled={busy || picking} onPress={() => setDeleting({ id: active.id })} />
      </> : <>
        <Button primary title={t("body.new")} onPress={() => { setEditing(null); setEditorOpen(true); }} />
        <TextInput accessibilityLabel={t("body.search")} value={query} onChangeText={(text) => { setQuery(text); setLimit(20); }} placeholder={t("body.search")} placeholderTextColor={colors.muted} style={styles.input} />
        {!entries.length ? <View style={styles.card}><Text style={type.sectionTitle}>{t("body.emptyTitle")}</Text><Text style={type.body}>{t("body.emptyBody")}</Text></View> : null}
        {filtered.slice(0, limit).map((entry) => <Pressable key={entry.id} accessibilityRole="button" onPress={() => { setActiveId(entry.id); setError(null); }} style={styles.card}>
          <View style={styles.spread}><Text style={type.sectionTitle}>{dateLabel(entry.date)}</Text><Text style={type.meta}>{t("body.entryCount", { count: bodyPhotoCount(entry) })}</Text></View>
          {entry.note ? <Text style={type.body} numberOfLines={2}>{entry.note}</Text> : null}
        </Pressable>)}
        {entries.length > 0 && !filtered.length ? <Text style={type.body}>{t("body.noResults")}</Text> : null}
        {filtered.length > limit ? <Button title={t("body.more")} onPress={() => setLimit((value) => value + 20)} /> : null}
      </> : <>
        {comparable.length < 2 ? <Text style={type.body}>{t("body.needTwo")}</Text> : null}
        <View style={styles.row}>{BODY_POSES.map((view) => <Button key={view} primary={pose === view} title={t(`body.${view}`)} onPress={() => setPose(view)} />)}</View>
        <View style={{ flexDirection: "row", gap: space(10) }}>
          {([{ entry: a, field: "a", label: "body.selectA" }, { entry: b, field: "b", label: "body.selectB" }] as const).map(({ entry, field, label }) => <View key={field} style={{ flex: 1, gap: space(10) }}>
            <Text style={type.label}>{t(label)}</Text><Button title={entry ? dateLabel(entry.date) : t("body.selectDate")} onPress={() => setChoosing(field)} />
            <PhotoFrame photo={entry?.photos[pose]} label={t("body.viewPhoto", { pose: t(`body.${pose}`), date: entry ? dateLabel(entry.date) : t("body.noDate") })} style={{ width: "100%" }} onOpen={() => { if (entry) showPhoto(entry, pose); }} />
          </View>)}
        </View>
        <Button title={t("body.swap")} disabled={!a || !b} onPress={() => { setDateA(dateB); setDateB(dateA); }} />

      </>}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text> : null}
    </>}

  </Screen>
    <ReviewComposer open={editorOpen} entry={editing} onClose={() => setEditorOpen(false)} onSaved={(entry) => { setActiveId(entry.id); setTab("history"); }} />
    <BottomSheet open={choosing !== null} onOpenChange={(open) => { if (!open) setChoosing(null); }} accessibilityCloseLabel={t("body.close")} viewportRatio={0.75}>
      <SheetScrollView contentContainerStyle={{ padding: space(22), gap: space(12) }}><Text style={type.pageTitle}>{t(choosing === "a" ? "body.selectA" : "body.selectB")}</Text>
        {comparable.map((entry) => <Button key={entry.id} title={`${dateLabel(entry.date)} · ${t("body.entryCount", { count: bodyPhotoCount(entry) })}`} disabled={entry.id === (choosing === "a" ? dateB : dateA)} onPress={() => { if (choosing === "a") setDateA(entry.id); else setDateB(entry.id); setChoosing(null); }} />)}
      </SheetScrollView>
    </BottomSheet>
    <BottomSheet open={pending !== null} onOpenChange={(open) => { if (!open && !busy) clearPending(); }} accessibilityCloseLabel={t("body.close")} viewportRatio={0.9}>
      <SheetScrollView contentContainerStyle={{ padding: space(22), gap: space(14) }}>
        <Text style={type.pageTitle}>{t("body.preview")}{pending ? ` · ${t(`body.${pending.pose}`)}` : ""}</Text>
        {pending ? <Image source={{ uri: pending.picked.previewUri }} accessibilityLabel={t("body.preview")} resizeMode="contain" style={{ width: "100%", height: 280, backgroundColor: colors.void }} /> : null}
        <Text style={type.meta}>{t("body.sourceHint")}</Text>
        {photoError ? <><Text accessibilityRole="alert" style={styles.error}>{t(photoError)}</Text><Text style={type.meta}>{t("body.unsaved")}</Text></> : null}
        <Button primary title={t(busy ? "body.saving" : photoError ? "body.retrySave" : "common.save")} disabled={busy} onPress={() => void savePhoto()} />
        <Button title={t("body.cancelPhoto")} disabled={busy} onPress={clearPending} />
      </SheetScrollView>
    </BottomSheet>
    <ConfirmDialog open={deleting !== null} busy={busy} title={t(deleting?.pose ? "body.deletePhotoTitle" : "body.deleteTitle")} message={t(deleting?.pose ? "body.deletePhotoBody" : "body.deleteBody")} onConfirm={() => void confirmDelete()} onCancel={() => { if (!busy) setDeleting(null); }} />
    <Modal visible={viewer !== null} animationType="fade" onRequestClose={() => setViewer(null)}>
      <View style={{ flex: 1, backgroundColor: colors.void, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingHorizontal: space(16), gap: space(12) }}>
        <Text style={type.sectionTitle}>{viewer ? `${dateLabel(viewer.entry.date)} · ${t(`body.${viewer.pose}`)}` : ""}</Text><Button title={t("body.close")} onPress={() => setViewer(null)} />
        {viewer ? <PhotoFrame photo={viewer.photo} label={t("body.photoLabel", { pose: t(`body.${viewer.pose}`), date: dateLabel(viewer.entry.date) })} style={{ flex: 1, aspectRatio: undefined, width: "100%" }} /> : null}
      </View>
    </Modal>
  </>;
}
