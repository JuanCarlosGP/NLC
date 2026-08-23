# Docs SND

Cerebro del producto. Lo que hace la app, no cómo está implementada.

| Carpeta | Qué es |
| --- | --- |
| [producto/pantallas.md](producto/pantallas.md) | Qué hace cada pantalla |
| [producto/flujos.md](producto/flujos.md) | Recorridos de punta a punta |
| [producto/fuentes.md](producto/fuentes.md) | Mock, Navidrome, Spotify, podcasts, WebDAV |
| [qa/README.md](qa/README.md) | Cobertura, hallazgos, cómo trabaja el equipo |

## Quién escribe qué

- **QA Manual 1** redacta pantallas y flujos en la primera pasada (lo que ve en el teléfono).
- **QA Manual 2** revisa esa doc con criterio propio. Si el texto no cuadra con la app, lo corrige. Si el comportamiento no tiene sentido, abre hallazgo, no “documenta el bug”.
- **DEV 1** no rellena esto. Si un arreglo cambia una pantalla, lo dice en el canal y QA actualiza.
- **SND PM** mantiene el índice y cierra contradicciones.

Hoy la fuente de verdad es lo que corre en Expo Go en el Nothing Phone. Si README del repo y esta carpeta discrepan, gana lo que hace la app y se abre hallazgo.