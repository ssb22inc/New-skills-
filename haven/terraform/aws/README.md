# Haven AWS Infrastructure

This directory contains Terraform configuration for provisioning Haven's AWS infrastructure.

## Prerequisites

- Terraform >= 1.5.0
- AWS CLI configured with appropriate credentials
- kubectl installed
- Helm installed

## Infrastructure Components

This Terraform configuration provisions:

- **VPC**: Multi-AZ VPC with public and private subnets
- **EKS Cluster**: Kubernetes cluster with managed node groups
- **ECR**: Container registry for Docker images
- **ElastiCache**: Redis cluster for caching
- **S3**: Bucket for file uploads
- **CloudFront**: CDN for static assets
- **Secrets Manager**: Secure secret storage

## Getting Started

### 1. Initialize Terraform

```bash
cd terraform/aws
terraform init
```

### 2. Create Terraform Variables

Copy the example file and customize:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
aws_region  = "us-east-1"
environment = "production"
cluster_name = "haven-production"
node_min_size = 3
node_max_size = 10
```

### 3. Plan Changes

```bash
terraform plan
```

### 4. Apply Configuration

```bash
terraform apply
```

This will take 15-20 minutes to provision the entire infrastructure.

### 5. Configure kubectl

After the EKS cluster is created:

```bash
aws eks update-kubeconfig --name haven-production --region us-east-1
```

Verify connection:

```bash
kubectl get nodes
```

## State Management

Terraform state is stored in S3 with DynamoDB locking for team collaboration.

**Important**: Create the S3 bucket and DynamoDB table manually before running Terraform:

```bash
# Create S3 bucket for state
aws s3api create-bucket \
  --bucket haven-terraform-state \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket haven-terraform-state \
  --versioning-configuration Status=Enabled

# Create DynamoDB table for locking
aws dynamodb create-table \
  --table-name haven-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

## Environments

### Staging

```bash
terraform workspace new staging
terraform workspace select staging
terraform apply -var="environment=staging" -var="cluster_name=haven-staging"
```

### Production

```bash
terraform workspace new production
terraform workspace select production
terraform apply
```

## Outputs

After applying, Terraform will output:

- `cluster_endpoint`: EKS cluster API endpoint
- `ecr_repository_url`: Docker registry URL
- `redis_endpoint`: Redis cluster endpoint
- `cloudfront_distribution_id`: CloudFront distribution ID

View outputs:

```bash
terraform output
```

## Updating Infrastructure

1. Make changes to `.tf` files
2. Run `terraform plan` to preview changes
3. Run `terraform apply` to apply changes

## Destroying Infrastructure

**Warning**: This will delete all resources!

```bash
terraform destroy
```

## Cost Estimation

Approximate monthly costs (production):

- EKS Cluster: $75
- EC2 Nodes (3x t3.large): ~$150
- ElastiCache (cache.t3.micro): ~$15
- NAT Gateway: ~$35
- Data transfer: Variable

**Total**: ~$275-350/month (excluding data transfer)

## Security Best Practices

1. **Secrets**: Never commit secrets to Git
2. **IAM**: Use least privilege principle
3. **Encryption**: All data encrypted at rest and in transit
4. **Network**: Private subnets for all application resources
5. **Monitoring**: CloudWatch logs and metrics enabled

## Troubleshooting

### EKS Node Group Not Scaling

Check autoscaling group:

```bash
aws autoscaling describe-auto-scaling-groups \
  --query "AutoScalingGroups[?contains(AutoScalingGroupName, 'haven')]"
```

### Can't Connect to Cluster

Update kubeconfig:

```bash
aws eks update-kubeconfig --name haven-production --region us-east-1
```

### Terraform State Lock

If state is locked, check DynamoDB:

```bash
aws dynamodb scan --table-name haven-terraform-locks
```

Force unlock (use carefully):

```bash
terraform force-unlock <LOCK_ID>
```

## Additional Resources

- [Terraform AWS Provider Docs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [Terraform Modules](https://registry.terraform.io/browse/modules)
