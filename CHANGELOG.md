# Changelog

Todos los cambios relevantes de este proyecto se documentan aqui.

## [0.1.0] - 2026-03-26

### Added

- Publicacion inicial de HyperDesk como monorepo (`apps/api`, `apps/web`, `packages/shared-types`).
- Backend API en Express + TypeScript con base URL `/api/v1`.
- Frontend en Next.js + TypeScript + Tailwind con panel administrativo.
- Autenticacion con `JWT access token` + `refresh token` rotatorio.
- RBAC base con roles `ADMIN`, `OPERATOR` y `VIEWER`.
- CRUD de usuarios y administracion de roles.
- Gestion de grupos y membresias.
- Gestion de VMs: listar, crear, editar, eliminar, iniciar, detener y reiniciar.
- Scheduler base de acciones programadas de VM.
- Gestion de hypervisors con accion de `probe` para sincronizar capacidad real.
- Gestion de storage pools/volumenes, redes virtuales, ISOs y templates.
- Consola remota VNC web con noVNC (modo mock listo para entorno local).
- Consola remota RDP por archivo `.rdp` con soporte de tunel automatico en modo `libvirt`.
- Dashboard con metricas agregadas de recursos.
- Auditoria de acciones criticas.

### Infrastructure

- Base de datos PostgreSQL con Prisma y migraciones iniciales.
- Docker Compose para entorno local reproducible.
- Script PowerShell `start-hyperdesk.ps1` para bootstrap completo (env, compose, migrate, seed).
- Script PowerShell `stop-hyperdesk.ps1` para apagado simple del stack.
- Provider `mock` para desarrollo/demo.
- Provider `libvirt` para operaciones reales via `virsh`.

### Documentation

- README principal.
- Documentacion tecnica en `docs/architecture.md`.
- Modelo de datos en `docs/data-model.md`.
- API en `docs/api.md`.
- Flujos funcionales en `docs/flows.md`.
- Instalacion local en `docs/local-setup.md`.
- Variables de entorno en `docs/env-vars.md`.
- Guia libvirt/QEMU en `docs/libvirt-qemu.md`.
- Roadmap de produccion en `docs/production-roadmap.md`.

### Security

- Password hashing y validaciones de payload.
- Controles de autorizacion por rol en endpoints.
- Registro de auditoria para trazabilidad de operaciones sensibles.
- `/.env` excluido de Git y ejemplos en `.env.example`.

### Known limitations (v0.1.0)

- No incluye alta disponibilidad ni clustering de control-plane.
- No incluye quotas avanzadas multi-tenant.
- No incluye hardening de produccion (TLS extremo a extremo, secretos gestionados, observabilidad completa).
