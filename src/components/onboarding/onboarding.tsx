import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Check, ChevronLeft, ChevronRight, File, Folder, FolderSearch, KeyRound, Lock, Server } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LadybugMark } from "@/components/brand/ladybug-mark";
import { Field, SwitchRow } from "@/components/settings/source-fields";
import { PartyPopper } from "@/components/onboarding/party-popper";
import { XMark } from "@/components/onboarding/x-mark";
import { useI18n } from "@/lib/i18n/context";
import { LOCALES } from "@/lib/i18n/locale";
import { pingNasConnection } from "@/lib/nas/source-factory";
import { joinPath, LIBRARY_DIR, type WebDavEntry } from "@/lib/nas/webdav";
import { ensureWebDavDir, listWebDavDir } from "@/lib/nas/webdav-source";
import {
  UNSET_NAS_SETTINGS,
  looksLikeFactoryNas,
  nasBaseUrl,
  type NasSettings,
} from "@/lib/settings/storage";
import { useSettings } from "@/lib/settings/settings-context";
import { colors, fonts, layout, type } from "@/lib/theme";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { webInteractiveStyle } from "@/lib/interactive";

const RIPPLE = { color: "rgba(240, 235, 227, 0.12)" };
const STEPS = 5;
const ICON_HIT = { top: 8, bottom: 8, left: 8, right: 8 } as const;
const IN_MS = 320;
const EASE = Easing.out(Easing.cubic);
const SPRING = { damping: 18, stiffness: 240, mass: 0.8 };

type Step = 0 | 1 | 2 | 3 | 4;
type FieldKey = "host" | "port" | "username" | "password" | "rootPath";

type Draft = {
  host: string;
  port: string;
  username: string;
  password: string;
  useHttps: boolean;
  rootPath: string;
  wantMusic: boolean;
  wantPodcasts: boolean;
  wantVideo: boolean;
  wantWealth: boolean;
};

const EMPTY_DRAFT: Draft = {
  host: "",
  port: "5005",
  username: "",
  password: "",
  useHttps: false,
  rootPath: "/",
  wantMusic: true,
  wantPodcasts: true,
  wantVideo: true,
  wantWealth: true,
};

function fieldFromMessage(message: string): FieldKey | null {
  const text = message.toLowerCase();
  if (
    text.includes("no responde") ||
    text.includes("not responding") ||
    text.includes("no se pudo conectar") ||
    text.includes("could not connect")
  ) {
    return null;
  }
  if (text.includes("contraseña") || text.includes("password")) return "password";
  if (text.includes("usuario") || text.includes("username")) return "username";
  if (text.includes("puerto") || text.includes("port")) return "port";
  if (
    text.includes("falta la ip") ||
    text.includes("ip is missing") ||
    text.includes("red local") ||
    text.includes("local network") ||
    text.includes("falta el servidor") ||
    text.includes("server ip")
  ) {
    return "host";
  }
  return null;
}

function libraryPaths(draft: Draft) {
  const root = draft.rootPath.trim() || "/";
  return {
    music: draft.wantMusic ? joinPath(root, LIBRARY_DIR.music) : "",
    podcasts: draft.wantPodcasts ? joinPath(root, LIBRARY_DIR.podcasts) : "",
    video: draft.wantVideo ? joinPath(root, LIBRARY_DIR.video) : "",
    wealth: draft.wantWealth ? joinPath(root, LIBRARY_DIR.wealth) : "",
  };
}

function parentPath(path: string): string {
  const parts = (path.trim() || "/").replace(/\/+$/, "").split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "/";
}

function toNasSettings(base: NasSettings, draft: Draft): NasSettings {
  const host = draft.host.trim();
  const port = draft.port.trim() || "5005";
  const username = draft.username.trim();
  const paths = libraryPaths(draft);
  return {
    ...base,
    sourceKind: "webdav",
    host,
    port,
    username,
    sharePath: paths.music,
    useHttps: draft.useHttps,
    podcastSharePath: paths.podcasts,
    videoHost: draft.wantVideo ? host : "",
    videoPort: port,
    videoUsername: draft.wantVideo ? username : "",
    videoSharePath: paths.video,
    videoUseHttps: draft.useHttps,
    wealthSharePath: paths.wealth,
    focusSharePath: paths.wealth,
  };
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduce(value);
    });
    try {
      const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
      return () => {
        alive = false;
        sub.remove();
      };
    } catch {
      return () => {
        alive = false;
      };
    }
  }, []);
  return reduce;
}

function Reveal({
  delay = 0,
  reduce,
  children,
}: {
  delay?: number;
  reduce: boolean;
  children: ReactNode;
}) {
  const progress = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    progress.value = reduce
      ? 1
      : withDelay(delay, withTiming(1, { duration: 420, easing: EASE }));
  }, [delay, progress, reduce]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [14, 0]) }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function StepPips({ step, reduce }: { step: number; reduce: boolean }) {
  const { t } = useI18n();
  const label = t("onboarding.stepOf", { current: step + 1, total: STEPS });
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={styles.stepMeta}
    >
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.pips}>
        {Array.from({ length: STEPS }, (_, index) => (
          <Pip key={index} on={index <= step} reduce={reduce} />
        ))}
      </View>
    </View>
  );
}

function Pip({ on, reduce }: { on: boolean; reduce: boolean }) {
  const fill = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    fill.value = reduce
      ? on
        ? 1
        : 0
      : withTiming(on ? 1 : 0, { duration: 280, easing: EASE });
  }, [fill, on, reduce]);

  const style = useAnimatedStyle(() => ({
    opacity: fill.value,
  }));

  return (
    <View style={styles.pipTrack}>
      <Animated.View style={[styles.pipFill, style]} />
    </View>
  );
}

function PrimaryButton({
  label,
  accessibilityLabel,
  disabled,
  busy,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        android_ripple={RIPPLE}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          if (!disabled) scale.value = withSpring(0.97, SPRING);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING);
        }}
        style={({ pressed }) => [
          styles.primary,
          webInteractiveStyle(),
          { opacity: disabled ? 0.45 : pressed ? 0.92 : 1 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Text style={styles.primaryText}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <View style={styles.langRow} accessibilityLabel={t("language.title")}>
      {LOCALES.map((item) => {
        const on = locale === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: on }}
            android_ripple={RIPPLE}
            onPress={() => {
              if (on) return;
              triggerUiHaptic();
              setLocale(item.id);
            }}
            style={({ pressed }) => [
              styles.langBtn,
              on ? styles.langBtnOn : null,
              webInteractiveStyle(),
              { opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Text style={on ? styles.langTextOn : styles.langTextOff}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Onboarding() {
  const insets = useSafeAreaInsets();
  const reduceMotion = usePrefersReducedMotion();
  const { settings, skipOnboarding, completeOnboarding } = useSettings();
  const { t } = useI18n();
  const [step, setStep] = useState<Step>(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState(false);
  const [foldersTried, setFoldersTried] = useState(false);
  const [pingOk, setPingOk] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; color: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [entering, setEntering] = useState(false);

  const opacity = useSharedValue(0);
  const shift = useSharedValue(16);
  const back = useSharedValue(0);
  const preview = useMemo(() => toNasSettings(UNSET_NAS_SETTINGS, draft), [draft]);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      shift.value = 0;
      return;
    }
    opacity.value = withTiming(1, { duration: 480, easing: EASE });
    shift.value = withTiming(0, { duration: 480, easing: EASE });
  }, [opacity, reduceMotion, shift]);

  useEffect(() => {
    back.value = reduceMotion
      ? step > 0
        ? 1
        : 0
      : withTiming(step > 0 ? 1 : 0, { duration: 220, easing: EASE });
  }, [back, reduceMotion, step]);

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: shift.value }],
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: back.value,
    transform: [{ translateX: interpolate(back.value, [0, 1], [-6, 0]) }],
  }));

  const go = useCallback(
    (next: Step) => {
      Keyboard.dismiss();
      if (next === step) return;
      const dir = next > step ? 1 : -1;
      setStep(next);
      if (reduceMotion) {
        opacity.value = 1;
        shift.value = 0;
        return;
      }
      opacity.value = 0;
      shift.value = dir * 18;
      opacity.value = withTiming(1, { duration: IN_MS, easing: EASE });
      shift.value = withTiming(0, { duration: IN_MS, easing: EASE });
    },
    [opacity, reduceMotion, shift, step],
  );

  const skip = useCallback(() => {
    if (busy || entering) return;
    triggerUiHaptic();
    void skipOnboarding();
  }, [busy, entering, skipOnboarding]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (busy || entering) return true;
      if (step > 0) {
        go((step - 1) as Step);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [busy, entering, go, step]);

  async function testConnection() {
    if (busy) return;
    Keyboard.dismiss();
    triggerUiHaptic();
    setBusy(true);
    setFeedback(null);
    setFieldErrors({});
    const next = toNasSettings(UNSET_NAS_SETTINGS, draft);
    try {
      const ping = await pingNasConnection(next, draft.password);
      setTested(true);
      setPingOk(ping.ok);
      if (ping.ok) {
        setFeedback({ text: ping.message, color: colors.ok });
        return;
      }
      const field = fieldFromMessage(ping.message);
      if (field) setFieldErrors({ [field]: ping.message });
      const canContinue = t("onboarding.continueSettings");
      setFeedback({
        text: ping.message.includes(canContinue.trim()) ? ping.message : `${ping.message}${canContinue}`,
        color: colors.warn,
      });
    } catch (error) {
      setTested(true);
      setPingOk(false);
      setFeedback({
        text:
          error instanceof Error
            ? `${error.message}${t("onboarding.nasDownSuffix")}`
            : t("onboarding.nasDown"),
        color: colors.warn,
      });
    } finally {
      setBusy(false);
    }
  }

  async function enter() {
    if (entering) return;
    triggerUiHaptic();
    setEntering(true);
    try {
      const base = looksLikeFactoryNas(settings) ? UNSET_NAS_SETTINGS : settings;
      const next = toNasSettings(base, draft);
      await completeOnboarding(next, draft.password);
    } catch {
      setEntering(false);
      setFeedback({
        text: t("onboarding.saveFail"),
        color: colors.danger,
      });
    }
  }

  const canTest = Boolean(draft.host.trim()) && !busy;
  const canContinueConnect = tested && !busy;
  const footerBottom = Math.max(insets.bottom, 12) + 28;
  const paths = useMemo(() => libraryPaths(draft), [draft]);

  useEffect(() => {
    setFoldersTried(false);
  }, [draft.rootPath, draft.wantMusic, draft.wantPodcasts, draft.wantVideo, draft.wantWealth]);

  async function createFolders() {
    if (busy) return;
    Keyboard.dismiss();
    triggerUiHaptic();
    const toCreate = [
      paths.music,
      paths.podcasts,
      paths.video,
      paths.video ? joinPath(paths.video, "series") : "",
      paths.video ? joinPath(paths.video, "movies") : "",
      paths.wealth,
    ].filter(Boolean);
    if (!toCreate.length) {
      setFeedback({ text: t("onboarding.pickLibrary"), color: colors.warn });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const next = toNasSettings(UNSET_NAS_SETTINGS, draft);
      for (const path of toCreate) {
        await ensureWebDavDir(next, draft.password, path);
      }
      setFeedback({
        text: t("onboarding.foldersReady", { root: draft.rootPath.trim() || "/" }),
        color: colors.ok,
      });
    } catch (error) {
      setFeedback({
        text:
          error instanceof Error
            ? `${error.message}${t("onboarding.foldersFailSuffix")}`
            : t("onboarding.foldersFail"),
        color: colors.warn,
      });
    } finally {
      setFoldersTried(true);
      setBusy(false);
    }
  }

  const primary =
    step === 0
      ? {
          label: t("onboarding.start"),
          accessibilityLabel: t("onboarding.start"),
          onPress: () => {
            triggerUiHaptic();
            go(1);
          },
          disabled: false,
          busy: false,
        }
      : step === 1
        ? {
            label: t("onboarding.continue"),
            accessibilityLabel: t("onboarding.continue"),
            onPress: () => {
              triggerUiHaptic();
              go(2);
            },
            disabled: false,
            busy: false,
          }
        : step === 2
          ? tested
            ? {
                label: t("onboarding.continue"),
                accessibilityLabel: t("onboarding.continue"),
                onPress: () => {
                  triggerUiHaptic();
                  setFeedback(null);
                  go(3);
                },
                disabled: !canContinueConnect,
                busy: false,
              }
            : {
                label: busy ? t("onboarding.testing") : t("onboarding.testConnection"),
                accessibilityLabel: t("onboarding.testConnection"),
                onPress: () => void testConnection(),
                disabled: !canTest,
                busy,
              }
          : step === 3
            ? {
                label: t("onboarding.continue"),
                accessibilityLabel: t("onboarding.continue"),
                onPress: () => {
                  triggerUiHaptic();
                  setFeedback(null);
                  go(4);
                },
                disabled: busy || !foldersTried,
                busy: false,
              }
            : {
                label: entering ? t("onboarding.entering") : t("onboarding.enter"),
                accessibilityLabel: t("onboarding.enter"),
                onPress: () => void enter(),
                disabled: entering,
                busy: entering,
              };

  const body = (
    <Animated.View style={[styles.bodyFill, bodyStyle]}>
      {step === 0 ? <WelcomeStep reduce={reduceMotion} /> : null}
      {step === 1 ? <NeedStep reduce={reduceMotion} /> : null}
      {step === 2 ? (
        <ConnectStep
          draft={draft}
          setDraft={setDraft}
          fieldErrors={fieldErrors}
          reduce={reduceMotion}
          onEdit={() => {
            setTested(false);
            setPingOk(false);
          }}
        />
      ) : null}
      {step === 3 ? (
        <FoldersStep
          draft={draft}
          setDraft={setDraft}
          paths={paths}
          reduce={reduceMotion}
          busy={busy}
          onCreate={() => void createFolders()}
        />
      ) : null}
      {step === 4 ? (
        <ReadyStep reduce={reduceMotion} endpoint={nasBaseUrl(preview)} paths={paths} />
      ) : null}
      {step === 2 ? (
        <>
          {tested ? (
            <Reveal delay={0} reduce={reduceMotion}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("onboarding.testConnection")}
                android_ripple={RIPPLE}
                disabled={!canTest}
                onPress={() => void testConnection()}
                style={({ pressed }) => [
                  styles.retry,
                  webInteractiveStyle(),
                  { opacity: !canTest ? 0.45 : pressed ? 0.7 : 1 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.inkSoft} />
                ) : (
                  <Text style={styles.retryText}>{t("onboarding.testAgain")}</Text>
                )}
              </Pressable>
            </Reveal>
          ) : (
            <View style={styles.retry} />
          )}
        </>
      ) : null}
      {step === 2 || step === 3 ? (
        <View style={styles.feedbackSlot}>
          {feedback ? (
            <Reveal delay={0} reduce={reduceMotion}>
              {feedback.color === colors.ok ? (
                <View
                  accessibilityRole="alert"
                  accessibilityLabel={feedback.text}
                  style={styles.okCard}
                >
                  <PartyPopper key={feedback.text} play reduce={reduceMotion} />
                  <Text style={styles.okText}>{feedback.text}</Text>
                </View>
              ) : (
                <View
                  accessibilityRole="alert"
                  accessibilityLabel={feedback.text}
                  style={feedback.color === colors.warn ? styles.warnCard : styles.errCard}
                >
                  <XMark
                    key={feedback.text}
                    play
                    reduce={reduceMotion}
                    color={feedback.color === colors.warn ? colors.warn : colors.danger}
                  />
                  <Text
                    style={[
                      styles.errText,
                      feedback.color === colors.warn ? styles.warnText : null,
                    ]}
                  >
                    {feedback.text}
                  </Text>
                </View>
              )}
            </Reveal>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Animated.View style={backStyle} pointerEvents={step > 0 ? "auto" : "none"}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("onboarding.back")}
            hitSlop={ICON_HIT}
            android_ripple={RIPPLE}
            onPress={() => {
              if (busy || entering || step === 0) return;
              triggerUiHaptic();
              go((step - 1) as Step);
            }}
            style={({ pressed }) => [styles.headerBtn, webInteractiveStyle(), { opacity: pressed ? 0.7 : 1 }]}
          >
            <ChevronLeft color={colors.ink} size={26} strokeWidth={1.85} />
          </Pressable>
        </Animated.View>
        <StepPips step={step} reduce={reduceMotion} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.skip")}
          hitSlop={ICON_HIT}
          android_ripple={RIPPLE}
          onPress={skip}
          style={({ pressed }) => [styles.headerBtn, webInteractiveStyle(), { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.skip}>{t("onboarding.skip")}</Text>
        </Pressable>
      </View>

      {step === 2 || step === 3 ? (
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {body}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {body}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: footerBottom }]}>
        {step === 0 ? <LanguageToggle /> : null}
        <PrimaryButton
          label={primary.label}
          accessibilityLabel={primary.accessibilityLabel}
          disabled={primary.disabled}
          busy={primary.busy}
          onPress={primary.onPress}
        />
      </View>
    </View>
  );
}

function WelcomeHero({ reduce }: { reduce: boolean }) {
  const mark = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    mark.value = reduce ? 1 : withSpring(1, { damping: 16, stiffness: 180, mass: 0.9 });
  }, [mark, reduce]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    transform: [{ scale: interpolate(mark.value, [0, 1], [0.82, 1]) }],
  }));

  return (
    <View style={styles.hero}>
      <Animated.View style={markStyle}>
        <LadybugMark />
      </Animated.View>
    </View>
  );
}

function TitleRule({ reduce }: { reduce: boolean }) {
  const fill = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    fill.value = reduce ? 1 : withDelay(280, withTiming(1, { duration: 680, easing: EASE }));
  }, [fill, reduce]);

  const style = useAnimatedStyle(() => ({
    width: interpolate(fill.value, [0, 1], [0, 56]),
    opacity: fill.value,
  }));

  return <Animated.View style={[styles.titleRule, style]} />;
}

function WelcomeStep({ reduce }: { reduce: boolean }) {
  const { t } = useI18n();
  return (
    <View style={styles.welcome}>
      <WelcomeHero reduce={reduce} />
      <Reveal delay={90} reduce={reduce}>
        <Text style={type.label}>{t("onboarding.kicker")}</Text>
      </Reveal>
      <Reveal delay={140} reduce={reduce}>
        <Text style={styles.title}>NLC</Text>
        <TitleRule reduce={reduce} />
      </Reveal>
      <Reveal delay={220} reduce={reduce}>
        <Text style={type.body}>{t("onboarding.welcomeBody1")}</Text>
      </Reveal>
      <Reveal delay={290} reduce={reduce}>
        <Text style={type.body}>{t("onboarding.welcomeBody2")}</Text>
      </Reveal>
    </View>
  );
}

function NeedStep({ reduce }: { reduce: boolean }) {
  const { t } = useI18n();
  return (
    <View style={styles.block}>
      <Reveal delay={0} reduce={reduce}>
        <Text style={styles.title}>{t("onboarding.needTitle")}</Text>
      </Reveal>
      <Reveal delay={70} reduce={reduce}>
        <Text style={type.body}>{t("onboarding.needIntro")}</Text>
      </Reveal>
      <View style={styles.needList}>
        <NeedItem
          delay={120}
          reduce={reduce}
          icon={<Server color={colors.accent} size={18} strokeWidth={1.85} />}
          label={t("onboarding.needHost")}
          hint={t("onboarding.needHostHint")}
        />
        <NeedItem
          delay={200}
          reduce={reduce}
          icon={<KeyRound color={colors.accent} size={18} strokeWidth={1.85} />}
          label={t("onboarding.needAuth")}
          hint={t("onboarding.needAuthHint")}
        />
        <NeedItem
          delay={280}
          reduce={reduce}
          icon={<Folder color={colors.accent} size={18} strokeWidth={1.85} />}
          label={t("onboarding.needFolders")}
          hint={t("onboarding.needFoldersHint")}
        />
      </View>
      <Reveal delay={340} reduce={reduce}>
        <View style={styles.privacyCard}>
          <View style={styles.needIcon}>
            <Lock color={colors.accent} size={18} strokeWidth={1.85} />
          </View>
          <View style={styles.needCopy}>
            <Text style={styles.needLabel}>{t("onboarding.needPrivacy")}</Text>
            <Text style={styles.helper}>{t("onboarding.needPrivacyHint")}</Text>
          </View>
        </View>
      </Reveal>
      <Reveal delay={400} reduce={reduce}>
        <Text style={styles.helper}>{t("onboarding.needFooter")}</Text>
      </Reveal>
    </View>
  );
}

function NeedItem({
  delay,
  reduce,
  icon,
  label,
  hint,
}: {
  delay: number;
  reduce: boolean;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Reveal delay={delay} reduce={reduce}>
      <View style={styles.needItem}>
        <View style={styles.needIcon}>{icon}</View>
        <View style={styles.needCopy}>
          <Text style={styles.needLabel}>{label}</Text>
          <Text style={styles.helper}>{hint}</Text>
        </View>
      </View>
    </Reveal>
  );
}

function ReadyStep({
  reduce,
  endpoint,
  paths,
}: {
  reduce: boolean;
  endpoint: string;
  paths: ReturnType<typeof libraryPaths>;
}) {
  const { t } = useI18n();
  const seal = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    seal.value = reduce ? 1 : withDelay(80, withSpring(1, { damping: 14, stiffness: 220, mass: 0.7 }));
  }, [reduce, seal]);

  const sealStyle = useAnimatedStyle(() => ({
    opacity: seal.value,
    transform: [{ scale: interpolate(seal.value, [0, 1], [0.7, 1]) }],
  }));

  return (
    <View style={styles.block}>
      <Animated.View style={[styles.seal, sealStyle]}>
        <Check color={colors.ok} size={22} strokeWidth={2.4} />
      </Animated.View>
      <Reveal delay={140} reduce={reduce}>
        <Text style={styles.title}>{t("onboarding.readyTitle")}</Text>
      </Reveal>
      <Reveal delay={200} reduce={reduce}>
        <Text style={type.body}>{t("onboarding.readyBody")}</Text>
      </Reveal>
      <Reveal delay={260} reduce={reduce}>
        <View style={styles.summary}>
          <Text style={styles.summaryValue}>{endpoint}</Text>
          {paths.music ? <Text style={styles.summaryPath}>{t("onboarding.musicPath", { path: paths.music })}</Text> : null}
          {paths.podcasts ? (
            <Text style={styles.summaryPath}>{t("onboarding.podcastsPath", { path: paths.podcasts })}</Text>
          ) : null}
          {paths.video ? <Text style={styles.summaryPath}>{t("onboarding.videoPath", { path: paths.video })}</Text> : null}
          {paths.wealth ? <Text style={styles.summaryPath}>{t("onboarding.wealthPath", { path: paths.wealth })}</Text> : null}
        </View>
      </Reveal>
      <Reveal delay={320} reduce={reduce}>
        <Text style={type.body}>{t("onboarding.readyHint")}</Text>
      </Reveal>
    </View>
  );
}

function ConnectStep({
  draft,
  setDraft,
  fieldErrors,
  reduce,
  onEdit,
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  fieldErrors: Partial<Record<FieldKey, string>>;
  reduce: boolean;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const patch = (partial: Partial<Draft>) => {
    onEdit();
    setDraft({ ...draft, ...partial });
  };
  const summary = `${draft.useHttps ? "https" : "http"}://${draft.host.trim() || "host"}:${draft.port.trim() || "5005"}`;
  return (
    <View style={styles.block}>
      <Reveal delay={0} reduce={reduce}>
        <Text style={styles.title}>{t("onboarding.connectTitle")}</Text>
      </Reveal>
      <Reveal delay={70} reduce={reduce}>
        <Text style={type.body}>{t("onboarding.connectBody")}</Text>
      </Reveal>
      <Reveal delay={120} reduce={reduce}>
        <View style={styles.form}>
          <Field
            label={t("onboarding.host")}
            value={draft.host}
            onChange={(host) => patch({ host })}
            autoCapitalize="none"
            hint={t("onboarding.hostHint")}
            error={fieldErrors.host}
            accessibilityLabel={t("onboarding.host")}
          />
          <Field
            label={t("onboarding.port")}
            value={draft.port}
            onChange={(port) => patch({ port })}
            keyboardType="number-pad"
            error={fieldErrors.port}
            accessibilityLabel={t("onboarding.port")}
          />
          <Field
            label={t("onboarding.user")}
            value={draft.username}
            onChange={(username) => patch({ username })}
            autoCapitalize="none"
            error={fieldErrors.username}
            accessibilityLabel={t("onboarding.user")}
          />
          <Field
            label={t("onboarding.password")}
            value={draft.password}
            onChange={(password) => patch({ password })}
            secure
            autoCapitalize="none"
            error={fieldErrors.password}
            accessibilityLabel={t("onboarding.password")}
          />
          <View style={styles.switchCard}>
            <SwitchRow
              label={t("onboarding.https")}
              hint={summary}
              value={draft.useHttps}
              onValueChange={(useHttps) => patch({ useHttps })}
              accessibilityLabel={t("onboarding.https")}
            />
          </View>
        </View>
      </Reveal>
    </View>
  );
}

function FoldersStep({
  draft,
  setDraft,
  paths,
  reduce,
  busy,
  onCreate,
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  paths: ReturnType<typeof libraryPaths>;
  reduce: boolean;
  busy: boolean;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const patch = (partial: Partial<Draft>) => setDraft({ ...draft, ...partial });
  const root = draft.rootPath.trim() || "/";
  const inspectSeq = useRef(0);
  const [listing, setListing] = useState<WebDavEntry[] | null>(null);
  const [listingBusy, setListingBusy] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const listingOpen = listing !== null || listingBusy || Boolean(listingError);
  const canCreate =
    Boolean(draft.rootPath.trim()) &&
    (draft.wantMusic || draft.wantPodcasts || draft.wantVideo || draft.wantWealth) &&
    !busy &&
    !listingBusy;
  const canInspect = Boolean(draft.host.trim()) && !busy && !listingBusy;
  const shown = listing ?? [];

  async function inspect(path = root) {
    if (busy) return;
    Keyboard.dismiss();
    triggerUiHaptic();
    const seq = ++inspectSeq.current;
    const target = path.trim() || "/";
    setListingBusy(true);
    setListingError(null);
    try {
      const next = toNasSettings(UNSET_NAS_SETTINGS, { ...draft, rootPath: target });
      const entries = await listWebDavDir(next, draft.password, target);
      if (seq !== inspectSeq.current) return;
      setListing(entries);
    } catch (error) {
      if (seq !== inspectSeq.current) return;
      if (listing === null) setListing([]);
      setListingError(error instanceof Error ? error.message : t("onboarding.listFail"));
    } finally {
      if (seq === inspectSeq.current) setListingBusy(false);
    }
  }

  function chooseRoot(path: string) {
    const next = path.trim() || "/";
    patch({ rootPath: next });
    void inspect(next);
  }

  return (
    <View style={styles.block}>
      <Reveal delay={0} reduce={reduce}>
        <Text style={styles.title}>{t("onboarding.foldersTitle")}</Text>
      </Reveal>
      <Reveal delay={70} reduce={reduce}>
        <Text style={type.body}>
          {t("onboarding.foldersBody", {
            music: LIBRARY_DIR.music,
            podcasts: LIBRARY_DIR.podcasts,
            video: LIBRARY_DIR.video,
            wealth: LIBRARY_DIR.wealth,
          })}
        </Text>
      </Reveal>
      <Reveal delay={120} reduce={reduce}>
        <View style={styles.form}>
          <Field
            label={t("onboarding.root")}
            value={draft.rootPath}
            onChange={(rootPath) => patch({ rootPath })}
            autoCapitalize="none"
            placeholder="/"
            accessibilityLabel={t("onboarding.rootA11y")}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("onboarding.browse")}
            android_ripple={RIPPLE}
            disabled={!canInspect}
            onPress={() => void inspect()}
            style={({ pressed }) => [
              styles.createBtn,
              webInteractiveStyle(),
              { opacity: !canInspect ? 0.45 : pressed ? 0.86 : 1 },
            ]}
          >
            <FolderSearch color={colors.accent} size={18} strokeWidth={1.85} />
            <Text style={styles.createBtnText}>{t("onboarding.browse")}</Text>
          </Pressable>
          {listingOpen ? (
            <View style={styles.listing}>
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                style={[styles.listingScroll, listingBusy ? styles.listingDim : null]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("onboarding.upA11y")}
                  accessibilityState={{ disabled: root === "/" || listingBusy }}
                  android_ripple={RIPPLE}
                  disabled={root === "/" || listingBusy}
                  onPress={() => chooseRoot(parentPath(root))}
                  style={({ pressed }) => [
                    styles.listingRow,
                    webInteractiveStyle(),
                    { opacity: root === "/" ? 0.4 : pressed ? 0.82 : 1 },
                  ]}
                >
                  <ChevronLeft color={colors.muted} size={16} strokeWidth={1.85} />
                  <Text style={styles.listingMuted}>{t("onboarding.up")}</Text>
                </Pressable>
                {listingError && !listingBusy ? (
                  <Text accessibilityRole="alert" style={styles.listingError}>
                    {listingError}
                  </Text>
                ) : null}
                {!listingBusy && shown.length === 0 && !listingError ? (
                  <Text style={styles.listingEmpty}>{t("onboarding.emptyFolder")}</Text>
                ) : (
                  shown.slice(0, 24).map((entry) =>
                    entry.dir ? (
                      <Pressable
                        key={entry.path}
                        accessibilityRole="button"
                        accessibilityLabel={t("onboarding.useAsRoot", { name: entry.name })}
                        android_ripple={RIPPLE}
                        disabled={listingBusy}
                        onPress={() => chooseRoot(entry.path)}
                        style={({ pressed }) => [
                          styles.listingRow,
                          webInteractiveStyle(),
                          { opacity: pressed ? 0.82 : 1 },
                        ]}
                      >
                        <Folder color={colors.accent} size={16} strokeWidth={1.85} />
                        <Text style={styles.listingName} numberOfLines={1}>
                          {entry.name}
                        </Text>
                        <ChevronRight color={colors.muted} size={16} strokeWidth={1.85} />
                      </Pressable>
                    ) : (
                      <View key={entry.path} style={styles.listingRow}>
                        <File color={colors.muted} size={16} strokeWidth={1.85} />
                        <Text style={styles.listingMuted} numberOfLines={1}>
                          {entry.name}
                        </Text>
                      </View>
                    ),
                  )
                )}
                {shown.length > 24 ? (
                  <Text style={styles.listingEmpty}>{t("onboarding.andMore", { count: shown.length - 24 })}</Text>
                ) : null}
                <Text style={styles.listingHint}>{t("onboarding.tapFolder")}</Text>
              </ScrollView>
              {listingBusy ? (
                <View pointerEvents="none" style={styles.listingOverlay}>
                  <ActivityIndicator color={colors.ink} />
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.switchCard}>
            <SwitchRow
              label={t("onboarding.music")}
              hint={paths.music || t("onboarding.noMusic")}
              value={draft.wantMusic}
              onValueChange={(wantMusic) => patch({ wantMusic })}
              accessibilityLabel={t("onboarding.music")}
            />
            <SwitchRow
              label={t("onboarding.podcasts")}
              hint={paths.podcasts || t("onboarding.noPodcasts")}
              value={draft.wantPodcasts}
              onValueChange={(wantPodcasts) => patch({ wantPodcasts })}
              accessibilityLabel={t("onboarding.podcasts")}
            />
            <SwitchRow
              label={t("onboarding.video")}
              hint={paths.video || t("onboarding.noVideo")}
              value={draft.wantVideo}
              onValueChange={(wantVideo) => patch({ wantVideo })}
              accessibilityLabel={t("onboarding.video")}
            />
            <SwitchRow
              label={t("onboarding.wealth")}
              hint={paths.wealth || t("onboarding.noWealth")}
              value={draft.wantWealth}
              onValueChange={(wantWealth) => patch({ wantWealth })}
              accessibilityLabel={t("onboarding.wealth")}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("onboarding.create")}
            android_ripple={RIPPLE}
            disabled={!canCreate}
            onPress={onCreate}
            style={({ pressed }) => [
              styles.createBtn,
              webInteractiveStyle(),
              { opacity: !canCreate ? 0.45 : pressed ? 0.86 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <>
                <Folder color={colors.accent} size={18} strokeWidth={1.85} />
                <Text style={styles.createBtnText}>{t("onboarding.create")}</Text>
              </>
            )}
          </Pressable>
        </View>
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.void,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    minHeight: 56,
  },
  headerBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  stepMeta: {
    alignItems: "center",
    gap: 8,
  },
  stepLabel: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  pips: {
    flexDirection: "row",
    gap: 6,
    width: 108,
  },
  pipTrack: {
    flex: 1,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.rule,
    overflow: "hidden",
    justifyContent: "center",
  },
  pipFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  skip: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.inkSoft,
  },
  body: { flex: 1 },
  bodyFill: { flexGrow: 1, gap: 16 },
  bodyContent: {
    paddingHorizontal: layout.screenPad,
    paddingTop: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  welcome: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
    paddingBottom: 24,
  },
  hero: {
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  titleRule: {
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginTop: 10,
    marginBottom: 2,
  },
  block: { gap: 16 },
  title: {
    ...type.pageTitle,
    fontSize: 34,
    lineHeight: 40,
  },
  helper: {
    ...type.body,
    color: colors.muted,
  },
  needList: { gap: 10 },
  needItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  needIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(228, 213, 184, 0.1)",
  },
  needCopy: { flex: 1, gap: 4, paddingTop: 2 },
  needLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  privacyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(228, 213, 184, 0.28)",
    backgroundColor: "rgba(228, 213, 184, 0.08)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  form: { gap: 14 },
  switchCard: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 12,
    overflow: "hidden",
  },
  retry: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.inkSoft,
  },
  createBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  createBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  listing: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 12,
    overflow: "hidden",
    height: 176,
  },
  listingScroll: {
    height: 176,
  },
  listingDim: {
    opacity: 0.45,
  },
  listingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(14, 13, 12, 0.28)",
  },
  listingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  listingName: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  listingMuted: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.muted,
  },
  listingEmpty: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  listingHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  listingError: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  feedbackSlot: { minHeight: 56 },
  okCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(143, 184, 154, 0.35)",
    backgroundColor: "rgba(143, 184, 154, 0.12)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  okText: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ok,
  },
  errCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(201, 137, 128, 0.4)",
    backgroundColor: "rgba(201, 137, 128, 0.12)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  warnCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(196, 165, 116, 0.4)",
    backgroundColor: "rgba(196, 165, 116, 0.12)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  errText: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.danger,
  },
  warnText: {
    color: colors.warn,
  },
  seal: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(143, 184, 154, 0.16)",
  },
  summary: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
  },
  summaryValue: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  summaryPath: {
    ...type.body,
    color: colors.inkSoft,
  },
  footer: {
    paddingHorizontal: layout.screenPad,
    paddingTop: 12,
    gap: 10,
  },
  langRow: {
    flexDirection: "row",
    gap: 8,
  },
  langBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    alignItems: "center",
    justifyContent: "center",
  },
  langBtnOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  langTextOn: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.void,
  },
  langTextOff: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  primary: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  primaryText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: colors.accentText,
  },
});
