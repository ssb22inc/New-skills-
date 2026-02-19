# Haven Deployment Guide

This guide covers deploying Haven to production using Docker and Kubernetes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- Docker 24+ and Docker Compose 2+
- kubectl 1.28+
- Helm 3+ (for Helm deployment)
- Access to a Kubernetes cluster (EKS, GKE, AKS, or self-hosted)

### Required Services

- Supabase account and project
- Stripe account
- OpenAI API key
- Domain name with SSL certificate

---

## Docker Deployment

### Quick Start (Development)

```bash
# Copy environment file
cp .env.local.example .env.local

# Edit .env.local with your credentials
nano .env.local

# Start development environment
docker-compose -f docker-compose.dev.yml up
```

The application will be available at http://localhost:3000

### Production Deployment with Docker Compose

```bash
# Build production image
docker-compose build

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f app

# Stop services
docker-compose down
```

### Building Production Image

```bash
# Build with build args
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
  --build-arg NEXT_PUBLIC_APP_URL=https://haven.app \
  -t haven/app:latest \
  .

# Run container
docker run -d \
  --name haven-app \
  -p 3000:3000 \
  --env-file .env.production \
  haven/app:latest
```

### Docker Compose Services

The production `docker-compose.yml` includes:

- **app**: Next.js application
- **redis**: Caching and rate limiting
- **nginx** (optional): Reverse proxy
- **prometheus** (optional): Metrics collection
- **grafana** (optional): Metrics visualization

---

## Kubernetes Deployment

### Prerequisites

1. **Kubernetes Cluster**: EKS, GKE, AKS, or self-hosted cluster
2. **kubectl**: Configured to connect to your cluster
3. **NGINX Ingress Controller**: Installed in cluster
4. **cert-manager**: For automatic SSL certificates

### Quick Deploy

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets (replace with your values)
kubectl create secret generic haven-secrets \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY=your-key \
  --from-literal=OPENAI_API_KEY=your-key \
  --from-literal=STRIPE_SECRET_KEY=your-key \
  --namespace=haven

# Deploy application
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Check deployment status
kubectl get pods -n haven
kubectl get svc -n haven
kubectl get ingress -n haven
```

### Step-by-Step Deployment

#### 1. Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

#### 2. Create Secrets

**Option A: Manual Creation**

```bash
kubectl create secret generic haven-secrets \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  --from-literal=NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  --from-literal=OPENAI_API_KEY=your-openai-key \
  --from-literal=STRIPE_SECRET_KEY=your-stripe-key \
  --from-literal=STRIPE_WEBHOOK_SECRET=your-webhook-secret \
  --from-literal=JWT_SECRET=your-jwt-secret \
  --namespace=haven
```

**Option B: External Secrets Operator (Recommended)**

```bash
# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets \
  external-secrets/external-secrets \
  -n external-secrets-system \
  --create-namespace

# Configure secret store (AWS Secrets Manager example)
kubectl apply -f k8s/secret-store.yaml

# Create external secret
kubectl apply -f k8s/external-secret.yaml
```

#### 3. Deploy Application

```bash
# Deploy all resources
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Wait for pods to be ready
kubectl wait --for=condition=ready pod \
  -l app=haven \
  -n haven \
  --timeout=300s
```

#### 4. Configure Ingress

Update `k8s/ingress.yaml` with your domain:

```yaml
spec:
  tls:
    - hosts:
        - your-domain.com
      secretName: haven-tls
  rules:
    - host: your-domain.com
```

Apply the changes:

```bash
kubectl apply -f k8s/ingress.yaml
```

cert-manager will automatically provision SSL certificates.

#### 5. Verify Deployment

```bash
# Check pods
kubectl get pods -n haven

# Check services
kubectl get svc -n haven

# Check ingress
kubectl get ingress -n haven

# View logs
kubectl logs -f deployment/haven-app -n haven

# Check health endpoint
kubectl port-forward svc/haven-service 3000:80 -n haven
curl http://localhost:3000/api/health
```

### Scaling

```bash
# Manual scaling
kubectl scale deployment haven-app --replicas=5 -n haven

# Autoscaling is configured via HPA (Horizontal Pod Autoscaler)
# View HPA status
kubectl get hpa -n haven

# Edit HPA
kubectl edit hpa haven-hpa -n haven
```

### Rolling Updates

```bash
# Update image
kubectl set image deployment/haven-app \
  haven=haven/app:v1.1.0 \
  -n haven

# Check rollout status
kubectl rollout status deployment/haven-app -n haven

# Rollback if needed
kubectl rollout undo deployment/haven-app -n haven

# View rollout history
kubectl rollout history deployment/haven-app -n haven
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbGc...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJhbGc...` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | `whsec_...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | `pk_...` |
| `JWT_SECRET` | JWT signing secret | Random string |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `LOG_LEVEL` | Logging level | `info` |
| `NODE_ENV` | Environment | `production` |
| `APP_VERSION` | Application version | `1.0.0` |

---

## Monitoring

### Health Checks

**Endpoint**: `/api/health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-06T20:00:00Z",
  "version": "1.0.0",
  "uptime": 12345,
  "checks": {
    "database": { "status": "healthy", "latency": 15 },
    "redis": { "status": "healthy", "latency": 2 },
    "memory": { "status": "healthy", "latency": 450 }
  }
}
```

### Kubernetes Probes

**Liveness Probe**: Restarts container if unhealthy
- Path: `/api/health`
- Initial Delay: 30s
- Period: 10s
- Timeout: 5s
- Failure Threshold: 3

**Readiness Probe**: Removes from load balancer if unhealthy
- Path: `/api/health`
- Initial Delay: 5s
- Period: 5s
- Timeout: 3s
- Failure Threshold: 3

### Viewing Logs

```bash
# View application logs
kubectl logs -f deployment/haven-app -n haven

# View logs from all pods
kubectl logs -f -l app=haven -n haven --all-containers=true

# View specific container logs
kubectl logs -f pod-name -c haven -n haven

# View previous container logs (if crashed)
kubectl logs --previous pod-name -n haven
```

### Metrics

Prometheus metrics are exposed at `/api/metrics` (if configured).

```bash
# Port-forward to access metrics
kubectl port-forward svc/haven-service 3000:80 -n haven

# View metrics
curl http://localhost:3000/api/metrics
```

---

## Troubleshooting

### Pod Not Starting

```bash
# Describe pod to see events
kubectl describe pod <pod-name> -n haven

# Check logs
kubectl logs <pod-name> -n haven

# Common issues:
# 1. Image pull errors - check image name and registry access
# 2. Secret not found - verify secrets exist
# 3. Resource limits - check node resources
```

### Application Errors

```bash
# Check application logs
kubectl logs -f deployment/haven-app -n haven

# Check environment variables
kubectl exec -it <pod-name> -n haven -- env | grep -i supabase

# Test health endpoint
kubectl exec -it <pod-name> -n haven -- wget -O- http://localhost:3000/api/health
```

### Database Connection Issues

```bash
# Test Supabase connection
kubectl exec -it <pod-name> -n haven -- sh
# Inside container:
curl -I https://your-project.supabase.co

# Check secrets
kubectl get secret haven-secrets -n haven -o yaml
```

### Ingress Not Working

```bash
# Check ingress configuration
kubectl describe ingress haven-ingress -n haven

# Check ingress controller logs
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller

# Verify DNS
nslookup your-domain.com

# Check certificate
kubectl describe certificate haven-tls -n haven
```

### High Memory Usage

```bash
# Check pod resource usage
kubectl top pods -n haven

# Describe pod for resource limits
kubectl describe pod <pod-name> -n haven

# Adjust resource limits in deployment.yaml
resources:
  limits:
    memory: "2Gi"  # Increase if needed
```

### Pod Restarts

```bash
# Check pod restart count
kubectl get pods -n haven

# View pod events
kubectl describe pod <pod-name> -n haven

# Check previous logs
kubectl logs --previous <pod-name> -n haven

# Common causes:
# 1. OOMKilled - increase memory limits
# 2. Health check failures - check /api/health
# 3. Application crashes - check logs
```

---

## Security Best Practices

1. **Use Secrets Management**: Never commit secrets to Git
2. **Enable RBAC**: Limit pod permissions
3. **Use Network Policies**: Restrict pod-to-pod communication
4. **Scan Images**: Use vulnerability scanners (Trivy, Snyk)
5. **Run as Non-Root**: Containers run as user 1001
6. **Read-Only Filesystem**: Root filesystem is read-only
7. **Resource Limits**: Always set CPU and memory limits
8. **TLS Everywhere**: Use HTTPS for all external communication

---

## Backup and Recovery

### Database Backups

Supabase handles database backups automatically. To create manual backups:

```bash
# Use Supabase CLI or dashboard to trigger backups
```

### Application State

Haven is stateless. All state is stored in:
- Supabase (database)
- Stripe (payments)
- Supabase Storage (files)

No application-level backups needed.

---

## Performance Tuning

### Horizontal Scaling

```bash
# Scale based on traffic
kubectl scale deployment haven-app --replicas=10 -n haven
```

### Vertical Scaling

Update resource requests/limits in `k8s/deployment.yaml`:

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "1Gi"
  limits:
    cpu: "2000m"
    memory: "2Gi"
```

### Caching

- Redis is used for rate limiting and caching
- Static assets are cached by Next.js
- CDN caching via Ingress annotations

---

## Support

For deployment issues:
- Email: devops@haven.app
- Documentation: https://docs.haven.app
- GitHub Issues: https://github.com/haven/haven/issues

---

Last updated: January 6, 2026
