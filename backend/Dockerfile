FROM node:18-slim

# Directorio de trabajo en el contenedor
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias para producción
RUN npm install --only=production

# Copiar el código fuente
COPY . .

# Cloud Run escucha en el puerto 8080 por defecto
ENV PORT=8080
EXPOSE 8080

# Iniciar la aplicación
CMD [ "node", "index.js" ]
