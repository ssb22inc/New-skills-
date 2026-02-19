output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks.cluster_security_group_id
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.haven.repository_url
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = aws_elasticache_cluster.haven.cache_nodes[0].address
}

output "redis_port" {
  description = "Redis port"
  value       = aws_elasticache_cluster.haven.cache_nodes[0].port
}

output "s3_bucket_name" {
  description = "S3 bucket name for uploads"
  value       = aws_s3_bucket.uploads.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.haven.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.haven.domain_name
}

output "secrets_manager_arn" {
  description = "Secrets Manager secret ARN"
  value       = aws_secretsmanager_secret.haven.arn
}
