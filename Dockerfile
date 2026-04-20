FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy all source files
COPY . .

# Build frontend
RUN npm run build

EXPOSE 3000

CMD ["node", "server.mjs"]