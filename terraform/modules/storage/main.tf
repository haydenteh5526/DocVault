variable "project_name" {}

resource "aws_s3_bucket" "documents" {
  bucket = "${var.project_name}-documents-${random_id.suffix.hex}"
  # Allow `terraform destroy` to remove the bucket even if documents were
  # uploaded during a demo. Remove this for any long-lived / production bucket.
  force_destroy = true
  tags          = { Name = "${var.project_name}-documents" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "random_id" "suffix" {
  byte_length = 4
}

output "bucket_name" { value = aws_s3_bucket.documents.id }
output "bucket_arn" { value = aws_s3_bucket.documents.arn }
