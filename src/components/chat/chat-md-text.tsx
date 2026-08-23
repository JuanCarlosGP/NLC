import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { fonts } from "@/lib/theme";

type Props = {
  content: string;
  color: string;
  style?: StyleProp<TextStyle>;
};

/** Render ligero de markdown de chat: negrita, cursiva, código, listas y párrafos. */
export function ChatMdText({ content, color, style }: Props) {
  const blocks = splitBlocks(content.trim());
  if (blocks.length === 0) {
    return <Text style={[styles.body, { color }, style]}>{content}</Text>;
  }

  return (
    <Text style={[styles.body, { color }, style]}>
      {blocks.map((block, index) => (
        <Text key={`b-${index}`}>
          {index > 0 ? "\n" : null}
          {block.type === "list" ? (
            block.items.map((item, itemIndex) => (
              <Text key={`li-${itemIndex}`}>
                {itemIndex > 0 ? "\n" : null}
                {`${item.ordered ? `${item.index}. ` : "• "}`}
                {renderInline(item.text, color)}
              </Text>
            ))
          ) : block.type === "heading" ? (
            <Text style={[styles.heading, { color }]}>{renderInline(block.text, color)}</Text>
          ) : (
            renderInline(block.text, color)
          )}
        </Text>
      ))}
    </Text>
  );
}

type InlineSeg =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "code"; value: string };

type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | {
      type: "list";
      items: Array<{ text: string; ordered: boolean; index: number }>;
    };

function splitBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let listItems: Array<{ text: string; ordered: boolean; index: number }> | null = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text) blocks.push({ type: "paragraph", text });
  }

  function flushList() {
    if (!listItems || listItems.length === 0) {
      listItems = null;
      return;
    }
    blocks.push({ type: "list", items: listItems });
    listItems = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: heading[1]!.trim() });
      continue;
    }

    const unordered = trimmed.match(/^[-*•]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (!listItems) listItems = [];
      listItems.push({ text: unordered[1]!.trim(), ordered: false, index: listItems.length + 1 });
      continue;
    }

    const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (!listItems) listItems = [];
      listItems.push({
        text: ordered[2]!.trim(),
        ordered: true,
        index: Number(ordered[1]) || listItems.length + 1,
      });
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function parseInline(text: string): InlineSeg[] {
  const segments: InlineSeg[] = [];
  const pattern = /(\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+?`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) != null) {
    if (match.index > last) {
      segments.push({ kind: "text", value: text.slice(last, match.index) });
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      segments.push({ kind: "bold", value: token.slice(2, -2) });
    } else if (token.startsWith("*") && token.endsWith("*")) {
      segments.push({ kind: "italic", value: token.slice(1, -1) });
    } else if (token.startsWith("`") && token.endsWith("`")) {
      segments.push({ kind: "code", value: token.slice(1, -1) });
    } else {
      segments.push({ kind: "text", value: token });
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    segments.push({ kind: "text", value: text.slice(last) });
  }
  return segments.length > 0 ? segments : [{ kind: "text", value: text }];
}

function renderInline(text: string, color: string) {
  return parseInline(text).map((seg, index) => {
    if (seg.kind === "bold") {
      return (
        <Text key={`i-${index}`} style={styles.bold}>
          {seg.value}
        </Text>
      );
    }
    if (seg.kind === "italic") {
      return (
        <Text key={`i-${index}`} style={styles.italic}>
          {seg.value}
        </Text>
      );
    }
    if (seg.kind === "code") {
      return (
        <Text key={`i-${index}`} style={[styles.code, { color }]}>
          {seg.value}
        </Text>
      );
    }
    return <Text key={`i-${index}`}>{seg.value}</Text>;
  });
}

const styles = StyleSheet.create({
  body: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  heading: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    lineHeight: 21,
  },
  bold: {
    fontFamily: fonts.sansSemiBold,
  },
  italic: {
    fontStyle: "italic",
  },
  code: {
    fontFamily: fonts.sans,
    fontSize: 13,
  },
});
