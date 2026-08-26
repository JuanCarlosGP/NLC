import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { AssetComposerSheet } from "@/components/wealth/account-composer-sheet";
import { AssetRow, assetListStyle } from "@/components/wealth/asset-row";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, type } from "@/lib/theme";
import type { WealthAsset } from "@/lib/wealth/types";
import { useWealth } from "@/lib/wealth/wealth-context";

export default function WealthAssetsScreen() {
  const { positions } = useWealth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WealthAsset | null>(null);

  function openAsset(next?: WealthAsset | null) {
    triggerUiHaptic();
    setEditing(next ?? null);
    setOpen(true);
  }

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <Text style={[type.pageTitle, styles.title]}>Inversiones</Text>
          <Pressable
            accessibilityLabel="Nueva inversión"
            onPress={() => openAsset()}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Plus size={24} color={colors.ink} strokeWidth={1.8} />
          </Pressable>
        </View>
        {positions.length ? (
          <View style={assetListStyle}>
            {positions.map((position) => (
              <AssetRow key={position.asset.id} position={position} onPress={() => openAsset(position.asset)} />
            ))}
          </View>
        ) : (
          <Text style={type.body}>Todavía no hay posiciones. Añade una o registra una compra.</Text>
        )}
      </Screen>
      <AssetComposerSheet
        open={open}
        asset={editing}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  title: { flex: 1 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
