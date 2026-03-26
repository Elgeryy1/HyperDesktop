# HyperDesk - Arquitectura General (Fase 1)

## 1) Resumen ejecutivo

HyperDesk se disena como un `modular monolith` con limites de dominio claros y una capa de adaptadores para virtualizacion. Esta decision permite salir rapido con un MVP serio, evitando sobreingenieria, y deja una ruta directa a escalar por servicios cuando exista presion real de carga o equipos.

## 2) Objetivos de arquitectura

- Separacion estricta entre dominio de negocio y capa de hypervisor.
- Seguridad base desde inicio: JWT, RBAC, hashing y auditoria.
- Consistencia tecnica end-to-end con TypeScript.
- Soporte multi-host y multiusuario desde modelo de datos.
- Arranque local reproducible con Docker Compose.

## 3) Estilo arquitectonico

- `Presentation layer`: Next.js (UI, tablas, formularios, estados de carga/error).
- `Application layer`: Express + TypeScript (casos de uso, orquestacion, validacion DTO con Zod).
- `Domain layer`: entidades, reglas y contratos estables.
- `Infrastructure layer`: Prisma/PostgreSQL, providers de virtualizacion, logging.

Patrones principales:

- Modular monolith por dominios.
- Hexagonal para hypervisores (`ports and adapters`).
- Repository pattern para acceso a datos.
- Guards y decorators para auth/RBAC.

## 4) Modulos requeridos y responsabilidad

1. `auth`: login, refresh, logout, guards JWT.
2. `users`: CRUD de usuarios y estado de cuenta.
3. `roles`: roles y permisos.
4. `groups`: agrupacion de usuarios y ambito de recursos.
5. `virtual-machines`: ciclo de vida de VM.
6. `storage`: pools y volumenes.
7. `templates`: plantillas de VM.
8. `isos`: registro/subida de ISOs.
9. `networks`: redes virtuales y asignaciones.
10. `hypervisors`: inventario de hosts y capacidad.
11. `remote-console`: tickets/sesiones para noVNC.
12. `audit-logs`: trazabilidad de acciones criticas.
13. `dashboard`: metricas agregadas del panel.
14. `settings`: configuracion global y seguridad.

## 5) Estructura de carpetas propuesta (monorepo)

```txt
hyperdesk/
  apps/
    api/
      src/
        modules/
          auth/
          users/
          roles/
          groups/
          virtual-machines/
          storage/
          templates/
          isos/
          networks/
          hypervisors/
          remote-console/
          audit-logs/
          dashboard/
          settings/
        common/
          config/
          guards/
          decorators/
          filters/
          interceptors/
          logger/
        infrastructure/
          prisma/
          virtualization/
    web/
      src/
        app/
          (public)/
          (console)/
        modules/
          auth/
          users/
          virtual-machines/
          hypervisors/
          dashboard/
        components/
        lib/
  packages/
    shared-types/
    shared-schemas/
    ui-kit/
  docs/
    architecture.md
    data-model.md
    api.md
    flows.md
  docker-compose.yml
```

## 6) Stack y justificacion

- `Next.js + TS + Tailwind`: productividad alta, UI moderna, buen ecosistema.
- `Express + TS`: control fino, modularidad simple y desarrollo rapido para MVP.
- `PostgreSQL + Prisma`: modelo relacional robusto para RBAC y activos de VM.
- `Redis`: cache, locks cortos y colas basicas.
- `Docker Compose`: onboarding local consistente.
- `Provider abstraction`: permite mock en desarrollo y libvirt real sin acoplar.

## 7) Seguridad transversal

- Password hashing con `argon2` o `bcrypt`.
- JWT de corta vida + refresh token rotatorio.
- RBAC en backend por permisos.
- Validacion de entrada con DTO + class-validator/zod.
- Sanitizacion basica en payloads de texto.
- Auditoria de login y operaciones de VM.
- Secretos solo por variables de entorno.

## 8) Escalabilidad y mantenibilidad

- Contratos API versionados (`/api/v1`).
- Eventos de dominio para auditoria y metricas.
- `HypervisorProvider` como contrato unico para cambiar backend.
- Preparado para separar workers de tareas largas.
- Preparado para multi-host por entidad `HypervisorHost`.
