# nginx-unprivileged: root ke bajaye normal user se chalta hai, port 8080 par
FROM nginxinc/nginx-unprivileged:1.30-alpine
# Is folder ki *.template files par start hone par envsubst chalta hai
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY public/ /usr/share/nginx/html/
ENV BACKEND_HOST=backend BACKEND_PORT=4000
EXPOSE 8080
