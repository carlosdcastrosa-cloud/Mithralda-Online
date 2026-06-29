# PixelLab MCP — configuración

[PixelLab](https://www.pixellab.ai/) es un servidor MCP para generación de
sprites en pixel art (personajes, ítems, tilesets, animaciones). Encaja con el
arte del juego, así que lo dejamos disponible como MCP de proyecto.

## Cómo está conectado

La conexión vive en [`.mcp.json`](../.mcp.json) en la raíz del repo. Claude Code
lee ese archivo automáticamente y ofrece habilitar el servidor `pixellab` la
primera vez (hay que aprobarlo una vez por seguridad).

```json
{
  "mcpServers": {
    "pixellab": {
      "type": "http",
      "url": "https://api.pixellab.ai/mcp",
      "headers": {
        "Authorization": "Bearer ${PIXELLAB_API_KEY}"
      }
    }
  }
}
```

> **El token NO está en el repo.** Este repositorio es **público**, así que el
> token se referencia por la variable de entorno `PIXELLAB_API_KEY` en lugar de
> escribirlo en `.mcp.json`. Claude Code expande `${PIXELLAB_API_KEY}` desde el
> entorno al cargar el archivo.

## Cómo poner tu token

Consíguelo en el panel de PixelLab y exponlo como `PIXELLAB_API_KEY`.

### Claude Code local (terminal / IDE)

```bash
export PIXELLAB_API_KEY="tu-token-aqui"
# agrégalo a ~/.bashrc, ~/.zshrc o tu .env de shell para que persista
```

Reinicia Claude Code para que tome la variable y aprueba el servidor `pixellab`
cuando lo pregunte. Verifica con `/mcp` (debe aparecer `pixellab` conectado).

### Claude Code on the web

Define `PIXELLAB_API_KEY` en las variables de entorno del *environment* del
proyecto (Settings → Environment) y vuelve a iniciar la sesión.

### Alternativa: scope local (no se commitea)

Si prefieres no usar variable de entorno, puedes registrarlo solo en tu máquina
(no toca el repo) con:

```bash
claude mcp add pixellab https://api.pixellab.ai/mcp -t http \
  -H "Authorization: Bearer TU_TOKEN"
```

Eso lo guarda en tu config local de Claude Code, no en `.mcp.json`. Útil si no
quieres depender de la variable de entorno, pero entonces cada colaborador debe
registrarlo por su cuenta.

## Seguridad

- Nunca pegues el token en `.mcp.json`, README ni ningún archivo versionado: el
  repo es público y quedaría expuesto (y cualquiera podría gastar tus créditos).
- Si un token se filtró alguna vez (chat, captura, commit), **regenéralo** en el
  panel de PixelLab y actualiza `PIXELLAB_API_KEY`.
