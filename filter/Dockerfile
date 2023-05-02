# Dockerfile
FROM node:18-alpine
WORKDIR /src/app
COPY package*.json ./
RUN npm install
COPY . .
CMD [ "npm", "start" ]

