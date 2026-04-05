# 🔭 InfraWatch — Real-Time Infrastructure Monitoring Platform

A production-grade DevOps project that monitors system metrics in real-time using a distributed agent-based architecture.

## 🏗️ Architecture
```
Developer pushes code to GitHub
         ↓
GitHub Actions CI/CD Pipeline
  ├── Run Tests
  ├── Build Docker Images
  └── Push to DockerHub
         ↓
Kubernetes (minikube) Cluster
  ├── infrawatch-agent (DaemonSet)
  │     └── Collects CPU, RAM, Disk, Network
  │           └── Pushes to Backend every 10s
  ├── infrawatch-backend (2-10 replicas via HPA)
  │     ├── REST API (7 endpoints)
  │     ├── Stores metrics in MongoDB
  │     └── Exposes /metrics for Prometheus
  ├── MongoDB
  │     ├── Time-series metric storage
  │     ├── TTL indexes (auto-delete after 7 days)
  │     └── Aggregation pipelines
  ├── Prometheus
  │     └── Scrapes backend metrics every 15s
  └── Grafana
        └── Live dashboards + alerting
         ↓
k6 Load Testing → 500 concurrent users
         ↓
HPA auto-scales backend 2 → 4 pods 🚀
```

## 🛠️ Tech Stack

| Category | Technology |
|----------|-----------|
| Containerization | Docker |
| Orchestration | Kubernetes (minikube) |
| CI/CD | GitHub Actions |
| Database | MongoDB (time-series) |
| Monitoring | Prometheus + Grafana |
| Load Testing | k6 |
| Backend | Node.js + Express |
| Metrics Collection | systeminformation |

## ✨ Features

- **Real-time metrics** — CPU, RAM, Disk, Network collected every 10 seconds
- **Auto-scaling** — Kubernetes HPA scales 2→10 pods under load
- **Smart alerting** — Auto-generates alerts when CPU > 80% or RAM > 85%
- **Deployment tracking** — Every CI/CD deployment recorded in MongoDB
- **TTL indexes** — Old metrics auto-deleted after 7 days
- **MongoDB aggregations** — Real-time avg/max stats per agent
- **Load tested** — Verified under 500 concurrent users

## 🚀 Quick Start

### Prerequisites
- Docker
- Kubernetes (minikube)
- kubectl
- Helm
- k6

### Run with Docker Compose (local)
```bash
git clone https://github.com/dot05/infrawatch-monitoring.git
cd infrawatch-monitoring
docker compose up --build
```

### Deploy to Kubernetes
```bash
minikube start --cpus=4 --memory=8192
kubectl apply -f k8s/manifests/namespace.yaml
kubectl apply -f k8s/manifests/mongodb-deployment.yaml
kubectl apply -f k8s/manifests/backend-deployment.yaml
kubectl apply -f k8s/manifests/agent-deployment.yaml
minikube addons enable metrics-server
```

### Run Load Test
```bash
export K8S_URL=$(minikube service infrawatch-backend -n infrawatch --url)
k6 run --env BASE_URL=$K8S_URL load-testing/load-test.js
```

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check + MongoDB status |
| GET | /metrics | Prometheus metrics |
| POST | /api/metrics | Agent pushes metrics |
| GET | /api/metrics | Query metrics with filters |
| GET | /api/metrics/summary | MongoDB aggregation stats |
| GET | /api/agents | List all active agents |
| POST | /api/deployments | Record deployment event |
| GET | /api/deployments | Deployment history |
| GET | /api/alerts | Active alerts |
| PATCH | /api/alerts/:id/resolve | Resolve an alert |

## 📁 Project Structure
```
infrawatch/
├── agent/                  # Metrics collection agent
│   ├── src/index.js
│   ├── Dockerfile
│   └── package.json
├── backend/                # REST API + MongoDB
│   ├── src/index.js
│   ├── Dockerfile
│   └── package.json
├── k8s/manifests/          # Kubernetes manifests
│   ├── namespace.yaml
│   ├── mongodb-deployment.yaml
│   ├── backend-deployment.yaml
│   └── agent-deployment.yaml
├── monitoring/
│   └── prometheus/
│       └── prometheus.yml
├── load-testing/
│   └── load-test.js        # k6 load test
├── .github/workflows/
│   └── ci-cd.yml           # GitHub Actions pipeline
└── docker-compose.yml
```

## 🎯 MongoDB Collections

- **metrics** — Time-series system metrics with TTL indexes
- **deployments** — CI/CD deployment history and audit trail  
- **alerts** — Auto-generated alerts with resolution tracking

## 👤 Author

**Bhalia** — DevOps Intern Project
