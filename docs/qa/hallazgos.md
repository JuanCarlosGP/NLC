# Hallazgos SND

Índice. El reporte completo se publica en el canal SND con la [plantilla](plantilla-hallazgo.md).

Estados: `abierto` · `asignado` · `en revisión` · `cerrado` · `wontfix`

| ID | Flujo | Severidad | Estado | QA origen | DEV | Resumen |
| --- | --- | --- | --- | --- | --- | --- |
| SND-001 | F02 | P1 | cerrado | QA1 | DEV 1 | Biblioteca > Álbumes vacío. Chip cortado. Listan (11). |
| SND-002 | F05 | P1 | cerrado | QA1 | DEV 1 | Artistas es discografía. Confirmado QA1+QA2. |
| SND-003 | F09 | P1 | cerrado | QA1 | DEV 1 | Al cerrar now playing desaparece el dock. |
| SND-004 | F09 | P2 | cerrado | QA1 | DEV 1 | Mini player y filas se pisan; tapan el dock. |
| SND-005 | F10 | P2 | cerrado | QA1 | DEV 1 | Probar 16/2 vs UI 15. Ahora 15 canciones / 11 álbumes. |
| SND-006 | F12 | P3 | cerrado | QA1 | DEV 1 | Placeholder import Spotify. Confirmado QA1+QA2. |
| SND-007 | F02 | P1 | cerrado | QA2 | DEV 1 | Canciones incluye un episodio de podcast como pista 16. |
| SND-008 | F09 | P1 | cerrado | QA2 | DEV 1 | Scroll en Canciones se come dock y mini; Back tira a Home. |
| SND-009 | F04 | P1 | cerrado | QA1 | DEV 1 | Tap en tile de Álbumes abre Página no encontrada. |
| SND-010 | F15 | P2 | en revisión | Juan Carlos | DEV 1 | Hide en Ajustes. No cerrado: el overflow era padding falso. |
| SND-011 | F15 | P2 | en revisión | QA1 | DEV 1 | Ajustes: hueco negro (minHeight +160). Hide comprado con padding. |

Siguiente id libre: **SND-012**.

Lote: SND-010 + SND-011. Quitar el minHeight. Hide solo si el contenido real desborda. Biblioteca dock fijo.