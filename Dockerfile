FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4189
COPY package.json ./
COPY src ./src
COPY public ./public
COPY data ./data
USER node
EXPOSE 4189
CMD ["node", "src/server.js"]
