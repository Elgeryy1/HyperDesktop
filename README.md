# HyperDesk

HyperDesk es una plataforma web de virtualizacion para gestionar maquinas virtuales en un panel estilo cloud lab.

Estado actual:

- Fase 1 completada (arquitectura, modelo de datos y contratos).
- Fase 2/3 base completada (monorepo, backend funcional core, frontend base y Docker Compose).

## MVP actual

- Login con JWT y refresh token.
- RBAC basico (`ADMIN`, `OPERATOR`, `VIEWER`).
- CRUD de usuarios.
- Listado y administracion de roles.
- Gestion de VMs: listar, crear, detalle, start/stop/reboot/delete.
- Gestion de hypervisors: listar, crear, editar, borrar.
- Subida de ISO desde PC (upload directo a servidor).
- Dashboard de metricas base.
- Auditoria de acciones criticas.
- Capa de provider de virtualizacion con `mock` y `libvirt` real (via `virsh`).
- Consola remota:
  - `VNC` web funcional via noVNC (modo mock listo para usar en local).
  - `RDP` via archivo `.rdp` descargable para cliente nativo.
  - En modo `libvirt`, tunel RDP automatico (`localhost`) para uso sin rutas manuales.

## Stack

- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: Express + TypeScript
- DB: PostgreSQL + Prisma ORM
- Auth: JWT + bcrypt + sesiones de refresh token
- Infra local: Docker Compose

## Estructura principal

```txt
apps/
  api/
  web/
contracts/
docs/
docker-compose.yml
```

## Arranque rapido

1. Copiar variables:

```bash
cp .env.example .env
```

2. Levantar stack:

```bash
docker compose up -d --build
```

Atajo recomendado (levanta todo + migrate + seed):

```powershell
.\start-hyperdesk.ps1
```

Parar stack:

```powershell
.\stop-hyperdesk.ps1
```

3. Endpoints base:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`
- noVNC (mock): `http://localhost:6081`

Modo real KVM/libvirt:

1. Editar `.env` y poner `HYPERVISOR_PROVIDER=libvirt`.
2. Configurar `LIBVIRT_*` (URI/pool/network).
3. Reiniciar stack con `.\start-hyperdesk.ps1`.

Opciones recomendadas:

- Libvirt remoto (funciona en Windows/macOS/Linux con Docker):
  - `LIBVIRT_DEFAULT_URI=qemu+ssh://usuario@host/system`
- Libvirt local (host Linux con libvirt):
  - `docker compose -f docker-compose.yml -f docker-compose.libvirt-local.yml up -d --build`

Acceso desde otro PC (LAN):

1. En `.env`, cambia URLs `localhost` por `http://IP_DE_TU_PC`:
   - `CORS_ORIGIN`, `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_NOVNC_URL`
   - `REMOTE_CONSOLE_RDP_TUNNEL_PUBLIC_HOST=IP_DE_TU_PC`
2. Abre puertos TCP en el firewall/router del PC servidor:
   - `3000`, `4000`, `6081` (opcional), `13389-13489`

## Documentacion

- [Arquitectura](./docs/architecture.md)
- [Modelo de datos](./docs/data-model.md)
- [API](./docs/api.md)
- [Flujos](./docs/flows.md)
- [Instalacion local](./docs/local-setup.md)
- [Variables de entorno](./docs/env-vars.md)
- [Libvirt/QEMU](./docs/libvirt-qemu.md)
- [Roadmap produccion](./docs/production-roadmap.md)

## Credenciales iniciales (seed)

- Email: `admin@hyperdesk.local`
- Password: `ChangeMe123!`
- Hypervisor demo: `lab-host-01` (MOCK, ONLINE)
- Network demo: `lab-nat` (modo MOCK) / `default` (modo LIBVIRT por defecto)
- Storage demo: `default-pool` (modo MOCK) / `default` (modo LIBVIRT por defecto)

Cambiar estas credenciales en cuanto arranque el entorno.
