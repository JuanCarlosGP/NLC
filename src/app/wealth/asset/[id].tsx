import { useLocalSearchParams, useRouter } from "expo-router";
import { AssetComposerSheet } from "@/components/wealth/account-composer-sheet";
import { libraryParamId } from "@/lib/library/href";
import { useWealth } from "@/lib/wealth/wealth-context";

export default function WealthAssetScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{ id: string | string[] }>().id;
  const id = libraryParamId(raw);
  const { assets } = useWealth();
  const asset = assets.find((item) => item.id === id) ?? null;

  return (
    <AssetComposerSheet
      open
      asset={asset}
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    />
  );
}
