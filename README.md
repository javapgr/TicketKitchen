# TicketKitchen

Sistema de restaurante (parrillas): clientes, mozos, cocineros, productos y tickets con sus productos.
Express + Jade (HTML puro, sin CSS) + SQLite, con login por JWT en cookie.

## Puesta en marcha

```powershell
npm install
copy .env.example .env      # y cambia JWT_SECRET por un texto largo y aleatorio
$env:ADMIN_EMAIL="admin@kitchen.com"
$env:ADMIN_PASSWORD="una-clave-de-8+-caracteres"
npm run create-admin        # crea el primer administrador
npm run seed                # opcional: datos de ejemplo
npm start                   # http://localhost:3000
```

La base de datos (`database.sqlite`) se crea sola al arrancar y no se sube a git.

## Roles

| Rol | Puede |
| --- | --- |
| `admin` | Todo: CRUD de todas las tablas, borrar, crear usuarios (`/auth/register`) |
| `user` | Ver todo, crear/editar tickets y agregar/quitar productos de un ticket. No borra tickets ni toca otras tablas |

No hay registro público: solo un admin crea usuarios.
Tras 5 intentos fallidos de login la cuenta se bloquea 5 minutos.

## Tickets

Cada ticket tiene productos (`/restaurant/tickets/:id`). El precio se copia del producto al agregarlo
y el total se recalcula solo. Un producto que ya está en un ticket no se puede borrar (márcalo como no disponible).

## API JSON

Requiere sesión (cookie `auth_token`, o iniciar sesión con `POST /auth/login` enviando JSON).

| Método | Ruta |
| --- | --- |
| GET / POST | `/restaurant/api/:entidad` |
| GET / PUT / DELETE | `/restaurant/api/:entidad/:id` |
| GET / POST | `/restaurant/api/tickets/:id/items` (`producto_id`, `cantidad`) |
| DELETE | `/restaurant/api/tickets/:id/items/:itemId` |

Entidades: `clientes`, `mozos`, `cocineros`, `productos`, `tickets`.
