# HyperDesk - Roadmap de produccion

## Fase A - Hardening

- Rate limit en auth y endpoints sensibles.
- Gestion de secretos con vault/secret manager.
- Endurecimiento de imagenes Docker.
- Politica de backup y restore de PostgreSQL.

## Fase B - Escalabilidad

- Separar worker para tareas largas de VM.
- Cache/locks con Redis.
- Cola de operaciones para ciclo de vida de VM.
- Observabilidad completa (metrics, traces, logs centralizados).

## Fase C - Virtualizacion real

- Implementacion completa de `LibvirtHypervisorProvider`.
- Provisionado real de discos, ISOs y redes.
- Descubrimiento de estado real de hosts.
- Consola remota con noVNC tokenizada.

## Fase D - Operacion enterprise

- Multi-tenant real por grupos/organizaciones.
- Politicas de cuota por tenant.
- Auditoria exportable y retencion configurable.
- HA, despliegue azul/verde, runbooks y SLO.

