.PHONY: build up down restart shell logs migrate seed fresh test tinker status

# Host uid/gid so bind-mounted files stay owned by the clone user (Makefile exports for compose build args).
export LOCAL_UID := $(shell id -u)
export LOCAL_GID := $(shell id -g)

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

shell:
	docker compose exec app sh

logs:
	docker compose logs -f

migrate:
	docker compose exec app php artisan migrate

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
