# HyperDesk - API principal

Base URL: `/api/v1`

Autenticacion: `Authorization: Bearer <access_token>`

Roles:

- `ADMIN`
- `OPERATOR`
- `VIEWER`

## Endpoints implementados en esta iteracion

### Auth

- `POST /auth/login` (publico)
- `POST /auth/refresh` (publico con refresh token)
- `POST /auth/logout` (publico con refresh token)
- `GET /auth/me` (`ADMIN|OPERATOR|VIEWER`)

### Users

- `GET /users` (`ADMIN`)
- `POST /users` (`ADMIN`)
- `GET /users/:id` (`ADMIN`)
- `PATCH /users/:id` (`ADMIN`)
- `DELETE /users/:id` (`ADMIN`)

### Roles

- `GET /roles` (`ADMIN`)
- `PATCH /roles/:name` (`ADMIN`)

### Virtual Machines

- `GET /virtual-machines` (`ADMIN|OPERATOR|VIEWER`)
- `POST /virtual-machines` (`ADMIN|OPERATOR`)
- `GET /virtual-machines/:id` (`ADMIN|OPERATOR|VIEWER`)
- `PATCH /virtual-machines/:id` (`ADMIN|OPERATOR`)
- `DELETE /virtual-machines/:id` (`ADMIN`)
- `POST /virtual-machines/:id/actions/start` (`ADMIN|OPERATOR`)
- `POST /virtual-machines/:id/actions/stop` (`ADMIN|OPERATOR`)
- `POST /virtual-machines/:id/actions/reboot` (`ADMIN|OPERATOR`)

### Hypervisors

- `GET /hypervisors` (`ADMIN|OPERATOR|VIEWER`)
- `POST /hypervisors` (`ADMIN`)
- `GET /hypervisors/:id` (`ADMIN|OPERATOR|VIEWER`)
- `PATCH /hypervisors/:id` (`ADMIN`)
- `POST /hypervisors/:id/actions/probe` (`ADMIN|OPERATOR`)
- `DELETE /hypervisors/:id` (`ADMIN`)

### Groups

- `GET /groups` (`ADMIN`)
- `POST /groups` (`ADMIN`)
- `PATCH /groups/:id` (`ADMIN`)
- `POST /groups/:id/members` (`ADMIN`)
- `DELETE /groups/:id/members/:userId` (`ADMIN`)

### Storage

- `GET /storage` (`ADMIN|OPERATOR|VIEWER`)
- `POST /storage/pools` (`ADMIN`)
- `POST /storage/volumes` (`ADMIN|OPERATOR`)

### ISOs

- `GET /isos` (`ADMIN|OPERATOR|VIEWER`)
- `POST /isos/upload` (`ADMIN|OPERATOR`) multipart (`iso` file)
- `POST /isos` (`ADMIN|OPERATOR`)
- `DELETE /isos/:id` (`ADMIN`)

### Templates

- `GET /templates` (`ADMIN|OPERATOR|VIEWER`)
- `POST /templates` (`ADMIN|OPERATOR`)
- `DELETE /templates/:id` (`ADMIN`)

### Networks

- `GET /networks` (`ADMIN|OPERATOR|VIEWER`)
- `POST /networks` (`ADMIN`)
- `PATCH /networks/:id` (`ADMIN`)

### Remote console

- `POST /remote-console/sessions` (`ADMIN|OPERATOR|VIEWER`)
  - body: `{ "vmId": "<uuid>", "protocol": "VNC" | "RDP" }`
  - `VNC`: devuelve `launchUrl` a pantalla noVNC + `vncWsUrl`
  - `RDP`: devuelve `launchUrl` para descargar archivo `.rdp`
- `GET /remote-console/sessions/:id` (`ADMIN|OPERATOR|VIEWER`)
- `GET /remote-console/sessions/:id/rdp-file?token=...` (token temporal)
- `DELETE /remote-console/sessions/:id` (`ADMIN|OPERATOR`)

### Dashboard

- `GET /dashboard/summary` (`ADMIN|OPERATOR|VIEWER`)
- `GET /dashboard/resources` (`ADMIN|OPERATOR|VIEWER`)

### Audit logs

- `GET /audit-logs` (`ADMIN`)
- `GET /audit-logs/:id` (`ADMIN`)

### Settings

- `GET /settings` (`ADMIN`)
- `PATCH /settings` (`ADMIN`)

## Errores base

Formato:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Invalid payload",
  "details": []
}
```

Codigos:

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `HYPERVISOR_UNAVAILABLE`
- `VM_INVALID_STATE`
- `INTERNAL_ERROR`
