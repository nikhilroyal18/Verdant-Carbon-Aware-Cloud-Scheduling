FROM maven:3.9.11-eclipse-temurin-21 AS java-build
WORKDIR /build
COPY cloudsim/pom.xml ./pom.xml
COPY cloudsim/src ./src
RUN mvn -B package -DskipTests

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node dist ./dist
COPY --chown=node:node server.mjs package.json ./
COPY --from=java-build --chown=node:node /build/target/cloudsim-replay.jar ./cloudsim/target/cloudsim-replay.jar
ENV HOST=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
