FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173 9000 27960

CMD ["npm", "run", "dev"]
