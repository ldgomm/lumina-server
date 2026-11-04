# syntax=docker/dockerfile:1
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /workspace
COPY gradle/ gradle/
COPY gradlew settings.gradle.kts build.gradle.kts gradle.properties ./
COPY src/ src/
RUN --mount=type=cache,target=/root/.gradle bash gradlew --no-daemon --console=plain installDist -x test

FROM eclipse-temurin:21-jre-jammy AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl openssl ca-certificates fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 loyalty \
    && useradd --uid 10001 --gid 10001 --create-home loyalty
WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/build/install/loyalty/ /app/
ARG LOYALTY_SOURCE_SHA=working-tree
ENV LOYALTY_SOURCE_SHA=${LOYALTY_SOURCE_SHA}
ENV JAVA_OPTS="-Djava.awt.headless=true -XX:MaxRAMPercentage=75"
LABEL org.opencontainers.image.title="Loyalty local staging" \
      com.loyalty.source-sha=${LOYALTY_SOURCE_SHA}
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=40s --retries=20 \
    CMD curl --fail --silent --show-error http://127.0.0.1:8080/health/ready >/dev/null || exit 1
ENTRYPOINT ["/app/bin/loyalty"]
