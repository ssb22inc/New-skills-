# CI/CD Pipeline Documentation

This document describes Haven's CI/CD pipelines and deployment workflows.

## Overview

Haven uses GitHub Actions for continuous integration and deployment with multiple deployment targets:

- **GitHub Actions**: Primary CI/CD platform
- **Vercel**: Preview and production deployments (alternative)
- **AWS EKS**: Kubernetes deployments
- **GitLab CI**: Alternative CI/CD (if using GitLab)

## GitHub Actions Workflows

### Main CI Pipeline (`.github/workflows/ci.yml`)

Triggered on:
- Push to `main` or `develop` branches
- Pull requests to `main`

**Jobs:**

1. **Lint & Type Check**
   - ESLint
   - TypeScript type checking
   - Security linting

2. **Test**
   - Unit tests
   - Integration tests
   - Coverage reporting to Codecov

3. **E2E Tests**
   - Playwright tests
   - Accessibility tests
   - Report artifacts

4. **Security Scan**
   - npm audit
   - Snyk vulnerability scanning
   - Trivy filesystem scanning

5. **Build Docker Image**
   - Multi-stage Docker build
   - Push to GitHub Container Registry
   - Cache optimization

6. **Deploy to Staging** (develop branch only)
   - Deploy to staging EKS cluster
   - Smoke tests
   - Slack notification

7. **Deploy to Production** (main branch only)
   - Deploy to production EKS cluster
   - Smoke tests
   - Sentry release tracking
   - Slack notification

### Vercel Deployments

#### Preview Deployments (`.github/workflows/vercel-preview.yml`)

- Triggered on pull requests
- Deploys preview environment
- Comments PR with preview URL
- Runs Lighthouse CI performance tests

#### Production Deployments (`.github/workflows/vercel-production.yml`)

- Triggered on push to `main`
- Deploys to Vercel production
- Purges CDN cache
- Creates Sentry release

### AWS EKS Deployment (`.github/workflows/aws-deploy.yml`)

Manual workflow dispatch with inputs:
- Environment: staging or production
- Image tag to deploy

Performs:
- AWS credential configuration
- ECR login
- EKS kubeconfig update
- Helm deployment
- Smoke tests

## Deployment Targets

### 1. Vercel (Recommended for Quick Setup)

**Advantages:**
- Zero configuration needed
- Automatic preview deployments
- Global CDN
- Serverless functions

**Setup:**

```bash
# Install Vercel CLI
npm install -g vercel

# Link project
vercel link

# Deploy
vercel --prod
```

**Required Secrets:**
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### 2. AWS EKS (Production Grade)

**Advantages:**
- Full control over infrastructure
- Kubernetes orchestration
- Scalable and resilient
- Cost-effective for high traffic

**Setup:**

1. Provision infrastructure with Terraform:
   ```bash
   cd terraform/aws
   terraform init
   terraform apply
   ```

2. Configure kubectl:
   ```bash
   aws eks update-kubeconfig --name haven-production --region us-east-1
   ```

3. Create secrets:
   ```bash
   kubectl create secret generic haven-secrets \
     --from-literal=NEXT_PUBLIC_SUPABASE_URL=... \
     --from-literal=SUPABASE_SERVICE_ROLE_KEY=... \
     --namespace=haven
   ```

4. Deploy with Helm:
   ```bash
   helm upgrade --install haven ./helm/haven \
     --namespace haven \
     --values ./helm/haven/values-production.yaml
   ```

**Required Secrets:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

### 3. Docker Compose (Local/Dev)

**Quick start:**

```bash
# Build and start
npm run deploy:docker

# Or manually
docker-compose up -d

# View logs
docker-compose logs -f app
```

## Environment Variables

### Required Secrets (GitHub)

Configure in: Repository Settings → Secrets and variables → Actions

**Application:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `JWT_SECRET`

**CI/CD:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `GITHUB_TOKEN` (automatically provided)
- `CODECOV_TOKEN`
- `SNYK_TOKEN`
- `SENTRY_AUTH_TOKEN`
- `SLACK_WEBHOOK`

**Vercel (if using):**
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### Test Environment

For CI tests:
- `TEST_SUPABASE_URL`
- `TEST_SUPABASE_ANON_KEY`

## Deployment Workflows

### Staging Deployment

1. Create feature branch:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make changes and commit:
   ```bash
   git add .
   git commit -m "Add new feature"
   ```

3. Push to develop:
   ```bash
   git push origin develop
   ```

4. CI runs automatically:
   - Linting
   - Tests
   - Build
   - Deploy to staging

5. Verify at https://staging.haven.app

### Production Deployment

1. Merge to main:
   ```bash
   git checkout main
   git merge develop
   git push origin main
   ```

2. CI runs automatically:
   - Full test suite
   - Security scans
   - Build Docker image
   - Deploy to production

3. Manual approval required (configured in GitHub)

4. Deployment executes:
   - Helm upgrade
   - Rolling update (zero downtime)
   - Smoke tests
   - Sentry release

5. Verify at https://haven.app

### Rollback

**Using Helm:**

```bash
# List releases
helm history haven -n haven

# Rollback to previous version
helm rollback haven -n haven

# Or use script
npm run rollback:production
```

**Using GitHub Actions:**

1. Go to Actions tab
2. Select "AWS EKS Deployment" workflow
3. Run workflow with previous image tag

## Monitoring Deployments

### Kubernetes

```bash
# Watch deployment progress
kubectl rollout status deployment/haven-app -n haven

# View pods
kubectl get pods -n haven

# View logs
kubectl logs -f deployment/haven-app -n haven

# Describe pod for issues
kubectl describe pod <pod-name> -n haven
```

### Vercel

```bash
# View deployments
vercel ls

# View logs
vercel logs <deployment-url>
```

### Health Checks

All deployments include smoke tests:

```bash
# Check health endpoint
curl https://haven.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "memory": "ok"
  }
}
```

## Performance Monitoring

### Lighthouse CI

Runs on every preview deployment:
- Performance score
- Accessibility score
- Best practices
- SEO score

### Sentry

Automatic error tracking and performance monitoring:
- Release tracking
- Error notifications
- Performance metrics

## Notifications

### Slack Integration

Configure webhook in GitHub secrets: `SLACK_WEBHOOK`

Notifications sent for:
- ✅ Successful deployments
- ❌ Failed deployments
- ⚠️ Security vulnerabilities

Channels:
- `#deployments`: All deployment notifications
- `#alerts`: Critical failures

## Troubleshooting

### Build Failures

1. Check GitHub Actions logs
2. Run locally:
   ```bash
   npm ci
   npm run build
   ```

### Test Failures

```bash
# Run tests locally
npm run test:coverage
npm run e2e
```

### Deployment Failures

**EKS:**
```bash
# Check pod status
kubectl get pods -n haven

# View logs
kubectl logs -f deployment/haven-app -n haven

# Check events
kubectl get events -n haven --sort-by='.lastTimestamp'
```

**Vercel:**
```bash
# Check deployment logs
vercel logs
```

### Rollback Production

```bash
# Quick rollback script
npm run rollback:production

# Or manual Helm rollback
helm rollback haven -n haven
```

## Security Best Practices

1. **Secrets Management**
   - Use GitHub encrypted secrets
   - Rotate secrets regularly
   - Never commit secrets to Git

2. **Branch Protection**
   - Require PR reviews
   - Require status checks
   - No direct pushes to main

3. **Access Control**
   - Limit AWS credentials
   - Use RBAC in Kubernetes
   - Restrict Vercel access

4. **Vulnerability Scanning**
   - Automated Snyk scans
   - npm audit in CI
   - Trivy container scanning

## Cost Optimization

### GitHub Actions

- Use caching for dependencies
- Skip unnecessary jobs
- Use self-hosted runners (optional)

### AWS EKS

- Use spot instances for non-critical workloads
- Enable cluster autoscaling
- Use smaller instances for staging

### Vercel

- Free for hobby projects
- Pro plan for production (~$20/month)

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vercel Documentation](https://vercel.com/docs)
- [AWS EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [Helm Documentation](https://helm.sh/docs/)
