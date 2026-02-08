FROM node:18-alpine

WORKDIR /app

# Install security updates
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production

# Copy application
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Set permissions
RUN chown -R nodejs:nodejs /app
USER nodejs

# Health check (use PORT env if present)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const p = process.env.PORT || 3000; require('http').get('http://localhost:' + p + '/health', (r) => { if (r.statusCode !== 200) throw new Error(r.statusCode) })"

# Use dumb-init to handle signals properly and run our entrypoint wrapper
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
ENTRYPOINT ["dumb-init", "--", "/app/docker-entrypoint.sh"]

CMD ["node", "src/index.js"]
