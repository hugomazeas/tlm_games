.PHONY: build up down restart shell logs migrate seed fresh test tinker status cache pull-prod-db

# Production database (read over SSH; the sudo step prompts for your password)
PROD_HOST ?= game_computer
PROD_DB   ?= /home/tlm/tlm_games/database/database.sqlite
LOCAL_DB  ?= database/database.sqlite

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
	docker compose logs -f worker
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

# Pull the live production SQLite DB into the local repo (overwrites $(LOCAL_DB)).
# The prod file is owned by `tlm`, so we sudo a readable snapshot into /tmp first;
# the previous local DB is kept as $(LOCAL_DB).bak.
pull-prod-db:
	@echo "→ Snapshotting production DB on $(PROD_HOST) (enter your sudo password if prompted)..."
	ssh -t $(PROD_HOST) 'U=$$(whoami); sudo sh -c "cp $(PROD_DB) /tmp/prod_db.sqlite && chown $$U /tmp/prod_db.sqlite"'
	@echo "→ Backing up current local DB to $(LOCAL_DB).bak ..."
	@[ -f $(LOCAL_DB) ] && cp $(LOCAL_DB) $(LOCAL_DB).bak || true
	@echo "→ Downloading snapshot into $(LOCAL_DB) ..."
	scp $(PROD_HOST):/tmp/prod_db.sqlite $(LOCAL_DB)
	@echo "→ Cleaning up remote snapshot..."
	ssh $(PROD_HOST) 'rm -f /tmp/prod_db.sqlite'
	@echo "✓ Production DB pulled. Run 'make restart' if the app has stale data, and 'make migrate' if local migrations are ahead of prod."
