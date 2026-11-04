import { useThemeId } from "@/lib/appearance/use-theme-id";
import { WealthLedger } from "@/components/wealth/wealth-ledger";

export default function WealthActivityScreen() {
  useThemeId();
  return <WealthLedger />;
}
