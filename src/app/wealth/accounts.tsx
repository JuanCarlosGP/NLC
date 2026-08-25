import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { Screen } from "@/components/ui/screen";
import { AccountComposerSheet } from "@/components/wealth/account-composer-sheet";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";
import { formatEuro } from "@/lib/wealth/money";
import { ACCOUNT_KIND_LABEL } from "@/lib/wealth/types";
import { useLiveAccounts, useWealth } from "@/lib/wealth/wealth-context";

export default function WealthAccountsScreen() {
  const { balanceOf } = useWealth();
  const accounts = useLiveAccounts();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <Text style={[type.pageTitle, styles.title]}>Cuentas</Text>
          <Pressable
            accessibilityLabel="Nueva cuenta"
            onPress={() => {
              triggerUiHaptic();
              setOpen(true);
            }}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Plus size={24} color={colors.ink} strokeWidth={1.8} />
          </Pressable>
        </View>
        {accounts.map((account) => (
          <View key={account.id} style={styles.row}>
            <View>
              <Text style={styles.name}>{account.name}</Text>
              <Text style={type.meta}>{ACCOUNT_KIND_LABEL[account.kind]}</Text>
            </View>
            <Text style={styles.value}>{formatEuro(balanceOf(account.id))}</Text>
          </View>
        ))}
      </Screen>
      <AccountComposerSheet open={open} onOpenChange={setOpen} />
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  name: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  value: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
});
