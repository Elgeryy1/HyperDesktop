# HyperDesk - Variables de entorno

## Root (`.env`)

- `POSTGRES_DB`: nombre de base de datos.
- `POSTGRES_USER`: usuario de PostgreSQL.
- `POSTGRES_PASSWORD`: password de PostgreSQL.
- `DATABASE_URL`: cadena de conexion para API.
- `API_PORT`: puerto host para API.
- `WEB_PORT`: puerto host para frontend.
- `API_NODE_OPTIONS`: limite de memoria/procesos de Node para API (ej. `--max-old-space-size=384`).
- `WEB_NODE_OPTIONS`: limite de memoria/procesos de Node para frontend.
- `API_MEM_LIMIT`: limite de RAM del contenedor API (ej. `768m`).
- `WEB_MEM_LIMIT`: limite de RAM del contenedor web (ej. `768m`).
- `MOCK_VNC_MEM_LIMIT`: limite de RAM del contenedor mock VNC.
- `NEXT_PUBLIC_API_URL`: URL publica usada por frontend.
- `NEXT_PUBLIC_NOVNC_URL`: URL publica de noVNC (default `http://localhost:6081`).
- `NEXT_PUBLIC_NOVNC_RESIZE_MODE`: modo resize noVNC (`remote`, `scale`, `off`). Recomendado `remote` para intentar ajuste nativo de resolucion.
- `JWT_ACCESS_SECRET`: secreto para access token.
- `JWT_REFRESH_SECRET`: secreto para refresh token.
- `JWT_ACCESS_EXPIRES`: expiracion access token (`15m` sugerido).
- `JWT_REFRESH_EXPIRES`: expiracion refresh token (`7d` sugerido).
- `ADMIN_EMAIL`: email de admin inicial.
- `ADMIN_PASSWORD`: password de admin inicial.
- `CORS_ORIGIN`: origen permitido para CORS.
- `HYPERVISOR_PROVIDER`: `mock` o `libvirt`.
- `ISO_UPLOAD_DIR`: ruta donde se guardan ISOs subidas.
- `ISO_MAX_SIZE_MB`: tamano maximo de ISO en MB (default 10240).
- `API_REQUEST_TIMEOUT_MS`: timeout de request en API (0 = sin limite).
- `API_PUBLIC_URL`: URL publica de API usada para enlaces de consola.
- `WEB_PUBLIC_URL`: URL publica de frontend usada para lanzar consola VNC.
- `REMOTE_CONSOLE_TTL_SECONDS`: duracion de ticket de consola.
- `REMOTE_CONSOLE_RDP_TUNNEL_MODE`: modo de RDP (`libvirt_ssh` recomendado en entorno WSL/libvirt, `disabled` para conectar directo por IP).
- `REMOTE_CONSOLE_RDP_TUNNEL_PUBLIC_HOST`: host que se escribe en el `.rdp` cuando se usa tunel. Usa `auto` para detectar el host de la peticion (recomendado) o fija una IP/DNS publica.
- `REMOTE_CONSOLE_RDP_TUNNEL_PORT_START`: primer puerto local publicado para tuneles RDP.
- `REMOTE_CONSOLE_RDP_TUNNEL_PORT_END`: ultimo puerto local publicado para tuneles RDP.
- `REMOTE_CONSOLE_RDP_TUNNEL_READY_TIMEOUT_MS`: tiempo maximo para levantar cada tunel RDP.
- `MOCK_VNC_TARGET_HOST`: host interno VNC para provider `mock`.
- `MOCK_VNC_TARGET_PORT`: puerto interno VNC para provider `mock`.
- `DEFAULT_VNC_PORT`: puerto VNC por defecto para VMs reales/libvirt.
- `DEFAULT_RDP_PORT`: puerto RDP por defecto para VMs reales/libvirt.
- `MOCK_VNC_PASSWORD`: password del contenedor noVNC mock.
- `LIBVIRT_DEFAULT_URI`: URI de libvirt (`qemu:///system`, `qemu+ssh://user@host/system`, etc.).
- `LIBVIRT_STORAGE_POOL`: storage pool libvirt donde crear discos de VM.
- `LIBVIRT_DEFAULT_NETWORK`: red libvirt por defecto para NIC virtual.
- `LIBVIRT_VM_NAME_PREFIX`: prefijo de nombres de dominios creados por HyperDesk.
- `LIBVIRT_DISK_BUS`: bus del disco principal (`sata` recomendado para instalador Windows, `virtio` para rendimiento).
- `LIBVIRT_NIC_MODEL`: modelo de tarjeta de red (`e1000` recomendado para instalador Windows, `virtio` para rendimiento).
- `LIBVIRT_VNC_LISTEN_ADDRESS`: listen address del graphics VNC al definir dominio.
- `LIBVIRT_VIDEO_MODEL`: modelo de video (`vga`, `virtio`, `qxl`). Recomendado `vga` para instaladores.
- `LIBVIRT_WINDOWS_VIDEO_MODEL`: modelo de video cuando `osType` contiene `windows` (default `qxl`).
- `LIBVIRT_SOUND_MODEL`: modelo de sonido (`ich9` recomendado para Windows, `none` para desactivar).
- `LIBVIRT_VNC_HOST_OVERRIDE`: fuerza host VNC para proxy web (si libvirt publica por otra IP).
- `LIBVIRT_VNC_HOST_FALLBACK`: host VNC fallback si no se puede inferir desde URI.
- `LIBVIRT_COMMAND_TIMEOUT_MS`: timeout de comandos `virsh`.
- `LIBVIRT_ISO_UPLOAD_TIMEOUT_MS`: timeout para `virsh vol-upload` de ISOs grandes.

## API (`apps/api/.env`)

Usa los mismos valores orientados a backend. Archivo de referencia:

- `apps/api/.env.example`

## Web (`apps/web/.env`)

- `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`
- `NEXT_PUBLIC_NOVNC_URL=http://localhost:6081`
- `NEXT_PUBLIC_NOVNC_RESIZE_MODE=remote`

## Seguridad recomendada

- Nunca commitear `.env`.
- Rotar secretos JWT en produccion.
- Usar valores largos y aleatorios para secretos.
- Cambiar credenciales por defecto antes de exponer el entorno.
