# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client and build TypeScript
RUN npx prisma generate
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Set Node to production
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy generated prisma client and build artifacts from builder
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

# Start the application
CMD ["npm", "start"]
