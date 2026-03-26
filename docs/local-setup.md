# HyperDesk - Instalacion local

## Requisitos

- Docker y Docker Compose
- Node.js 22+
- npm 11+

## Arranque rapido con Docker Compose

1. Copiar variables:

```bash
cp .env.example .env
```

2. Levantar servicios:

```bash
npm run docker:up
```

Si quieres modo `mock` con el contenedor VNC demo:

```bash
docker compose --profile mock up -d --build
```

3. Verificar salud:

```bash
docker compose ps
```

4. Seed de admin (si aplica despues de migrar):

```bash
docker compose exec api npm run prisma:seed
```

## Modo real KVM/libvirt

1. En `.env`:

```env
HYPERVISOR_PROVIDER=libvirt
LIBVIRT_DEFAULT_URI=qemu:///system
LIBVIRT_STORAGE_POOL=default
LIBVIRT_DEFAULT_NETWORK=default
REMOTE_CONSOLE_RDP_TUNNEL_MODE=libvirt_ssh
REMOTE_CONSOLE_RDP_TUNNEL_PUBLIC_HOST=127.0.0.1
```

2. Si usas host remoto, usa URI tipo:

```env
LIBVIRT_DEFAULT_URI=qemu+ssh://usuario@ip-o-host/system
```

3. Reinicia:

```powershell
.\stop-hyperdesk.ps1
.\start-hyperdesk.ps1
```

4. Comprueba desde API:

```bash
docker exec hyperdesk-api virsh -c "$LIBVIRT_DEFAULT_URI" list --all
```

5. En la UI, entra en `Hypervisors` y ejecuta `Probe` sobre el host.
   Esto sincroniza CPU/RAM, pools y redes reales de libvirt en la base de datos.
6. Con `REMOTE_CONSOLE_RDP_TUNNEL_MODE=libvirt_ssh`, el boton RDP genera un `.rdp`
   contra `127.0.0.1` y no requiere rutas manuales a `192.168.122.0/24`.

## Acceso desde otro PC (LAN)

1. Configura en `.env`:

```env
CORS_ORIGIN=http://IP_DE_TU_PC:3000
API_PUBLIC_URL=http://IP_DE_TU_PC:4000
WEB_PUBLIC_URL=http://IP_DE_TU_PC:3000
NEXT_PUBLIC_API_URL=http://IP_DE_TU_PC:4000/api/v1
NEXT_PUBLIC_NOVNC_URL=http://IP_DE_TU_PC:6081
REMOTE_CONSOLE_RDP_TUNNEL_PUBLIC_HOST=IP_DE_TU_PC
```

2. Reinicia stack (`.\stop-hyperdesk.ps1` + `.\start-hyperdesk.ps1`).
3. Abre en firewall/router estos puertos TCP del PC servidor:
   - `3000` (web)
   - `4000` (api)
   - `6081` (noVNC mock, opcional)
   - `13389-13489` (tunel RDP automatico)

### Linux host con libvirt local (socket)

Usa el override incluido:

```bash
docker compose -f docker-compose.yml -f docker-compose.libvirt-local.yml up -d --build
```

Este modo monta:

- `/var/run/libvirt` (socket local)
- `/var/lib/libvirt/images/isos` (ISOs visibles para libvirt)

## Arranque en modo desarrollo sin contenedores

1. Instalar dependencias:

```bash
npm install
```

2. Levantar PostgreSQL (puede ser con Docker):

```bash
docker compose up -d db
```

3. Configurar `apps/api/.env` y `apps/web/.env`.

4. Ejecutar migraciones y seed:

```bash
npm --prefix apps/api run prisma:migrate
npm --prefix apps/api run prisma:seed
```

5. Iniciar API:

```bash
npm run dev:api
```

6. En otra terminal iniciar frontend:

```bash
npm run dev:web
```

## Accesos por defecto

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`
