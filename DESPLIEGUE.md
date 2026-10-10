# Despliegue de Kaderno en el droplet

Cada `git push` a `main` compila la versión web en GitHub y la publica en el droplet. Si algo sale mal, el sitio vuelve solo a la versión anterior.

## Cómo funciona

```
git push ──► GitHub Actions ──► npx expo export (web) ──► SSH ──► droplet
                                                                    │
     /var/www/kaderno ──► kaderno-app/current ──► releases/<fecha>-<commit>/
                                                   kaderno-config.js ──► shared/ (tu config real)
```

- Cada versión queda en su propia carpeta y se activa cambiando un enlace, sin ningún instante con la página caída.
- Se guardan las últimas 5 versiones para poder volver atrás.
- `kaderno-config.js` vive aparte (`shared/`): ningún despliegue lo pisa. Se sigue editando igual que siempre con `nano /var/www/kaderno/kaderno-config.js`.
- La llave que usa GitHub entra con un usuario `deploy` que solo puede publicar o volver atrás. No puede abrir una terminal en el servidor ni leer nada más.
- La compilación se hace en GitHub, no en el droplet, así que no importa que el droplet tenga poca memoria.
- Caddy o nginx siguen apuntando a `/var/www/kaderno`: no hay que tocar su configuración.

---

## Configuración inicial (una sola vez)

Necesitas la CLI de GitHub en el Mac: `brew install gh` y luego `gh auth login`.

### 1. Crear el repositorio

En la carpeta del proyecto, en el Mac:

```bash
git init -b main
git add .
git status            # revisa que NO aparezcan .env, node_modules ni dist
git commit -m "Kaderno: estado actual"
gh repo create kaderno --private --source . --push
```

### 2. Crear la llave de despliegue

```bash
ssh-keygen -t ed25519 -f ~/.ssh/kaderno_deploy -N "" -C "github-actions-kaderno"
```

### 3. Preparar el droplet

Cambia `IP` por la IP de tu droplet:

```bash
scp deploy/droplet-setup.sh deploy/kaderno-deploy root@IP:/root/
ssh root@IP "bash /root/droplet-setup.sh '$(cat ~/.ssh/kaderno_deploy.pub)'"
```

El script convierte lo que hoy está publicado en la primera versión guardada (`...-inicial`), copia tu `kaderno-config.js` a `shared/` y deja una copia de seguridad de la carpeta original en `/var/www/kaderno.antes-de-git-<fecha>`.

Comprueba que quedó bien:

```bash
ssh -i ~/.ssh/kaderno_deploy deploy@IP list
```

Debe salir una línea `* ...-inicial (activa)`. Abre el sitio en el navegador: debe verse exactamente igual que antes.

### 4. Guardar los secretos en GitHub

```bash
gh secret set DROPLET_HOST --body "IP"
gh secret set DROPLET_SSH_KEY < ~/.ssh/kaderno_deploy
ssh-keyscan -H IP 2>/dev/null | gh secret set DROPLET_KNOWN_HOSTS
gh variable set SITE_URL --body "https://testssecurelocal.website"
```

Si SSH no está en el puerto 22, agrega también `gh secret set DROPLET_PORT --body "2222"`.

### 5. Primer despliegue

```bash
gh workflow run deploy.yml
gh run watch
```

---

## Uso diario

| Quiero | Comando |
|---|---|
| Publicar | `git add . && git commit -m "qué cambió" && git push` |
| Ver cómo va | `gh run watch` (o GitHub → Actions) |
| Volver a la versión anterior | `gh workflow run rollback.yml` |
| Volver a una versión concreta | `gh workflow run rollback.yml -f version=20261009-230443-abc1234` |
| Ver las versiones guardadas | `ssh -i ~/.ssh/kaderno_deploy deploy@IP list` |

Los cambios que solo tocan archivos `.md` o la carpeta `supabase/` no disparan un despliegue.

### Cuando te llegue un zip nuevo

Descomprímelo encima de la carpeta del repositorio (sin borrar la carpeta `.git`). Luego:

```bash
git status            # qué archivos cambiaron
git diff              # qué cambió exactamente
npm install           # por si hay dependencias nuevas
git add . && git commit -m "Entrega X" && git push
```

Así queda registro de cada entrega y se puede volver a cualquiera.

### Publicar desde el Mac sin pasar por GitHub

Primero autoriza la llave de tu Mac una vez (`~/.ssh/id_ed25519.pub` o la que uses):

```bash
ssh root@IP "bash /root/droplet-setup.sh '$(cat ~/.ssh/id_ed25519.pub)'"
```

Después:

```bash
bash deploy/desplegar-desde-mac.sh            # compila y publica
bash deploy/desplegar-desde-mac.sh rollback   # vuelve atrás
```

---

## Lo que el despliegue NO hace

- **No corre las migraciones de Supabase.** Los `schema_vX.sql` se siguen corriendo a mano en Supabase → SQL Editor, y conviene hacerlo antes de publicar el código que los necesita.
- **No despliega las Edge Functions.** Siguen siendo `npx supabase functions deploy <nombre>`.

## Si algo falla

- **Falla la compilación:** el servidor no se toca. El error aparece en GitHub → Actions.
- **El sitio no responde con la versión nueva:** el workflow vuelve solo a la anterior y marca el despliegue en rojo.
- **`npm ci` dice que `package.json` y `package-lock.json` no coinciden:** corre `npm install` en el Mac, haz commit del `package-lock.json` y vuelve a hacer push.
- **`Permission denied (publickey)`:** revisa que `DROPLET_SSH_KEY` sea la llave privada completa (desde `-----BEGIN` hasta `-----END`) y que la pública esté en `/home/deploy/.ssh/authorized_keys`.
- **`Host key verification failed`:** vuelve a guardar `DROPLET_KNOWN_HOSTS` con el comando `ssh-keyscan` del paso 4.
