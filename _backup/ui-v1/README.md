# Backup — interfaz v1 (galaxia / HUD)

Copia íntegra de la interfaz anterior de 2Brain, guardada antes del rediseño.

- `app/` — rutas, layout y estilos globales de la v1
- `components/` — todos los componentes de la v1 (GalaxyGraph, Heatmap, HUD, Navbar, etc.)
- `lib/` — capa de datos tal y como estaba en la v1

Esta carpeta está excluida de la compilación (`tsconfig.json → exclude`), así que no afecta al build.

## Restaurar la v1

```bash
rm -rf app components lib
cp -r _backup/ui-v1/app _backup/ui-v1/components _backup/ui-v1/lib .
git checkout HEAD -- app/favicon.ico
```
