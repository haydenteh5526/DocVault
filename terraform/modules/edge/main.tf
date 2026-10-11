# ---------------------------------------------------------------------------
# Edge module — public HTTPS front door for the whole app.
#
# One CloudFront distribution serves both halves of the app from a single
# origin, which matters because the React app calls the API with same-origin
# relative paths (`const BASE = '/api/v1'`):
#
#   browser --HTTPS--> CloudFront ---> S3 (static SPA)          [default]
#                                 \--> ALB -> ECS API           [/api/*, /health, /docs, ...]
#
# Consequences of this shape:
#   * HTTPS is free — the default *.cloudfront.net certificate is used, so no
#     custom domain and no ACM certificate are required. (A public ACM cert can
#     only be issued for a domain you control, so without this the stack could
#     not offer HTTPS at all without buying a domain.)
#   * No CORS configuration and no mixed-content errors, because the browser
#     sees one origin.
#   * The API endpoint is stable across redeploys (ECS task IPs are not).
# ---------------------------------------------------------------------------

variable "project_name" {}
variable "alb_dns_name" {
  description = "DNS name of the API load balancer (CloudFront origin)"
}

# ---------------------------------------------------------------------------
# Frontend bucket — private; reachable only through CloudFront (OAC)
# ---------------------------------------------------------------------------
resource "random_id" "suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project_name}-frontend-${random_id.suffix.hex}"
  # Demo environments are torn down with `terraform destroy`; allow removal even
  # though the CD pipeline will have synced build artefacts into the bucket.
  force_destroy = true
  tags          = { Name = "${var.project_name}-frontend" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# CloudFront
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Forward everything the API needs (auth headers, cookies, query strings) and
# cache nothing — these are dynamic, per-user responses.
resource "aws_cloudfront_cache_policy" "api" {
  name        = "${var.project_name}-api-no-cache"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip = true
    cookies_config {
      cookie_behavior = "all"
    }
    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Authorization", "Content-Type", "Origin", "Referer"]
      }
    }
    query_strings_config {
      query_string_behavior = "all"
    }
  }
}

locals {
  s3_origin_id  = "s3-frontend"
  alb_origin_id = "alb-api"

  # Paths that must reach the API rather than the static site.
  api_path_patterns = ["/api/*", "/health", "/health/*", "/docs", "/docs/*", "/openapi.json", "/redoc", "/metrics"]
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} — SPA + API front door"
  default_root_object = "index.html"
  # PriceClass_100 = North America + Europe only; cheapest tier.
  price_class = "PriceClass_100"

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    origin_id   = local.alb_origin_id
    domain_name = var.alb_dns_name

    custom_origin_config {
      http_port  = 80
      https_port = 443
      # The ALB listener is HTTP only (an HTTPS listener would need an ACM cert,
      # which needs a domain). CloudFront terminates TLS for the public.
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Static SPA assets
  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # AWS managed "CachingOptimized"
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # API + operational endpoints
  dynamic "ordered_cache_behavior" {
    for_each = local.api_path_patterns
    content {
      path_pattern           = ordered_cache_behavior.value
      target_origin_id       = local.alb_origin_id
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      cache_policy_id        = aws_cloudfront_cache_policy.api.id
    }
  }

  # Client-side routing: unknown paths are React Router routes, not missing
  # files, so return the SPA shell instead of an S3 error document.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    # Default CloudFront certificate → HTTPS on *.cloudfront.net at no cost and
    # with no domain registration.
    cloudfront_default_certificate = true
  }
}

# Allow only this distribution to read the bucket.
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
        }
      }
    }]
  })
}

output "frontend_bucket" { value = aws_s3_bucket.frontend.id }
output "cloudfront_distribution_id" { value = aws_cloudfront_distribution.main.id }
output "cloudfront_domain" { value = aws_cloudfront_distribution.main.domain_name }
output "app_url" { value = "https://${aws_cloudfront_distribution.main.domain_name}" }
