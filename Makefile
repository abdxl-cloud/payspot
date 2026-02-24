SHELL := /bin/bash
.DEFAULT_GOAL := help

PROJECT_NAME := payspot
COMPOSE := docker compose
APP_SERVICE := payspot
DB_SERVICE := postgres
BACKUP_DIR := backups
ENV_FILE := .env

.PHONY: help info version install env-setup ssl-env setup bootstrap up down restart start stop ps logs logs-app logs-db build rebuild wait-for-services health urls db-migrate db-seed seed-admin-reset db-shell db-remove-default-plans db-reset db-reset-force db-backup db-restore shell-app shell-db clean prune

help:
	@printf "\n"
	@printf "PaySpot - Project Commands\n"
	@printf "==========================\n\n"
	@printf "General\n"
	@printf "  help                 Show this help message\n"
	@printf "  info                 Show project and container status\n"
	@printf "  version              Show Node and npm versions\n\n"
	@printf "Setup\n"
	@printf "  install              Install Node dependencies\n"
	@printf "  env-setup            Create .env (with strong generated secrets) if missing\n"
	@printf "  ssl-env              Configure .env for HTTPS (usage: make ssl-env DOMAIN=your-domain)\n"
	@printf "  setup                env-setup + install + build\n"
	@printf "  bootstrap            Start stack, wait for readiness, run migrate+seed\n\n"
	@printf "Docker\n"
	@printf "  up                   Start services in background\n"
	@printf "  down                 Stop and remove services\n"
	@printf "  restart              Restart all services\n"
	@printf "  start                Alias for up\n"
	@printf "  stop                 Alias for down\n"
	@printf "  ps                   Show service status\n"
	@printf "  logs                 Tail all logs\n"
	@printf "  logs-app             Tail app logs\n"
	@printf "  logs-db              Tail database logs\n"
	@printf "  build                Build Docker images\n"
	@printf "  rebuild              Rebuild and restart stack\n\n"
	@printf "Database\n"
	@printf "  db-migrate           Ensure schema is initialized\n"
	@printf "  db-seed              Ensure seed data exists\n"
	@printf "  seed-admin-reset     Reset seeded admin login (set SEED_ADMIN_PASSWORD=...)\n"
	@printf "  db-shell             Open PostgreSQL shell\n"
	@printf "  db-remove-default-plans  Remove default plans (3h, 1day, 1week) when safe\n"
	@printf "  db-reset             Reset database volume (with prompt)\n"
	@printf "  db-reset-force       Reset database volume without prompt\n"
	@printf "  db-backup            Backup database to backups/\n"
	@printf "  db-restore FILE=...  Restore database from SQL dump\n\n"
	@printf "Utilities\n"
	@printf "  wait-for-services    Wait for DB and app health\n"
	@printf "  health               Show container health\n"
	@printf "  urls                 Print app and DB URLs\n"
	@printf "  shell-app            Open shell in app container\n"
	@printf "  shell-db             Open shell in db container\n"
	@printf "  clean                Remove local build artifacts\n"
	@printf "  prune                Prune Docker system resources\n\n"

info:
	@printf "\nProject: $(PROJECT_NAME)\n"
	@printf "Directory: %s\n\n" "$(PWD)"
	@$(COMPOSE) ps || true

version:
	@node -v
	@npm -v

install:
	npm install

env-setup:
	@if [ ! -f $(ENV_FILE) ]; then \
		cp .env.example $(ENV_FILE); \
		if command -v openssl >/dev/null 2>&1; then \
			pg_pass=$$(openssl rand -hex 24); \
			admin_key=$$(openssl rand -hex 24); \
			tenant_key=$$(openssl rand -base64 32 | tr -d '\n'); \
			perl -pi -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$$pg_pass|; s|^ADMIN_API_KEY=.*|ADMIN_API_KEY=$$admin_key|; s|^TENANT_SECRETS_KEY=.*|TENANT_SECRETS_KEY=$$tenant_key|; s|^DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:$$pg_pass\@postgres:5432/payspot|;" $(ENV_FILE); \
			echo "Generated strong POSTGRES_PASSWORD, ADMIN_API_KEY, and TENANT_SECRETS_KEY"; \
		else \
			echo "openssl not found; update secrets in $(ENV_FILE) manually"; \
		fi; \
		echo "Created $(ENV_FILE) from .env.example"; \
	else \
		echo "$(ENV_FILE) already exists"; \
	fi

ssl-env:
	@if [ -z "$(DOMAIN)" ]; then \
		echo "Usage: make ssl-env DOMAIN=payspot.abdxl.cloud"; \
		exit 1; \
	fi
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "$(ENV_FILE) missing. Run: make env-setup"; \
		exit 1; \
	fi
	@perl -pi -e "s|^APP_URL=.*|APP_URL=https://$(DOMAIN)|; s|^SESSION_COOKIE_SECURE=.*|SESSION_COOKIE_SECURE=true|; s|^FORCE_HTTPS=.*|FORCE_HTTPS=true|;" $(ENV_FILE)
	@grep -q '^FORCE_HTTPS=' $(ENV_FILE) || echo 'FORCE_HTTPS=true' >> $(ENV_FILE)
	@echo "Updated $(ENV_FILE) for HTTPS domain: $(DOMAIN)"

setup: env-setup install build

bootstrap: up wait-for-services db-migrate db-seed info

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

restart: down up

start: up

stop: down

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f

logs-app:
	$(COMPOSE) logs -f $(APP_SERVICE)

logs-db:
	$(COMPOSE) logs -f $(DB_SERVICE)

build:
	$(COMPOSE) build

rebuild:
	$(COMPOSE) down
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d

wait-for-services:
	@echo "Waiting for PostgreSQL..."
	@until $(COMPOSE) exec -T $(DB_SERVICE) pg_isready -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-payspot} >/dev/null 2>&1; do sleep 1; done
	@echo "Waiting for app HTTP endpoint..."
	@until curl -fsS http://localhost:3000 >/dev/null 2>&1; do sleep 1; done
	@echo "Services are ready"

health:
	@$(COMPOSE) ps --format json | jq -r '.[] | "\(.Service): \(.State) (health=\(.Health // "n/a"))"' 2>/dev/null || $(COMPOSE) ps

urls:
	@echo "App: http://localhost:3000"
	@echo "Postgres: postgresql://$${POSTGRES_USER:-postgres}:$${POSTGRES_PASSWORD:-change-this-strong-password}@localhost:$${POSTGRES_HOST_PORT:-5433}/$${POSTGRES_DB:-payspot}"

db-migrate:
	@echo "Initializing schema via application startup path..."
	@$(COMPOSE) exec -T $(APP_SERVICE) node -e "fetch('http://localhost:3000/api/t/walstreet/packages').then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); })"

db-seed:
	@echo "Seed data is idempotent and runs during db-migrate"
	@$(MAKE) db-migrate

seed-admin-reset:
	@if [ -z "$$SEED_ADMIN_PASSWORD" ]; then \
		echo "Set SEED_ADMIN_PASSWORD (min 12 chars), example:"; \
		echo "  make seed-admin-reset SEED_ADMIN_PASSWORD='Use-A-Strong-Password-Here'"; \
		exit 1; \
	fi
	@$(COMPOSE) exec -T $(APP_SERVICE) node scripts/reset-seed-admin.mjs "$$SEED_ADMIN_PASSWORD"

db-shell:
	$(COMPOSE) exec $(DB_SERVICE) psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-payspot}

db-remove-default-plans:
	@echo "Removing default plans (3h, 1day, 1week) where no transaction history exists..."
	@cat <<'SQL' | $(COMPOSE) exec -T $(DB_SERVICE) psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-payspot}
	WITH default_plans AS (
	  SELECT id
	  FROM voucher_packages
	  WHERE code IN ('3h', '1day', '1week')
	),
	blocked_plans AS (
	  SELECT DISTINCT p.id
	  FROM voucher_packages p
	  JOIN transactions tx ON tx.package_id = p.id
	  WHERE p.code IN ('3h', '1day', '1week')
	),
	deletable_plans AS (
	  SELECT id
	  FROM default_plans
	  WHERE id NOT IN (SELECT id FROM blocked_plans)
	)
	DELETE FROM voucher_pool
	WHERE package_id IN (SELECT id FROM deletable_plans);

	WITH default_plans AS (
	  SELECT id
	  FROM voucher_packages
	  WHERE code IN ('3h', '1day', '1week')
	),
	blocked_plans AS (
	  SELECT DISTINCT p.id
	  FROM voucher_packages p
	  JOIN transactions tx ON tx.package_id = p.id
	  WHERE p.code IN ('3h', '1day', '1week')
	),
	deletable_plans AS (
	  SELECT id
	  FROM default_plans
	  WHERE id NOT IN (SELECT id FROM blocked_plans)
	)
	DELETE FROM voucher_packages
	WHERE id IN (SELECT id FROM deletable_plans);

	SELECT
	  t.slug,
	  p.code,
	  p.name,
	  COUNT(tx.id) AS tx_count
	FROM voucher_packages p
	JOIN tenants t ON t.id = p.tenant_id
	LEFT JOIN transactions tx ON tx.package_id = p.id
	WHERE p.code IN ('3h', '1day', '1week')
	GROUP BY t.slug, p.code, p.name
	ORDER BY t.slug, p.code;
	SQL
	@echo "Done. Any rows shown above were retained because they are linked to transaction history."

db-reset:
	@read -p "This will destroy all DB data. Continue? [y/N] " ans; \
	if [ "$$ans" = "y" ] || [ "$$ans" = "Y" ]; then \
		$(MAKE) db-reset-force; \
	else \
		echo "Cancelled"; \
	fi

db-reset-force:
	$(COMPOSE) down -v
	$(COMPOSE) up -d
	$(MAKE) wait-for-services
	$(MAKE) db-migrate

db-backup:
	@mkdir -p $(BACKUP_DIR)
	@ts=$$(date +%Y%m%d_%H%M%S); \
	file="$(BACKUP_DIR)/payspot_$${ts}.sql"; \
	$(COMPOSE) exec -T $(DB_SERVICE) pg_dump -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-payspot} > $$file; \
	echo "Backup written to $$file"

db-restore:
	@if [ -z "$(FILE)" ]; then echo "Usage: make db-restore FILE=$(BACKUP_DIR)/dump.sql"; exit 1; fi
	@if [ ! -f "$(FILE)" ]; then echo "File not found: $(FILE)"; exit 1; fi
	@cat "$(FILE)" | $(COMPOSE) exec -T $(DB_SERVICE) psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-payspot}
	@echo "Restore completed"

shell-app:
	$(COMPOSE) exec $(APP_SERVICE) sh

shell-db:
	$(COMPOSE) exec $(DB_SERVICE) sh

clean:
	rm -rf .next node_modules/.cache

prune:
	docker system prune -f
