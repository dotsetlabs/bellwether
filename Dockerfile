# Bellwether MCP Testing Tool
# https://github.com/dotsetlabs/bellwether

FROM node:20-alpine

LABEL maintainer="Dotset Labs <hello@dotsetlabs.com>"
LABEL description="Bellwether - MCP Server Testing & Validation"
LABEL org.opencontainers.image.source="https://github.com/dotsetlabs/bellwether"

# Install git for npm dependencies that may need it
RUN apk add --no-cache git

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application
COPY dist/ ./dist/
COPY schemas/ ./schemas/
COPY LICENSE README.md CHANGELOG.md ./

# Create non-root user
RUN addgroup -g 1001 -S bellwether && \
    adduser -S bellwether -u 1001

# Set proper permissions
RUN chown -R bellwether:bellwether /app

# Switch to non-root user
USER bellwether

# Set environment
ENV NODE_ENV=production
ENV BELLWETHER_DOCKER=1

# Entry point
ENTRYPOINT ["node", "dist/cli/index.js"]
CMD ["--help"]
