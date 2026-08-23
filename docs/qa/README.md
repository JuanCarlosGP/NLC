# QA SND

Mapa de trabajo del equipo. No es un backlog de historias: SND ya existe. Aquí medimos cobertura, reportamos fallos y asignamos arreglos.

| Archivo | Para qué sirve |
| --- | --- |
| [cobertura.md](cobertura.md) | Qué flujos se han probado (QA1 y QA2) |
| [hallazgos.md](hallazgos.md) | Fallos abiertos / en curso / cerrados |
| [plantilla-hallazgo.md](plantilla-hallazgo.md) | Cómo se pega un hallazgo en el canal SND |

## Equipo

- **SND PM**: prioriza, asigna a DEV, mantiene estos archivos.
- **QA Manual 1** y **QA Manual 2**: prueban toda la app. Cada fix lo revisan los dos, por separado. No tocan código.
- **DEV 1**: implementa solo lo que asigna el PM. Cuando termina, lo dice en el canal SND.

## Flujo

1. QA prueba en el Nothing Phone (Expo Go hoy; APK `app.snd.player` cuando exista).
2. Marca la fila en `cobertura.md`: `-` / `ok` / `fallo`.
3. Si hay fallo, lo publica en el canal SND con la plantilla y añade una fila en `hallazgos.md` (id `SND-xxx`).
4. PM prioriza y asigna a DEV 1 en el canal.
5. DEV termina y lo comenta en el canal. No cierra el hallazgo.
6. QA1 y QA2 se asignan la revisión. Si ambos dan ok, PM cierra en `hallazgos.md` y la cobertura vuelve a `ok`.

## Entorno de prueba

- Repo: `E:\dev\SND`
- Dispositivo: Nothing Phone A063, Android 15, misma LAN que el NAS. ADB por Wi-Fi.
- Hoy corre en **Expo Go** (SDK 54), no el APK nativo. Lock screen, audio en background y HTTP claro a Navidrome hay que confirmarlos luego contra el APK EAS `preview`.
- Metro: comprobar `http://localhost:8081/status`. No abrir `http://localhost:8081/` en el navegador (dispara el bundle web y satura Metro).
- NAS por defecto: `192.168.1.106:4533` (Navidrome / OpenSubsonic). Sin NAS, la app usa biblioteca de ejemplo.

## Severidad

- **P0** bloquea reproducir o entrar a la app
- **P1** flujo principal roto (biblioteca, cola, ajustes NAS, import)
- **P2** molesta pero hay salida
- **P3** cosmética / copy

## Reglas

- Nadie se autoasigna trabajo de DEV.
- Un hallazgo = un flujo reproducible. No mezclar tres bugs en el mismo mensaje.
- La doble revisión es independiente: QA2 no copia el veredicto de QA1.