# HelpDesk: Three-Tier App (Docker, Jenkins CI/CD, Kubernetes)

Ek chhota lekin standard three-tier application. Is par poora DevOps flow practice hota hai:
Docker, Jenkins CI/CD, Kubernetes, aur security hardening.

## Three-tier ka matlab

| Tier | Kya hai | Technology | Kaam |
|------|---------|------------|------|
| 1. Presentation | Frontend | Nginx + HTML/JS | Web page dikhata hai, `/api/` requests backend ko bhejta hai |
| 2. Application | Backend API | Node.js (Express) | Login, roles, business logic |
| 3. Data | Database | PostgreSQL | Users aur tickets ka data |

```
 Browser
    |  HTTP :8080
    v
+------------------+   /api/*   +------------------+   SQL   +------------------+
| Tier 1: Nginx    | ---------> | Tier 2: Node API | ------> | Tier 3: Postgres |
| static page      |            | auth + roles     |         | users, tickets   |
+------------------+            +------------------+         +------------------+
   frontend_net  <----------------->  backend_net
```

Frontend aur database ek doosre se baat nahi kar sakte. Beech mein hamesha backend hota hai.
Sirf frontend ka port bahar publish hota hai.

## Roles aur permissions

| Action | user | agent | admin |
|--------|:----:|:-----:|:-----:|
| Ticket banana | Haan | Haan | Haan |
| Apne tickets dekhna | Haan | Haan | Haan |
| Sab ke tickets dekhna | Nahi | Haan | Haan |
| Ticket ka status badalna | Nahi | Haan | Haan |
| Ticket delete karna | Nahi | Nahi | Haan |
| Users ke roles badalna | Nahi | Nahi | Haan |

Naya register hone wala hamesha `user` banta hai. Role sirf admin badal sakta hai.
Role har request par database se padha jata hai (token mein store nahi hota), isliye role badalne ka asar foran hota hai.

## Project structure

```
helpdesk-3tier/
├── backend/
│   ├── server.js            # API, auth, roles, DB connection
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── frontend/
│   ├── public/index.html    # web page
│   ├── nginx.conf.template  # Nginx config, backend ka address env se aata hai
│   └── Dockerfile
├── docker-compose.yml       # teeno tiers, do alag networks
├── .env.example             # secrets ka template (asal .env commit nahi hoti)
├── .gitignore
└── README.md
```

## Secrets

| Secret | Kya hai | Kahan use hota hai |
|--------|---------|--------------------|
| `DB_PASSWORD` | PostgreSQL ka password | db aur backend |
| `JWT_SECRET` | Login token sign karne ki key | sirf backend |
| `ADMIN_PASSWORD` | Pehle admin user ka password | sirf backend (pehli baar start par) |

Local mein `.env` file se, Kubernetes mein Secret object se aate hain. Git mein kabhi nahi jaate.

## Quick start (local)

```bash
cp .env.example .env            # phir .env mein asal values daalo
docker compose up --build
# browser: http://localhost:8081   (login: admin / jo ADMIN_PASSWORD rakha)
```

Password badalna ho aur pehle se volume bana ho to `docker compose down -v` zaroori hai.

## Roadmap

| Phase | Kaam |
|-------|------|
| 0 | Lab check: Docker, kubectl, minikube, Git, Node |
| 1 | Docker Compose se teeno tiers local chalana, networks samajhna |
| 2 | Fresh GitHub repo, secrets ka sahi handling |
| 3 | Jenkins CI: do images (backend, frontend) build aur push |
| 4 | Kubernetes par manual deploy: Secret, ConfigMap, PVC, 3 Deployments, Services, Ingress |
| 5 | Jenkins CD: dono Deployments ko rolling update, limited RBAC |
| 6 | Security: NetworkPolicy (frontend -> backend -> db), non-root, resource limits, Cloudflare |
| 7 | Docs, screenshots, LinkedIn |

## Known limitations (jaan-boojh kar chhode gaye)

- Login par rate limiting nahi hai
- Token localStorage jaisi jagah (sessionStorage) mein hai, httpOnly cookie behtar hoti
- HTTPS yahan nahi, Phase 6 mein Cloudflare ke zariye aayega
- Koi automated test nahi, Phase 3 mein add kar sakte hain
