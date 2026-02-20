FROM node:20-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3002

CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3002"]
