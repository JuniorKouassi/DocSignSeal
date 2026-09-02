# Cloudflare Containers requires linux/amd64. @napi-rs/canvas ships prebuilt
# glibc binaries, so a plain Debian-based Node image (not Alpine/musl) needs
# no build toolchain -- npm install just downloads the right prebuilt binary.
FROM --platform=linux/amd64 node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/server.mjs"]
