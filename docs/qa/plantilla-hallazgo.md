# Plantilla de hallazgo

Copiar en el canal NLC. Un hallazgo por mensaje.

```
SND-XXX · P0/P1/P2/P3 · Fxx Nombre del flujo
Estado: abierto

Repro:
1.
2.
3.

Esperado:
Actual:

Entorno: Expo Go | APK · mock | Navidrome · build/commit si se sabe
Notas:
```

Tras publicarlo:

1. Añadir fila en `hallazgos.md`.
2. En `cobertura.md`, esa fila de flujo a `fallo` y el id en Notas.
3. No asignar a DEV. Eso lo hace NLC PM.