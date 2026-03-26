# HyperDesk - Libvirt/QEMU Real

## Estado actual

El provider `libvirt` ya ejecuta operaciones reales via `virsh`:

- Crear VM real (dominio libvirt) con disco `qcow2` en storage pool.
- Adjuntar ISO (si la VM se crea con `isoId`).
- Conectar NIC a red libvirt (`network`).
- Start / Stop / Reboot / Delete real.
- Resolver display VNC real (`virsh vncdisplay`) para la consola web.

## Requisitos

- Host Linux con KVM (`/dev/kvm`) y stack libvirt instalado.
- `libvirtd` activo.
- Pool y red libvirt existentes (`virsh pool-list`, `virsh net-list`).
- Si usas URI remota (`qemu+ssh://...`), acceso SSH desde el contenedor API.

## Variables clave

```env
HYPERVISOR_PROVIDER=libvirt
LIBVIRT_DEFAULT_URI=qemu:///system
LIBVIRT_STORAGE_POOL=default
LIBVIRT_DEFAULT_NETWORK=default
LIBVIRT_VM_NAME_PREFIX=hd
LIBVIRT_VNC_LISTEN_ADDRESS=0.0.0.0
LIBVIRT_VNC_HOST_OVERRIDE=
LIBVIRT_VNC_HOST_FALLBACK=127.0.0.1
LIBVIRT_COMMAND_TIMEOUT_MS=120000
```

## Flujo real de creación de VM

1. HyperDesk crea volumen `qcow2` en el pool configurado.
2. Si eliges ISO, HyperDesk crea volumen ISO temporal en el pool y hace `vol-upload` desde la ISO subida.
3. Genera XML del dominio (CPU/RAM/disco/NIC/VNC).
4. Define dominio via `virsh define`.
5. Al iniciar VM, HyperDesk ejecuta `virsh start`.
6. Para consola VNC, HyperDesk consulta `virsh vncdisplay` y hace proxy WebSocket seguro al navegador.
7. Al hacer `probe` del hypervisor, HyperDesk sincroniza CPU/RAM del host y detecta pools/redes reales para evitar recursos stale.

## Notas importantes

- Si sigues en `HYPERVISOR_PROVIDER=mock`, no verás el SO real (solo entorno demo).
- Para ver Windows real en consola, la VM debe crearse con provider `libvirt`.
- Las ISOs subidas desde la UI se transfieren al pool libvirt configurado en la creación de VM.

## Troubleshooting rapido

Si ves:

`Failed to connect socket to '/var/run/libvirt/virtqemud-sock'`

significa que el contenedor API no ve libvirt local. Soluciones:

1. Usar URI remota por SSH (`qemu+ssh://...`), o
2. En Linux, arrancar con `docker-compose.libvirt-local.yml` para montar `/var/run/libvirt`.

## Verificación rápida

```bash
virsh -c qemu:///system list --all
virsh -c qemu:///system pool-list --all
virsh -c qemu:///system net-list --all
```
