# ============================================
# Terraform Variables — Haven AWS Infrastructure
# ============================================

variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (staging | production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "haven-production"
}

variable "domain_name" {
  description = "Primary domain name for the application"
  type        = string
  default     = "haven.app"
}

variable "certificate_arn" {
  description = "ARN of the ACM certificate for HTTPS. Leave empty to create one."
  type        = string
  default     = ""
}

variable "rds_instance_class" {
  description = "RDS instance class. Use db.r6g.large or larger for production workloads."
  type        = string
  default     = "db.t3.medium"

  validation {
    condition = !(
      var.environment == "production" &&
      can(regex("^db\\.t[23]\\.", var.rds_instance_class))
    )
    error_message = "Production requires a non-burstable RDS instance class (e.g. db.r6g.large). db.t2/t3 classes are not suitable for production."
  }
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type. Use cache.r6g.large or larger for production."
  type        = string
  default     = "cache.t3.micro"

  validation {
    condition = !(
      var.environment == "production" &&
      can(regex("^cache\\.t[23]\\.", var.redis_node_type))
    )
    error_message = "Production requires a non-burstable ElastiCache node type (e.g. cache.r6g.large). cache.t2/t3 classes are not suitable for production rate-limiting workloads."
  }
}

variable "db_backup_retention_days" {
  description = "Number of days to retain automated RDS backups (7 staging, 30 production recommended)."
  type        = number
  default     = 7

  validation {
    condition     = var.db_backup_retention_days >= 1 && var.db_backup_retention_days <= 35
    error_message = "db_backup_retention_days must be between 1 and 35."
  }
}

variable "eks_node_instance_types" {
  description = "EC2 instance types for EKS node group"
  type        = list(string)
  default     = ["t3.large"]
}

variable "eks_node_min_size" {
  description = "Minimum number of EKS nodes"
  type        = number
  default     = 3

  validation {
    condition     = var.eks_node_min_size >= 1
    error_message = "eks_node_min_size must be at least 1."
  }
}

variable "eks_node_max_size" {
  description = "Maximum number of EKS nodes"
  type        = number
  default     = 10

  validation {
    condition     = var.eks_node_max_size >= var.eks_node_min_size
    error_message = "eks_node_max_size must be greater than or equal to eks_node_min_size."
  }
}

variable "eks_node_desired_size" {
  description = "Desired number of EKS nodes"
  type        = number
  default     = 3
}

variable "cloudfront_price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "cloudfront_price_class must be one of: PriceClass_100, PriceClass_200, PriceClass_All."
  }
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "eks_public_access_cidrs" {
  description = "CIDRs allowed to reach the EKS public API endpoint. Restrict to your VPN/office ranges in production."
  type        = list(string)
  # Default to RFC 1918 private ranges only. Override in production tfvars with
  # your VPN egress IPs or set to [] to disable public access entirely.
  default = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
}

variable "enable_waf" {
  description = "Enable AWS WAF v2 Web ACL on CloudFront. Always true in production."
  type        = bool
  default     = true
}
