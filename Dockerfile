# Dockerfile for ticket-dependency-graph
# Works unchanged with both Docker (`docker build`) and Podman (`podman build`).
# Avoids BuildKit-only syntax (`--mount=type=cache`, heredocs) so older
# Buildah / Podman versions can also build it.

# =============================================================================
# Stage 1: builder
#   - installs all npm deps (incl. devDeps so vite/tsc can run)
#   - builds the Vite frontend into /app/dist
#   - compiles better-sqlite3 native bindings (will be re-used in runtime stage)
# =============================================================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Build toolchain for better-sqlite3's native compilation. Discarded after
# this stage so it doesn't bloat the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install deps first so layers cache even when source files change
COPY package.json package-lock.json ./
RUN npm ci

# Bring in the rest of the project and build
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts index.html eslint.config.js ./
COPY src ./src
COPY server ./server
COPY public ./public
RUN npm run build

# =============================================================================
# Stage 2: runtime
#   - slim Node + Python (sg_client.py is invoked as a subprocess)
#   - non-root user with a fixed numeric UID (Podman rootless friendly)
#   - copies only what the running app reads at runtime
# =============================================================================
FROM node:20-bookworm-slim AS runtime

# Python is required because /api/sg/update-task-status,
# /api/sg/update-task-priority, /api/sg/list-statuses, /api/sg/list-projects,
# and the bootstrap routes all shell out to `python sg_client.py …`.
# --break-system-packages is acceptable inside a container — the Debian
# system Python is dedicated to this app, so PEP 668 isolation is moot.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages \
        shotgun_api3 requests python-dotenv \
    && rm -rf /var/lib/apt/lists/* /root/.cache

# Fixed numeric UID/GID — Podman maps these predictably into rootless user
# namespaces, and the chown into /data below stays valid across hosts.
RUN groupadd -g 10001 app && useradd -u 10001 -g app -m -d /home/app app

WORKDIR /app

# Built artifacts + sources the server actually needs at runtime
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist         ./dist
COPY --from=builder --chown=app:app /app/server       ./server
COPY --from=builder --chown=app:app /app/src          ./src
COPY --chown=app:app package.json                     ./
COPY --chown=app:app sg_client.py                  ./
COPY --chown=app:app sg-events-plugins                ./sg-events-plugins

# Persistent state directories. /data holds the SQLite DB; /app/logs holds the
# audit log file. Mount volumes here in production so the data survives image
# rebuilds.
RUN mkdir -p /data /app/logs && chown -R app:app /data /app/logs

# Sane production defaults. Override at run time with `-e` or `--env-file`.
#   SG_INTERNAL_SECRET and ADMIN_PASSWORD MUST be overridden — the defaults
#   in source code are publicly known. See README "Production Safety".
ENV NODE_ENV=production \
    PORT=3001 \
    PYTHON_CMD=python3 \
    DB_PATH=/data/data.db \
    SERVE_STATIC=1

USER app
EXPOSE 3001

# Lightweight HTTP probe using Node's built-in fetch (no curl/wget needed).
# Honored by Docker; Podman ignores it unless run with --health-cmd or under
# systemd/quadlet — that's fine, it's still useful as documentation.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/state').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tsx runs the TypeScript server directly. Matches the systemd unit pattern
# in the README, so behavior is identical in container and bare-metal deploys.
CMD ["npx", "tsx", "server/index.ts"]
