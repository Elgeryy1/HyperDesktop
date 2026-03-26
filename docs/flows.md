# HyperDesk - Flujos clave (Fase 1)

## 1) Flujo de autenticacion

1. Usuario envia `email/password` a `POST /auth/login`.
2. Backend valida credenciales y estado de cuenta.
3. Si es valido:
   - genera `accessToken` (corto)
   - genera `refreshToken` (rotatorio)
   - guarda hash de refresh en `Session`
4. API retorna access token y cookie httpOnly para refresh token.
5. En cada request protegida:
   - `JwtAuthGuard` valida token
   - `RolesGuard` valida permisos
6. Si access token expira:
   - frontend llama `POST /auth/refresh`
   - backend rota refresh token y devuelve nuevo access token
7. Logout:
   - `POST /auth/logout`
   - backend revoca sesion actual

## 2) Flujo de creacion de VM

1. Operador crea VM desde formulario web.
2. API valida DTO:
   - nombre
   - CPU/RAM/disco
   - red
   - ISO o template
3. Servicio verifica permisos y cuotas.
4. Servicio selecciona host (`HypervisorHost`) disponible.
5. Se crea registro de VM en DB con estado `PROVISIONING`.
6. `VirtualMachinesService` llama a `HypervisorProvider.createVm(...)`.
7. Provider devuelve `externalId` y estado inicial.
8. Se actualiza VM a `STOPPED` o `RUNNING` segun estrategia.
9. Se guarda evento en `AuditLog` (`vm.create`).

## 3) Flujo de ciclo de vida de VM

Acciones:

- Start: `STOPPED -> STARTING -> RUNNING`
- Stop: `RUNNING -> STOPPING -> STOPPED`
- Reboot: `RUNNING -> REBOOTING -> RUNNING`
- Delete: `* -> DELETING -> DELETED`

Reglas:

- No ejecutar acciones concurrentes sobre la misma VM.
- Validar estado actual antes de transicionar.
- Auditar cada accion critica (`start`, `stop`, `reboot`, `delete`).

## 4) Flujo de consola remota (base)

1. Usuario pulsa `Abrir consola` en una VM.
2. Frontend solicita `POST /remote-console/sessions`.
3. Backend valida permisos y estado de la VM.
4. Backend solicita ticket efimero al provider de consola.
5. Backend retorna `wsUrl + token + expiresAt`.
6. Frontend abre cliente noVNC con token.

