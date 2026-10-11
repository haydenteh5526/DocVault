# The public URL of the deployed app (SPA + API behind one HTTPS origin).
# Set `frontend_url` in terraform.tfvars to this value and re-apply so the API
# emits correct absolute URLs for OAuth redirects and verification emails.
output "app_url" {
  value = module.edge.app_url
}

output "cloudfront_domain" {
  value = module.edge.cloudfront_domain
}

output "cloudfront_distribution_id" {
  value = module.edge.cloudfront_distribution_id
}

output "frontend_bucket" {
  value = module.edge.frontend_bucket
}

# Origin the load balancer exposes to CloudFront (HTTP, not for public use).
output "api_origin_url" {
  value = module.compute.api_origin_url
}

output "ecs_cluster_name" {
  value = module.compute.ecs_cluster_name
}

output "api_service_name" {
  value = module.compute.api_service_name
}

output "worker_service_name" {
  value = module.compute.worker_service_name
}

output "s3_bucket" {
  value = module.storage.bucket_name
}

output "db_endpoint" {
  value     = module.database.endpoint
  sensitive = true
}

output "redis_endpoint" {
  value = module.compute.redis_endpoint
}
