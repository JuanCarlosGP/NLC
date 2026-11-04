# Mercury autónomo en Android

Verificación local: 4 de noviembre de 2026. Emulador Android 14 aislado en Linux,
411 dp de ancho. No se ha controlado el teléfono físico ni probado iOS.

## Cobertura

- Mercury nativo ofrece Configurar Mercury sin depender del estado del servicio
  Linux. El token se introduce en un campo protegido y se guarda en SecureStore.
- En modo avión y con Wi-Fi desactivado se generó y guardó el ejemplo: tres cuentas,
  crédito negativo, 21 movimientos y rendimientos. No necesita servidor ni claves.
- Un token sintético se guardó desde la interfaz con el móvil sin Internet. La
  pantalla mostró Token guardado y un error de acceso a Mercury, conservando el
  ejemplo. No se enviaron credenciales reales ni se consultaron cuentas reales.
- Primer paso del onboarding: orden idioma → NLC clásico / Geist Pixel → Empezar.
  Classic → Pixel actualiza fondo, fuente y controles sin salir del paso 1.
- TypeScript, exportación Android de producción y `git diff --check` correctos.
- 140 casos aprobados: 119 existentes y 21 de Mercury móvil, incluido el hook React
  con SecureStore y fetch nativo simulados.

## Casos de regresión de Mercury móvil

Peticiones GET HTTPS con token solo en Authorization, paginación completa de
cuentas y Treasury (incluido cursor cero), deduplicación, saldos firmados USD,
identidad estable de organización, redacción de números completos y EIN,
límites de lectura, JSON inválido, 401/403, 429 con Retry-After y errores parciales.

También: sincronización única aunque coincidan inicio automático y manual,
espera tras fallos, rechazo de respuestas antiguas al cambiar credenciales,
cancelación al ir a segundo plano o desconectar, confirmación de organización,
recuperación de fallos de SecureStore/SQLite, persistencia independiente de
credenciales y copias y separación real/ejemplo.

La sincronización automática solo se ejecuta con la app en primer plano. No se
ha validado una cuenta Mercury real: el propietario debe crear y configurar un
token Read Only. La documentación de los endpoints se contrastó con las fuentes
oficiales enlazadas en `docs/integrations.md`.
