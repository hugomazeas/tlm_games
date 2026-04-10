.PHONY: build up down restart shell logs migrate seed fresh test tinker status cache

# Host uid/gid so bind-mounted files stay owned by the clone user (Makefile exports for compose build args).
export LOCAL_UID := $(shell id -u)
export LOCAL_GID := $(shell id -g)

# Auto-detect USB camera and include override if present
COMPOSE_FILES := -f docker-compose.yml
ifneq (,$(wildcard /dev/video0))
  COMPOSE_FILES += -f docker-compose.camera.yml
endif

build:
	docker compose $(COMPOSE_FILES) build

up:
	docker compose $(COMPOSE_FILES) up -d

down:
	docker compose $(COMPOSE_FILES) down

restart:
	docker compose $(COMPOSE_FILES) restart

shell:
	docker compose exec app sh

logs:
	docker compose logs -f

migrate:
	docker compose exec app php artisan migrate
queue:
	docker compose exec app php artisan queue:work
seed:
	docker compose exec app php artisan db:seed

fresh:
	docker compose exec app php artisan migrate:fresh --seed

test:
	docker compose exec app php artisan test

tinker:
	docker compose exec app php artisan tinker

status:
	docker compose ps

cache:
	docker compose exec app php artisan cache:clear
	docker compose exec app php artisan config:clear
	docker compose exec app php artisan route:clear
	docker compose exec app php artisan view:clear
