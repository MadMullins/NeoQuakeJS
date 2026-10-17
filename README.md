# NeoQuakeJS

NeoQuakeJS modernizes the original QuakeJS browser client while keeping its ioquake3 engine and launch behavior. The archived source is adjacent at `../quakejs-master/`; the original compiled browser runtime is staged at `public/engine/ioquake3.js` so this repository can build and run independently.

The browser adapter retains the original `ioq3.callMain` startup, pointer-lock input, viewport resizing, `fs_cdn` setting, and URL-based engine commands. It does not replace Quake gameplay, networking, or assets with a new implementation.

## Run locally

```bash
npm install
npm run dev
```

This starts Vite and the local content service. Open the Vite URL printed in the terminal, normally `http://localhost:5173/`. Add legally obtained Quake III `.pk3` files under `assets/baseq3/` before launching a game. This command does not start the game server or Caddy proxy; use Docker Compose for the complete stack.

## Required copyrighted assets

The baseq3 server loads these ten Quake III PK3 archives from `assets/baseq3/`. They are copyrighted game data, excluded from Git by `.gitignore`, and must be obtained from a copy you are authorized to use. The MD5 values below identify the files currently in this workspace; use them to verify local copies. The additional `q3wpak*.pk3` archives are optional and are not required for the configured baseq3 match.

| Required file | MD5 |
| --- | --- |
| `assets/baseq3/pak0.pk3` | `1197ca3df1e65f3c380f8abc10ca43bf` |
| `assets/baseq3/pak1.pk3` | `48911719d91be25adb957f2d325db4a0` |
| `assets/baseq3/pak2.pk3` | `d550ce896130c47166ca44b53f8a670a` |
| `assets/baseq3/pak3.pk3` | `968dfd0f30dad67056115c8e92344ddc` |
| `assets/baseq3/pak4.pk3` | `24bb1f4fcabd95f6e320c0e2f62f19ca` |
| `assets/baseq3/pak5.pk3` | `734dcd06d2cbc7a16432ff6697f1c5ba` |
| `assets/baseq3/pak6.pk3` | `873888a73055c023f6c38b8ca3f2ce05` |
| `assets/baseq3/pak7.pk3` | `8fd38c53ed814b64f6ab03b5290965e4` |
| `assets/baseq3/pak8.pk3` | `d8b96d429ca4a9c289071cb7e77e14d2` |
| `assets/baseq3/pak8a.pk3` | `d2af6ef6bb831ece5fdc626b7f18d406` |

QuakeJS launch commands use the original query form, for example `?connect%20SERVER:27960`.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

By default, open `http://localhost`. Compose runs the browser client, content API, and original QuakeJS dedicated server behind Caddy. Configure the public origin and host-side game port in `.env`:

```dotenv
PUBLIC_URL=https://quake.example.com
GAME_PORT=27960
```

Caddy obtains and renews the HTTPS certificate automatically when the domain points to this host and ports `80` and `443` are reachable. The browser uses that origin for secure content requests and WebSockets. `GAME_PORT` selects the host port forwarded to the dedicated server’s internal WebSocket port `27960`. The server runs a private `q3dm1` match and persists downloaded game data in a Docker volume. Game assets are mounted from `assets/` and are not included in the image or Git.

Compose mounts `./assets` read-only at `/assets` in the content service. The dedicated server fetches packages from that service and stores its writable game state in the named `game-base` volume at `/app/base`. Caddy’s `Caddyfile` is mounted read-only; its certificate data and config use the `caddy-data` and `caddy-config` volumes. Private `.env` files are excluded from Docker build contexts.

For a direct non-TLS connection, connect to `SERVER:${GAME_PORT}` (default `27960`). When using Caddy over HTTPS, connect through secure port `443`, for example `https://quake.example.com/?connect%20quake.example.com:443`.

## Production build

```bash
npm run build
npm run preview
```

This builds and previews the browser client only; the content and game services are started separately through Docker Compose.

The original project is QuakeJS by Anthony Pesch, licensed under MIT. The Emscripten-generated runtime includes its upstream notices in the bundle.
