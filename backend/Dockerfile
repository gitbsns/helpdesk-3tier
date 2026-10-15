FROM node:20-alpine
WORKDIR /usr/src/app
# Pehle sirf package files: dependencies ka layer cache ho jata hai
COPY package*.json ./
# package-lock.json ho to "npm ci" (exact versions), warna "npm install"
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY . .
# Root ke bajaye normal user (uid 1000) se chalao
USER node
EXPOSE 4000
CMD ["node", "server.js"]
