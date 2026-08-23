import { useEffect, useRef, useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";

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

type Pose = "idle" | "blink" | "walk";

function later(minMs: number, extraMs: number) {
  return Date.now() + minMs + Math.floor(Math.random() * extraMs);
}

export function LadybugMark() {
  const pose = useRef<Pose>("idle");
  const step = useRef(0);
  const nextBlinkAt = useRef(later(2_000, 3_000));
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
          nextBlinkAt.current = later(2_000, 3_000);
        } else {
          nextBlinkAt.current = later(2_400, 4_000);
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
            Platform.OS === "web" ? styles.pixel : null,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: WIN_W,
    height: WIN_H,
  },
  window: {
    width: WIN_W,
    height: WIN_H,
    overflow: "hidden",
  },
  sheet: {
    position: "absolute",
    width: 256 * SHOW,
    height: 192 * SHOW,
  },
  pixel: {
    // @ts-expect-error web-only CSS
    imageRendering: "pixelated",
  },
});
