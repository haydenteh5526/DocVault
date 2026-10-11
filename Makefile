# DocVault — developer commands
# Usage: make <target>

.PHONY: help up down logs build test test-unit lint fmt frontend-build frontend-dev migrate health smoke clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Start all services (api, db, minio, redis, web)
	docker compose up -d

down: ## Stop all services
	docker compose down

build: ## Rebuild the API image
	docker compose up -d --build api

logs: ## Tail API logs
	docker compose logs -f api

test: ## Run full backend test suite (needs DB)
	docker compose exec api sh -c "python -m pip install -q -r dev-requirements.txt && python -m pytest tests/ -v"

test-unit: ## Run fast unit tests (no DB required)
	docker compose exec api sh -c "python -m pip install -q -r dev-requirements.txt && python -m pytest tests/test_chunking.py tests/test_cache.py tests/test_retry.py -v"

cov: ## Run tests with coverage report
	docker compose exec api sh -c "python -m pip install -q -r dev-requirements.txt && python -m pytest tests/ --cov=app --cov-report=term-missing"

lint: ## Lint backend with ruff
	cd backend && ruff check app/ tests/

fmt: ## Auto-fix backend lint issues
	cd backend && ruff check app/ tests/ --fix

frontend-build: ## Type-check and build the frontend
	cd frontend && npm run build

frontend-dev: ## Start the frontend dev server
	cd frontend && npm run dev

migrate: ## Run database migrations
	docker compose exec api alembic upgrade head

health: ## Check API readiness (DB/S3/AI/cache)
	curl -s http://localhost:8000/health/ready

smoke: ## Run the end-to-end pipeline smoke test (needs full stack + AI keys)
	docker compose exec api python scripts/e2e_smoke.py

metrics: ## Show Prometheus metrics
	curl -s http://localhost:8000/metrics

clean: ## Stop services and remove volumes (DESTROYS DATA)
	docker compose down -v
