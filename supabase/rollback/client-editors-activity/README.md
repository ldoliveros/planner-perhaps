# Permiso Lector/Editor + "Comentarios y actividad" — despliegue y reversión

Migraciones (en este orden, ambas aditivas):

1. `20261126000002_client_publication_editors.sql` — tabla `client_publication_editors`, función
   `is_client_publication_editor`, trigger `publications_client_editor_guard` y políticas aditivas del editor en
   `publications`, `publication_destinations`, `publication_assets` y `storage.objects` (bucket `thumbnails`).
2. `20261126000003_publication_activity.sql` — tabla `publication_activity` (en `supabase_realtime`), función interna
   `record_publication_activity` y triggers de actividad en `publications`, `publication_destinations` y
   `publication_assets`.

No reemplazan ni modifican ninguna función, política o tabla existente: no hay definiciones previas que guardar. Como
línea de base de verificación, antes de aplicarlas en producción se guarda (fuera del repo) el listado de políticas y
triggers de esas tablas; después del despliegue, las políticas y triggers previos tienen que seguir iguales y solo
aparecer los nuevos.

Orden de despliegue: migraciones (compatibles con la app anterior: sin editores nadie gana permisos y la actividad solo
se registra) → app. La app nueva sin las migraciones muestra todos como Lector y la cronología solo con comentarios.

Reversión: `rollback.sql` (bloque PA, después CE). Si solo hay que volver atrás la app, alcanza con publicar el deploy
anterior en Netlify: las migraciones pueden quedar (sin la app nueva nadie edita como cliente).

Pruebas reproducibles (QA, revertidas):
`node supabase/qa/v1.6/qa-db.mjs security-checks --suite client-editors --confirm wxkbkdoaohywqabmyqjk`
