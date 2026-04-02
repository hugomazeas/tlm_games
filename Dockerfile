FROM php:8.3-fpm-alpine

# Install system dependencies
RUN apk add --no-cache \
    git \
    curl \
    libpng-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    oniguruma-dev \
    libxml2-dev \
    zip \
    unzip \
    sqlite \
    sqlite-dev \
    nginx \
    supervisor \
    ffmpeg \
    v4l-utils \
    autoconf \
    g++ \
    make

# Configure and install GD with JPEG and freetype support
RUN docker-php-ext-configure gd --with-freetype --with-jpeg

# Install PHP extensions
RUN docker-php-ext-install pdo_mysql pdo_sqlite mbstring exif pcntl bcmath gd

# Clean up build dependencies (keep libstdc++ — ffmpeg needs it)
RUN apk del autoconf make \
    && apk add --no-cache libstdc++

# Get Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www

# Copy nginx configuration
COPY docker/nginx/default.conf /etc/nginx/http.d/default.conf

# Copy supervisor configuration
COPY docker/supervisor/supervisord.conf /etc/supervisord.conf

# Match www-data to the host user for bind mounts (default 1000:1000). Build with:
#   docker compose build --build-arg USER_ID=$(id -u) --build-arg GROUP_ID=$(id -g)
ARG USER_ID=1000
ARG GROUP_ID=1000
RUN deluser www-data 2>/dev/null || true \
    && delgroup www-data 2>/dev/null || true \
    && addgroup -g ${GROUP_ID} www-data \
    && adduser -u ${USER_ID} -S -H -G www-data www-data

# Create necessary directories and set permissions
RUN mkdir -p /var/www/database /var/www/storage/logs /var/www/bootstrap/cache /var/log/supervisor \
    && chown -R www-data:www-data /var/www

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
