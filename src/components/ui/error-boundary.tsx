import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SND crash", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.fill}>
        <Text style={styles.title}>SND no pudo abrir</Text>
        <Text style={styles.body}>Copia este texto y lo vemos. No es el NAS: falló al arrancar.</Text>
        <ScrollView style={styles.box} contentContainerStyle={styles.boxInner}>
          <Text selectable style={styles.stack}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </Text>
        </ScrollView>
        <Pressable
          onPress={() => this.setState({ error: null })}
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.btnText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.void,
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 32,
    gap: 12,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  box: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.sheet,
    borderRadius: 10,
  },
  boxInner: { padding: 14 },
  stack: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: colors.danger,
  },
  btn: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
  },
  btnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.accentText,
  },
});
