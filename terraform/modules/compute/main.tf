variable "project_name" {}
variable "vpc_id" {}
variable "public_subnets" {}
variable "private_subnets" {}
variable "db_endpoint" {}
variable "db_password" { sensitive = true }
variable "s3_bucket" {}
variable "container_image" {}

# Sensitive application config — injected via AWS Secrets Manager (never baked
# into the task definition in plaintext). All optional (default "") so the stack
# still applies for a minimal demo; the app degrades gracefully when a key is absent.
variable "jwt_secret" {
  sensitive = true
  default   = ""
}
variable "gemini_api_key" {
  sensitive = true
  default   = ""
}
variable "groq_api_key" {
  sensitive = true
  default   = ""
}
variable "mistral_api_key" {
  sensitive = true
  default   = ""
}
variable "resend_api_key" {
  sensitive = true
  default   = ""
}
variable "google_client_id" {
  default = ""
}
variable "google_client_secret" {
  sensitive = true
  default   = ""
}
variable "frontend_url" {
  default = ""
}

data "aws_region" "current" {}

# ---------------------------------------------------------------------------
# ECS cluster + shared security group
# ---------------------------------------------------------------------------
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"
}

# ---------------------------------------------------------------------------
# Load balancer security group — the only thing allowed to reach the API tasks
# ---------------------------------------------------------------------------
resource "aws_security_group" "alb" {
  name   = "${var.project_name}-alb-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name   = "${var.project_name}-ecs-sg"
  vpc_id = var.vpc_id

  # Tasks are no longer exposed directly to the internet — only the ALB may
  # reach port 8000. Public ingress now terminates at CloudFront -> ALB.
  ingress {
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---------------------------------------------------------------------------
# Application Load Balancer — stable origin for CloudFront (task IPs change
# on every redeploy, so CloudFront cannot point at them directly).
# ---------------------------------------------------------------------------
resource "aws_lb" "api" {
  name               = "${var.project_name}-alb"
  load_balancer_type = "application"
  internal           = false
  subnets            = var.public_subnets
  security_groups    = [aws_security_group.alb.id]
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-api-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "api" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ---------------------------------------------------------------------------
# Redis (ElastiCache) — job queue + cache for the API and worker
# ---------------------------------------------------------------------------
resource "aws_security_group" "redis" {
  name   = "${var.project_name}-redis-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project_name}-redis-subnet"
  subnet_ids = var.private_subnets
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project_name}-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
}

# ---------------------------------------------------------------------------
# Secrets Manager — sensitive env for the API + worker
# ---------------------------------------------------------------------------
locals {
  # RDS endpoint already includes ":5432"; SQLAlchemy accepts host:port form.
  database_url = "postgresql+asyncpg://docvault:${var.db_password}@${var.db_endpoint}/docvault"
}

resource "aws_secretsmanager_secret" "app" {
  name = "${var.project_name}-app-secrets"
  # Immediate deletion so `terraform destroy` doesn't leave a recovery window
  # blocking a same-name re-apply (convenient for FYP demo environments).
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DATABASE_URL         = local.database_url
    JWT_SECRET           = var.jwt_secret
    GEMINI_API_KEY       = var.gemini_api_key
    GROQ_API_KEY         = var.groq_api_key
    MISTRAL_API_KEY      = var.mistral_api_key
    RESEND_API_KEY       = var.resend_api_key
    GOOGLE_CLIENT_ID     = var.google_client_id
    GOOGLE_CLIENT_SECRET = var.google_client_secret
  })
}

# ---------------------------------------------------------------------------
# IAM roles
# ---------------------------------------------------------------------------
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.project_name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Execution role must read the secret so the ECS agent can inject it at launch.
resource "aws_iam_role_policy" "ecs_secrets" {
  name = "${var.project_name}-secrets-access"
  role = aws_iam_role.ecs_task_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.app.arn
    }]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_s3" {
  name = "${var.project_name}-s3-access"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
      Resource = ["arn:aws:s3:::${var.s3_bucket}", "arn:aws:s3:::${var.s3_bucket}/*"]
    }]
  })
}

# OCR_BACKEND=textract needs Textract permissions on the task role.
resource "aws_iam_role_policy" "ecs_textract" {
  name = "${var.project_name}-textract-access"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["textract:DetectDocumentText", "textract:AnalyzeDocument"]
      Resource = "*"
    }]
  })
}

# ---------------------------------------------------------------------------
# Shared container env + secrets (used by both API and worker)
# ---------------------------------------------------------------------------
locals {
  app_environment = [
    { name = "S3_BUCKET", value = var.s3_bucket },
    { name = "AWS_REGION", value = data.aws_region.current.name },
    { name = "OCR_BACKEND", value = "textract" },
    # No Ollama on ECS — use Gemini for embeddings so vectors are consistent.
    { name = "EMBEDDING_PROVIDER", value = "gemini" },
    { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379/0" },
    { name = "FRONTEND_URL", value = var.frontend_url },
  ]

  app_secrets = [
    { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:DATABASE_URL::" },
    { name = "JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:JWT_SECRET::" },
    { name = "GEMINI_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:GEMINI_API_KEY::" },
    { name = "GROQ_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:GROQ_API_KEY::" },
    { name = "MISTRAL_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:MISTRAL_API_KEY::" },
    { name = "RESEND_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:RESEND_API_KEY::" },
    { name = "GOOGLE_CLIENT_ID", valueFrom = "${aws_secretsmanager_secret.app.arn}:GOOGLE_CLIENT_ID::" },
    { name = "GOOGLE_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:GOOGLE_CLIENT_SECRET::" },
  ]
}

# ---------------------------------------------------------------------------
# API service
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project_name}-api"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name         = "api"
    image        = var.container_image
    portMappings = [{ containerPort = 8000 }]
    environment  = local.app_environment
    secrets      = local.app_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name                              = "${var.project_name}-api"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = 1
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = var.public_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.api]
}

# ---------------------------------------------------------------------------
# Worker service (ARQ background processing: OCR, categorise, embed, cron)
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.project_name}-worker"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.project_name}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name        = "worker"
    image       = var.container_image
    command     = ["arq", "app.worker.WorkerSettings"]
    environment = local.app_environment
    secrets     = local.app_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])
}

resource "aws_ecs_service" "worker" {
  name            = "${var.project_name}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.public_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }
}

# Real, resolvable ALB hostname (HTTP). Public traffic should go via CloudFront
# (see the edge module) which puts HTTPS in front of this origin.
output "alb_dns_name" { value = aws_lb.api.dns_name }
output "api_origin_url" { value = "http://${aws_lb.api.dns_name}" }
output "ecs_cluster_name" { value = aws_ecs_cluster.main.name }
output "api_service_name" { value = aws_ecs_service.api.name }
output "worker_service_name" { value = aws_ecs_service.worker.name }
output "redis_endpoint" { value = aws_elasticache_cluster.redis.cache_nodes[0].address }
