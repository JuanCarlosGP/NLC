import { useEffect, useRef, useState } from "react";
import { Image, Platform, StyleSheet, View, type ImageStyle } from "react-native";

const SHEET = require("../../../assets/ladybug-sheet-hd.png");
const COLS = 8;
const SHOW = 6;
const CELL = 32 * SHOW;
const CROP = { x: 10 * SHOW, y: 12 * SHOW, w: 13 * SHOW, h: 9 * SHOW };
const WIN_W = CROP.w;
const WIN_H = CROP.h;

const BLINK_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7];
const WALK_FRAMES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const BLINK_MS = 180;
const WALK_MS = 120;
const BLINK_GAP_MIN = 700;
const BLINK_GAP_EXTRA = 2_800;

type Pose = "idle" | "blink" | "walk";

function later(minMs: number, extraMs: number) {
  return Date.now() + minMs + Math.floor(Math.random() * extraMs);
}

export function LadybugMark() {
  const pose = useRef<Pose>("idle");
  const step = useRef(0);
  const nextBlinkAt = useRef(later(BLINK_GAP_MIN, BLINK_GAP_EXTRA));
  const nextWalkAt = useRef(later(10_000, 14_000));
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let acc = 0;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      acc += now - last;
      last = now;

      if (pose.current === "idle") {
        if (now >= nextWalkAt.current) {
          pose.current = "walk";
          step.current = 0;
          acc = 0;
          setFrame(WALK_FRAMES[0]!);
          return;
        }
        if (now >= nextBlinkAt.current) {
          pose.current = "blink";
          step.current = 0;
          acc = 0;
          setFrame(BLINK_FRAMES[0]!);
        }
        return;
      }

      const need = pose.current === "walk" ? WALK_MS : BLINK_MS;
      if (acc < need) return;
      acc = 0;

      const seq = pose.current === "walk" ? WALK_FRAMES : BLINK_FRAMES;
      step.current += 1;
      if (step.current >= seq.length) {
        pose.current = "idle";
        step.current = 0;
        if (seq === WALK_FRAMES) {
          nextWalkAt.current = later(12_000, 16_000);
          nextBlinkAt.current = later(BLINK_GAP_MIN, BLINK_GAP_EXTRA);
        } else {
          nextBlinkAt.current = later(BLINK_GAP_MIN, BLINK_GAP_EXTRA);
        }
        setFrame(0);
        return;
      }
      setFrame(seq[step.current]!);
    }, 80);
    return () => clearInterval(id);
  }, []);

  const col = frame % COLS;
  const row = Math.floor(frame / COLS);

  return (
    <View accessibilityRole="image" accessibilityLabel="NLC" style={styles.hit}>
      <View pointerEvents="none" style={styles.ground} />
      <View style={styles.window}>
        <Image
          source={SHEET}
          resizeMode="stretch"
          resizeMethod="scale"
          fadeDuration={0}
          style={[
            styles.sheet,
            {
              left: -(col * CELL + CROP.x),
              top: -(row * CELL + CROP.y),
            },
            Platform.OS === "web" ? pixelWeb : null,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: WIN_W,
    height: WIN_H + 2,
    alignItems: "center",
  },
  window: {
    width: WIN_W,
    height: WIN_H,
    overflow: "hidden",
    zIndex: 1,
  },
  ground: {
    position: "absolute",
    bottom: SHOW - 2,
    width: WIN_W - 4,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#7AE86A",
    opacity: 0.85,
  },
  sheet: {
    position: "absolute",
    width: 256 * SHOW,
    height: 192 * SHOW,
  },
});

const pixelWeb = {
  imageRendering: "pixelated",
  filter: "saturate(3.4) contrast(1.42) brightness(1.28) hue-rotate(-14deg)",
} as ImageStyle;
