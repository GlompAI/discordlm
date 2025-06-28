# Production Environment Onboarding Guide

This document provides a summary of the production environment setup for the Discord LM project.

## 1. Production Environment Overview

The production environment is hosted on a Kubernetes cluster and is configured to run the primary instance of the Discord LM bot.

*   **Server**: `root@giga.pingas.org`
*   **Container Orchestration**: The application is managed by a Kubernetes deployment. The deployment is defined in `k8s-deployment.yaml`.
*   **LLM Provider**: The production environment uses Gemini with a fallback to an OpenAI-compatible provider.
*   **LLM Model**: The default model for the production environment is `gemini-1.5-flash`.

## 2. Access and Deployment

### SSH Access

Access to the production server is granted via an SSH key. The private key is stored as a secret in the GitHub repository's `prod` environment with the name `SSH_PRIVATE_KEY`.

### CI/CD Deployment

The deployment process for the production environment is automated via a GitHub Actions workflow defined in `.github/workflows/ci.yml`.

*   **Workflow Job**: A dedicated job named `deploy-prod` handles the deployment.
*   **Trigger**: The workflow is triggered on every push to the `prod` branch.
*   **Process**: The workflow builds a Docker image, pushes it to the GitHub Container Registry, and then uses `k3s kubectl` to apply the updated deployment to the Kubernetes cluster.

## 3. Secrets Management

Secrets for the production environment are managed via GitHub Actions secrets and variables scoped to the `prod` environment. The following secrets and variables are configured:

**Secrets:**

*   `BOT_TOKEN`
*   `GEMINI_API_KEY`
*   `OPENAI_API_KEY`
*   `SSH_PRIVATE_KEY`
*   `CLOUDFLARE_TUNNEL_ID`
*   `CLOUDFLARE_CREDENTIALS_FILE_CONTENT`
*   `GHCR_TOKEN`

**Variables:**

*   `OPENAI_BASE_URL`
*   `ADMIN_OVERRIDE_ID`
*   `GEMINI_TOKEN_LIMIT`
*   `OPENAI_TOKEN_LIMIT`
*   `RATE_LIMIT_PER_MINUTE`
*   `DEBUG`
*   `MAX_HISTORY_MESSAGES`
*   `SSH_HOST`
*   `SSH_USERNAME`

## 4. Cloudflare Tunnel

The production environment uses a Cloudflare Tunnel to securely expose the avatar server to the internet.

*   **Hostname**: `avatar.glomp.ai`
*   **Tunnel ID**: `1630c589-6e93-4082-a703-860e44aa831c`
*   **Credentials**: The tunnel credentials are stored in a Kubernetes secret named `cloudflare-credentials` and mounted into the application pod.