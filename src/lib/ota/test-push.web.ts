import { t } from "@/lib/i18n/runtime";

export type TestPushResult = {
  ok: boolean;
  message: string;
};

export async function sendTestPush(): Promise<TestPushResult> {
  return { ok: false, message: t("push.apkOnly") };
}
