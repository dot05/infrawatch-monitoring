FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json .

# Install dependencies
RUN npm install --production

# Copy source
COPY src/ ./src/

# Non-root user for security (real world practice)
RUN addgroup -S infrawatch && adduser -S infrawatch -G infrawatch
USER infrawatch

EXPOSE 3001

CMD ["node", "src/index.js"]