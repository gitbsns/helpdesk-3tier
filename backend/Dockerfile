# Node 20 ka support April 2026 mein khatam ho chuka hai, isliye Node 24 (LTS)
FROM node:24-alpine
WORKDIR /usr/src/app

# Pehle sirf package files: dependencies ka layer cache ho jata hai
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .

# Runtime ko npm chahiye nahi (CMD seedha node chalata hai).
# Build tools production image mein nahi rakhte: attack surface kam hota hai.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Root ke bajaye normal user se chalao
USER node
EXPOSE 4000
CMD ["node", "server.js"]
