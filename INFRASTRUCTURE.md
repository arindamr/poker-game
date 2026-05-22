# Infrastructure Reference

Generated from analysis of `infra/` (Terraform), `deployment/aws/`, and `docker/`. Reference deployment is a **single-node Amazon Lightsail** instance running the whole stack via Docker Compose.

Topology: one Lightsail VM → Docker Compose stack (nginx · frontend · backend · websocket · postgres · redis). There is no managed DB/cache, no load balancer, no autoscaling — deliberately cost-conscious (see [`infra/README.md`](infra/README.md)).

---

## 1. Resources Deployed

### Terraform providers ([`infra/providers.tf`](infra/providers.tf))

| Provider | Version | Use |
|----------|---------|-----|
| `hashicorp/aws` | `~> 5.0` | Lightsail + CloudWatch |
| `hashicorp/external` | `~> 2.3` | Runs a bash script as a data source |
| `hashicorp/random` | `~> 3.6` | Generates JWT secrets |

Requires Terraform `>= 1.5.0`. AWS region defaults to `eu-west-2`.

### AWS resources ([`infra/main.tf`](infra/main.tf))

| Resource | Terraform address | Notes |
|----------|-------------------|-------|
| Lightsail instance | `aws_lightsail_instance.app` ([main.tf:32](infra/main.tf#L32)) | `amazon_linux_2023`, bundle `medium_2_0` (2 GB / 2 vCPU). Boots via `user_data` template. |
| Static IP | `aws_lightsail_static_ip.app` ([main.tf:75](infra/main.tf#L75)) | `count` = 0/1 — **created only if it doesn't already exist** (see external lookup below). |
| Static IP attachment | `aws_lightsail_static_ip_attachment.app` ([main.tf:80](infra/main.tf#L80)) | Conditional — attaches the IP unless already attached to this instance. |
| Firewall | `aws_lightsail_instance_public_ports.app` ([main.tf:87](infra/main.tf#L87)) | Opens `var.allowed_tcp_ports` — default **22, 80, 443**. |
| CPU alarm | `aws_cloudwatch_metric_alarm.cpu_high` ([main.tf:100](infra/main.tf#L100)) | `count` = `var.enable_alarms`. Fires when CPU > 75% for 3×60 s. |
| Status alarm | `aws_cloudwatch_metric_alarm.status_failed` ([main.tf:119](infra/main.tf#L119)) | `count` = `var.enable_alarms`. Fires on any failed status check. |
| DNS zone | `aws_lightsail_domain.main` ([main.tf:138](infra/main.tf#L138)) | `count` — only when `create_lightsail_dns_zone && domain_name != ""`. |
| DNS A records | `aws_lightsail_domain_entry.root_a`, `.api_a` ([main.tf:143](infra/main.tf#L143)) | Root `@` and `api` subdomain → static IP. Conditional. |
| JWT secrets | `random_password.jwt_secret`, `.jwt_refresh_secret` ([main.tf:22](infra/main.tf#L22)) | 64-char, no special chars. Fed into the instance `.env`. |

### Data source — static IP lookup

`data.external.static_ip_lookup` ([main.tf:5](infra/main.tf#L5)) runs [`scripts/lightsail-static-ip-lookup.sh`](infra/scripts/lightsail-static-ip-lookup.sh), which calls `aws lightsail get-static-ip` and returns `{ exists, ip_address, attached_to, account_id }`. The `locals` block ([main.tf:15](infra/main.tf#L15)) uses this so an existing static IP is **reused, not recreated** — making `terraform apply` idempotent across re-runs and `destroy`/`apply` cycles. Requires `jq` and AWS CLI locally.

### Outputs ([`infra/outputs.tf`](infra/outputs.tf))

`instance_name`, `instance_public_ip`, `instance_private_ip`, `api_url`, `ssh_command`, `bootstrap_status_path` / `_json_path`, `bootstrap_check_command`, the static-IP lookup fields, and `generated_jwt_secret` / `generated_jwt_refresh_secret` (both `sensitive`).

### Alternative IaC (not the active path)

[`deployment/aws/cloudformation-template.json`](deployment/aws/cloudformation-template.json) is a parallel CloudFormation definition. The Terraform module in `infra/` is the documented, current path; the CloudFormation file is a legacy/alternative artifact.

---

## 2. Environment Configuration

### Terraform variables ([`infra/variables.tf`](infra/variables.tf))

Key inputs (all have defaults except `db_password`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `aws_region` / `availability_zone` | `eu-west-2` / `eu-west-2a` | Placement |
| `bundle_id` / `blueprint_id` | `medium_2_0` / `amazon_linux_2023` | Instance size / OS |
| `repo_clone_url` / `repo_branch` / `app_dir` | this repo / `main` / `/opt/poker-game` | What the instance bootstraps |
| `cors_origin` | localhost list | Backend CORS allow-list — **must include the browser origin** |
| `admin_emails` | `""` | Backend admin allow-list |
| `db_name` / `db_user` / `db_password` | `poker_game` / `postgres` / *(required)* | Postgres. `db_password` is `sensitive`, validated ≥ 12 chars and must not be the placeholder. |
| `node_env` / `log_level` / `seed_demo_user` | `production` / `info` / `false` | Backend runtime |
| `install_nginx_service` | `true` | Start the nginx container on first boot |
| `allowed_tcp_ports` | `[22, 80, 443]` | Lightsail firewall |
| `enable_alarms` / `create_lightsail_dns_zone` | `true` / `false` | Optional features |

`aws_lightsail_instance` has `lifecycle.precondition` blocks ([main.tf:56](infra/main.tf#L56)) that fail the plan early if bootstrap inputs (`repo_clone_url`, `repo_branch`, `app_dir`, `cors_origin`, `db_password`) are blank.

### Secrets handling

- **Local config:** `infra/terraform.tfvars` holds real values (DB password, admin email). It is **correctly git-ignored** via [`infra/.gitignore`](infra/.gitignore) (`terraform.tfvars`, `terraform.tfstate*`, `.terraform/`). Only `terraform.tfvars.example` is committed. Verified: `git ls-files` tracks no `.tfvars`/`.tfstate`/`.env`.
- **JWT secrets:** never stored in source — generated by `random_password` at apply time and written into the instance `.env` by bootstrap.
- **Runtime `.env`:** generated **on the instance** at `/opt/poker-game/deployment/aws/.env` by the bootstrap script, `chmod 600`, owned by `ec2-user`. Never committed.

### The runtime `.env` (written by [`user_data.sh.tmpl:88`](infra/user_data.sh.tmpl#L88))

Terraform interpolates these into the cloud-init template, which writes them to `deployment/aws/.env`:

```
DB_HOST=poker_postgres   DB_PORT=5432   DB_NAME / DB_USER / DB_PASSWORD
REDIS_HOST=poker_redis   REDIS_PORT=6379   REDIS_PASSWORD=(empty)
JWT_SECRET / JWT_REFRESH_SECRET   (from random_password)
NODE_ENV / LOG_LEVEL / PORT=3000 / CORS_ORIGIN / SEED_DEMO_USER / ADMIN_EMAILS
```

This `.env` is the contract between Terraform and Docker Compose — Compose reads it via `${VAR}` interpolation / `--env-file`.

---

## 3. Deployment Process

### First deploy (provision)

1. `cd infra && cp terraform.tfvars.example terraform.tfvars`, then edit `db_password`, `cors_origin`, `admin_emails` (and domain vars if used).
2. `terraform init && terraform plan && terraform apply`.
3. Terraform generates JWT secrets, resolves the static IP (reuse or create), and creates the Lightsail instance with `user_data` = rendered [`user_data.sh.tmpl`](infra/user_data.sh.tmpl).
4. **Cloud-init bootstrap** runs on the instance ([user_data.sh.tmpl](infra/user_data.sh.tmpl)):
   - `dnf install docker git`; install Docker Compose plugin (`v2.29.7`) + Buildx (`v0.18.0`).
   - `git clone` the repo to `/opt/poker-game`, checkout `repo_branch`.
   - Write `deployment/aws/.env` (mode 600).
   - Run [`install-systemd-service.sh`](deployment/aws/install-systemd-service.sh) → installs `poker-stack.service` so the stack restarts on reboot.
   - `docker compose up -d --build` for `postgres redis backend websocket [frontend] [nginx]`.
   - `docker exec poker_backend npm run migrate` — apply DB migrations.
   - `curl localhost:3000/health` — fail the bootstrap if unhealthy.
   - Writes status markers to `/var/lib/poker-bootstrap/status` and `status.json`; logs to `/var/log/poker-bootstrap.log`.
5. `terraform output bootstrap_check_command` prints an SSH one-liner to verify.

### Redeploy (code change, no infra change)

SSH to the instance and run [`deployment/aws/deploy.sh [branch]`](deployment/aws/deploy.sh): `git pull --ff-only`, `docker compose up -d --build`, wait for healthy containers, `npm run migrate`, re-install the systemd unit if root. The instance also auto-recovers on reboot via `poker-stack.service`.

### Full rebuild

[`infra/scripts/recreate-lightsail.sh`](infra/scripts/recreate-lightsail.sh): `terraform destroy` → `apply`, wait for bootstrap, **update remote `CORS_ORIGIN` to the new IP**, then run `deploy.sh`.

### Container images

- Backend: [`backend/Dockerfile`](backend/Dockerfile) — `node:18-alpine`, `npm ci --only=production`, non-root `nodejs` user, `dumb-init` entrypoint, `HEALTHCHECK` on `/health`, `CMD node src/index.js`.
- Frontend: [`frontend/Dockerfile`](frontend/Dockerfile) — `node:20-alpine`, `npm run build`, `EXPOSE 3002`, `next start -p 3002`.
- A second backend Dockerfile, [`docker/Dockerfile.backend`](docker/Dockerfile.backend), is used by the **dev** compose file only.

---

## 4. Integration: Frontend ⇄ Backend ⇄ Infra

### Request path (production)

```
Browser ──:80──▶ nginx (poker_nginx) ──┬─ /                → frontend:3002  (Next.js)
                                       ├─ /api , /api/auth → backend:3000
                                       ├─ /socket.io/      → backend:3000   (Socket.IO)
                                       └─ /health          → backend:3000
                          backend ──▶ postgres:5432 , redis:6379   (poker_network bridge)
```

- Only port **80** is the public entrypoint (22 for SSH, 443 reserved). Backend `3000` / websocket `3001` are **not** publicly exposed — nginx ([`deployment/aws/nginx.conf`](deployment/aws/nginx.conf)) fronts everything and adds per-zone rate limiting (`api_limit` 100 r/m, `ws_limit` 10 r/s, `auth_limit` 5 r/m).
- nginx terminates client connections and sets `X-Forwarded-For` / `X-Forwarded-Proto`; the backend trusts one proxy hop (`app.set('trust proxy', 1)`).

### Frontend → backend wiring

- The frontend container is built with `NEXT_PUBLIC_API_URL: ""` ([docker-compose.yml:10](deployment/aws/docker-compose.yml#L10)) → the client uses **same-origin** requests. `lib/api.ts` `API_URL` falls back to `''`, and the table page connects Socket.IO to the same origin. So every API/WS call goes through nginx on port 80 — no CORS hop in the browser for the normal path.

### Infra → backend wiring (the `.env` contract)

- Terraform `random_password` → `.env` `JWT_SECRET`/`JWT_REFRESH_SECRET` → backend container env → `config/env.js`. The 64-char generated secrets satisfy the backend's `server.js` guard that refuses to start in non-development with the dev-default secrets.
- `var.cors_origin` → `.env` `CORS_ORIGIN` → backend `config.cors.origin`. **This must contain the browser origin** (the Lightsail IP or domain); `recreate-lightsail.sh` rewrites it automatically after a new IP is assigned.
- `var.db_password` → `.env` → consumed by **both** the `postgres` container (`POSTGRES_PASSWORD`) and the `backend`/`websocket` containers (`DB_PASSWORD`) — single source of truth.
- DB migrations are applied imperatively (`docker exec poker_backend npm run migrate`) during bootstrap and every `deploy.sh` run.

### Dev vs. prod compose

| | `docker/docker-compose.yml` (dev) | `deployment/aws/docker-compose.yml` (prod) |
|---|---|---|
| Backend image | `docker/Dockerfile.backend` | `backend/Dockerfile` |
| Backend command | `npm run dev` (nodemon) | image default |
| Services | postgres, redis, backend | + frontend, websocket, nginx |
| Postgres init mount | `backend/migrations` → `initdb.d` | `deployment/db/migrations` → `initdb.d` (empty) |
| Source bind-mount | `./backend:/app` | `../../backend/src`, `../../backend/migrations` |

---

## 5. Known Discrepancies

See [TODO.md](TODO.md) **Infrastructure** section (I1–I5). In brief: the dedicated `websocket` service/upstream is unused (Socket.IO is served by `backend`); the "production" compose bind-mounts host source over the built image; `deployment/db/migrations` is empty; backend has two Dockerfiles; and the `api_url` output suggests `http://<ip>:3000`, a port the firewall does not open.
