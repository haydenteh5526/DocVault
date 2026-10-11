terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "networking" {
  source       = "./modules/networking"
  project_name = var.project_name
}

module "database" {
  source          = "./modules/database"
  project_name    = var.project_name
  vpc_id          = module.networking.vpc_id
  private_subnets = module.networking.private_subnets
  db_password     = var.db_password
}

module "storage" {
  source       = "./modules/storage"
  project_name = var.project_name
}

module "auth" {
  source       = "./modules/auth"
  project_name = var.project_name
}

module "compute" {
  source          = "./modules/compute"
  project_name    = var.project_name
  vpc_id          = module.networking.vpc_id
  public_subnets  = module.networking.public_subnets
  private_subnets = module.networking.private_subnets
  db_endpoint     = module.database.endpoint
  db_password     = var.db_password
  s3_bucket       = module.storage.bucket_name
  container_image = var.container_image

  # Sensitive app config → Secrets Manager (all optional)
  jwt_secret           = var.jwt_secret
  gemini_api_key       = var.gemini_api_key
  groq_api_key         = var.groq_api_key
  mistral_api_key      = var.mistral_api_key
  resend_api_key       = var.resend_api_key
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
  frontend_url         = var.frontend_url
}

# Public HTTPS front door: CloudFront serving the SPA from S3 and proxying
# /api/* to the API load balancer (same origin, so no CORS and no mixed content).
module "edge" {
  source       = "./modules/edge"
  project_name = var.project_name
  alb_dns_name = module.compute.alb_dns_name
}
