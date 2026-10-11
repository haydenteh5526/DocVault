variable "aws_region" {
  description = "AWS region"
  default     = "eu-west-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  default     = "docvault"
}

variable "db_password" {
  description = "Database password"
  sensitive   = true
}

variable "container_image" {
  description = "Docker image URI for the API service"
  default     = "docvault-api:latest"
}

# ---------------------------------------------------------------------------
# Application config → stored in AWS Secrets Manager by the compute module.
# All optional (default "") — the app degrades gracefully when a key is absent,
# but for a working deployment set at least jwt_secret and gemini_api_key.
# ---------------------------------------------------------------------------
variable "jwt_secret" {
  description = "Secret for signing JWTs (set a strong random value for production)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Google Gemini API key (Q&A + embeddings on AWS, since Ollama isn't deployed)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "groq_api_key" {
  description = "Groq API key (Q&A)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "mistral_api_key" {
  description = "Mistral API key (categorisation + Mistral OCR)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "resend_api_key" {
  description = "Resend API key (transactional email)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "frontend_url" {
  description = "Public URL of the web frontend (for CORS / OAuth redirects)"
  type        = string
  default     = ""
}
