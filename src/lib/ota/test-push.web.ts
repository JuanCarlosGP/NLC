export type TestPushResult = {
  ok: boolean;
  message: string;
};

export async function sendTestPush(): Promise<TestPushResult> {
  return { ok: false, message: "El push solo se prueba en la APK del teléfono" };
}
