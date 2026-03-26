# HyperDesk - Modelo de Datos (Fase 1)

## 1) Entidades IAM

### User

- `id` (UUID, PK)
- `email` (unique)
- `username` (unique, nullable)
- `passwordHash`
- `status` (`ACTIVE`, `SUSPENDED`, `INVITED`)
- `lastLoginAt`
- `createdAt`, `updatedAt`

Indices:

- `UNIQUE(email)`
- `UNIQUE(username)`
- `INDEX(status, createdAt)`

### Role

- `id` (UUID, PK)
- `name` (unique: `admin`, `operator`, `viewer`)
- `description`
- `isSystem`

### Permission

- `id` (UUID, PK)
- `code` (unique, ej: `vm.start`, `user.create`)
- `resource`
- `action`

### UserRole

- `id` (UUID, PK)
- `userId` (FK -> User)
- `roleId` (FK -> Role)
- `scopeType` (`GLOBAL` | `GROUP`)
- `scopeId` (nullable)

Indice:

- `UNIQUE(userId, roleId, scopeType, scopeId)`

### RolePermission

- `roleId` (FK -> Role)
- `permissionId` (FK -> Permission)

Indice:

- `UNIQUE(roleId, permissionId)`

### Group

- `id` (UUID, PK)
- `name` (unique)
- `slug` (unique)
- `description`

### GroupMember

- `id` (UUID, PK)
- `groupId` (FK -> Group)
- `userId` (FK -> User)
- `joinedAt`

Indice:

- `UNIQUE(groupId, userId)`

## 2) Entidades de virtualizacion

### HypervisorHost

- `id` (UUID, PK)
- `name` (unique)
- `providerType` (`MOCK`, `LIBVIRT`)
- `connectionUri` (ej: `qemu:///system`)
- `status` (`ONLINE`, `OFFLINE`, `MAINTENANCE`)
- `cpuCoresTotal`
- `memoryMbTotal`
- `storageGbTotal`
- `lastHeartbeatAt`

Indices:

- `UNIQUE(name)`
- `INDEX(status, lastHeartbeatAt)`

### VirtualMachine

- `id` (UUID, PK)
- `name`
- `externalId` (id en provider)
- `state` (`PROVISIONING`, `STOPPED`, `RUNNING`, `STARTING`, `STOPPING`, `REBOOTING`, `ERROR`, `DELETING`)
- `vcpu`
- `memoryMb`
- `groupId` (FK -> Group)
- `hostId` (FK -> HypervisorHost)
- `templateId` (FK -> Template, nullable)
- `createdById` (FK -> User)
- `createdAt`, `updatedAt`

Indices:

- `UNIQUE(hostId, externalId)`
- `UNIQUE(groupId, name)`
- `INDEX(state, hostId)`

### Network

- `id` (UUID, PK)
- `name`
- `type` (`BRIDGE`, `NAT`, `VLAN`)
- `cidr`
- `gatewayIp`
- `groupId` (FK -> Group)
- `hostId` (FK -> HypervisorHost, nullable)

Indice:

- `UNIQUE(groupId, name)`

### VmNetworkInterface

- `id` (UUID, PK)
- `vmId` (FK -> VirtualMachine)
- `networkId` (FK -> Network)
- `name` (ej: `eth0`)
- `macAddress` (unique)
- `ipAddress` (nullable)
- `isPrimary`

### StoragePool

- `id` (UUID, PK)
- `name`
- `type` (`DIR`, `LVM`, `NFS`, `ZFS`)
- `capacityGb`
- `usedGb`
- `status` (`READY`, `DEGRADED`, `OFFLINE`)
- `hostId` (FK -> HypervisorHost)

Indice:

- `UNIQUE(hostId, name)`

### DiskVolume

- `id` (UUID, PK)
- `name`
- `externalId`
- `sizeGb`
- `format` (`QCOW2`, `RAW`)
- `storagePoolId` (FK -> StoragePool)
- `vmId` (FK -> VirtualMachine, nullable)
- `isBoot`

Indice:

- `UNIQUE(storagePoolId, externalId)`

### IsoImage

- `id` (UUID, PK)
- `name`
- `version`
- `osFamily`
- `checksumSha256` (unique)
- `sizeBytes`
- `storagePoolId` (FK -> StoragePool)
- `path`
- `uploadedById` (FK -> User)

### Template

- `id` (UUID, PK)
- `name`
- `version`
- `sourceType` (`ISO` | `VM`)
- `isoId` (FK -> IsoImage, nullable)
- `baseVmId` (FK -> VirtualMachine, nullable)
- `defaultVcpu`
- `defaultMemoryMb`
- `cloudInit` (jsonb, nullable)

Indice:

- `UNIQUE(name, version)`

## 3) Seguridad y trazabilidad

### Session

- `id` (UUID, PK)
- `userId` (FK -> User)
- `refreshTokenHash` (unique)
- `accessTokenJti` (unique)
- `ip`
- `userAgent`
- `expiresAt`
- `revokedAt` (nullable)

### AuditLog

- `id` (UUID, PK)
- `actorUserId` (FK -> User, nullable)
- `action` (ej: `vm.create`, `auth.login`)
- `resourceType` (ej: `VM`, `USER`)
- `resourceId`
- `metadata` (jsonb)
- `ip`
- `createdAt`

Indices:

- `INDEX(createdAt DESC)`
- `INDEX(actorUserId, createdAt DESC)`
- `INDEX(resourceType, resourceId, createdAt DESC)`

## 4) Relaciones clave

- User M:N Role (UserRole)
- Role M:N Permission (RolePermission)
- User M:N Group (GroupMember)
- Group 1:N VirtualMachine
- HypervisorHost 1:N VirtualMachine
- HypervisorHost 1:N StoragePool
- StoragePool 1:N DiskVolume / IsoImage
- VirtualMachine M:N Network (VmNetworkInterface)
- User 1:N Session / AuditLog

