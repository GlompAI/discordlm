# Discord LM Infrastructure and Deployment Guide

This document provides a comprehensive overview of the Discord LM bot's architecture, Kubernetes infrastructure, server environment, and CI/CD pipeline. It is intended to be a living document that will be updated as the project evolves.

## 1. Application Architecture

The Discord LM bot is a Deno-based application that uses the `discord.js` library to interact with the Discord API. It is designed to be a highly customizable and extensible platform for creating and interacting with AI-powered characters, supporting multiple LLM providers including Gemini, OpenAI, and Ollama.

### 1.1. Key Files and Directories

*   **`src/`**: This directory contains all of the application's source code.
    *   **`main.ts`**: The main entry point for the application.
    *   **`App.ts`**: The main application class, responsible for initializing and managing all of the application's services.
    *   **`services/`**: This directory contains the application's core services, such as the `CharacterService`, `DiscordService`, `LLMService`, and `MetricsService`.
    *   **`llm/`**: This directory contains the provider implementations for the supported LLM backends (Gemini, OpenAI, Ollama).
    *   **`handlers/`**: This directory contains the application's event handlers, which are responsible for processing incoming messages and interactions from Discord.
    *   **`CharacterCard.ts`**: This file defines the data structure for character cards, which are used to define the personality and behavior of AI characters.
    *   **`WebhookManager.ts`**: This class manages the creation and use of webhooks for sending messages as characters.
*   **`characters/`**: This directory contains the character card files, which are JSON or PNG files that define the AI characters.
*   **`Dockerfile`**: This file defines the Docker image for the application.
*   **`.github/workflows/ci.yml`**: This file defines the GitHub Actions workflow for building, pushing, and deploying the application.
*   **`k8s-deployment.yaml`**: This file defines the Kubernetes `Deployment` and `Service` for the application.
*   **`k8s-config.yaml`**: This file defines the Kubernetes `ConfigMap` for the application.
*   **`k8s-pvc.yaml`**: This file defines the Kubernetes `PersistentVolumeClaim` for the application's character data.
*   **`k8s-logs-pvc.yaml`**: This file defines the Kubernetes `PersistentVolumeClaim` for the application's logs.

## 2. Kubernetes Infrastructure

The application is deployed to a single-node K3s cluster running on the user's server. The cluster is configured to use a `NodePort` service to expose the application to the host, and a Caddy reverse proxy to route traffic from the internet to the application.

### 2.1. Kubernetes Objects

*   **`Deployment`**: The `discordlm-deployment-prod` and `discordlm-deployment-qa` deployments manage the application's pods for the production and QA environments, respectively. They are configured with a rolling update strategy to ensure zero downtime during updates.
*   **`Service`**: The `discordlm-service` service exposes the application on a `NodePort`, making it accessible to the Caddy reverse proxy.
*   **`ConfigMap`**: The `discordlm-config-prod` and `discordlm-config-qa` configmaps store the application's configuration for the production and QA environments, respectively. These values are populated from GitHub repository variables during the CI/CD process.
*   **`Secret`**: The `discordlm-secrets-prod` and `discordlm-secrets-qa` secrets store the application's sensitive data for the production and QA environments, respectively. These values are populated from HashiCorp Vault during the CI/CD process.
*   **`PersistentVolumeClaim`**: The `discordlm-pvc` and `discordlm-logs-pvc` persistent volume claims provide persistent storage for the application's character data and logs.

### 2.2. Networking

The application is exposed to the internet through a Caddy reverse proxy running on the host. The Caddy proxy is configured to route traffic from `cutie.pingas.org` to the `discordlm-service`'s `NodePort`.

## 3. Server Environment

The application is deployed to a server named `isaac@pi.hole`. The server is running Raspbian and has the following software installed:

*   **K3s**: A lightweight Kubernetes distribution.
*   **Caddy**: A modern, easy-to-use web server that is used as a reverse proxy.
*   **Docker**: The container runtime used by K3s.

The application's data and configuration are stored in the following locations on the server:

*   **`/home/isaac/discordlm/`**: This directory contains the Kubernetes manifests, character data, and logs for the application.
*   **`/var/lib/rancher/k3s/storage/`**: This directory contains the persistent volumes for the application, though the production deployment currently uses `hostPath` volumes mapped to `/home/isaac/discordlm/`.

## 4. CI/CD Pipeline

The application is built, pushed, and deployed using a GitHub Actions workflow defined in `.github/workflows/ci.yml`. The workflow is triggered on every push to the `main` and `prod` branches and consists of three jobs:

*   **`build-and-push`**: This job builds the Docker image, tags it with the commit SHA and `:latest`, and pushes it to the GitHub Container Registry.
*   **`deploy-qa`**: This job deploys the application to the QA environment in the Kubernetes cluster. It is triggered on pushes to the `main` branch. It uses `envsubst` to replace placeholders in the `k8s-deployment.yaml` file with the commit SHA and environment-specific names for the deployment, secret, and configmap. It retrieves secrets from HashiCorp Vault and creates the `discordlm-secrets-qa` and `discordlm-config-qa` Kubernetes objects.
*   **`deploy-prod`**: This job deploys the application to the production environment in the Kubernetes cluster. It is triggered on pushes to the `prod` branch. It follows the same process as the `deploy-qa` job, but uses the production-specific names and secrets.

## 5. Vault Integration

The application uses HashiCorp Vault to manage secrets for the QA and Production environments.

### 5.1. Vault Setup

*   **Authentication**: Vault is configured to use the JWT/OIDC authentication method to allow GitHub Actions workflows to authenticate and retrieve secrets.
*   **Policies**: The `qa-secrets-reader` and `prod-secrets-reader` policies grant read-only access to the secrets for the QA and Production environments, respectively.
*   **Roles**: The `qa` and `prod` roles are bound to the `main` and `prod` branches of the `GlompAI/discordlm` repository, respectively. They are also bound to the corresponding GitHub environments and have the appropriate policies attached.

## 6. Debugging Journey

During the initial deployment and subsequent development, several issues were encountered and resolved. This section provides a brief overview of these issues and their resolutions, as they may be helpful for future troubleshooting.

*   **Image Pull Issues**: The initial deployment failed due to `ImagePullBackOff` errors. This was resolved by correctly configuring the image path and ensuring the necessary secrets were in place to pull from the private GitHub Container Registry.
*   **CrashLoopBackOff Errors**: The application was crashing due to an invalid Discord bot token. This was resolved by switching from Base64-encoded Kubernetes secrets to a raw `.env` file mounted as a volume.
*   **Graceful Shutdown**: Deployments were interrupting active AI generations. This was resolved by implementing a graceful shutdown mechanism in the application to allow in-progress requests to complete before the pod terminates.
*   **Webhook Bug**: Character-specific webhooks were not working correctly. This was resolved by refactoring the `WebhookManager` to ensure a single, shared instance is used.
*   **Port Conflict**: The K3s Ingress controller was conflicting with the existing Caddy webserver on the host. This was resolved by disabling the default Traefik Ingress controller in K3s and using a `NodePort` service with the Caddy reverse proxy.
*   **Stale Image Deploys**: The application was not always deploying the latest code. This was resolved by updating the CI/CD pipeline to use the commit SHA as the image tag, ensuring that every new commit triggers a deployment of the correct image version.
*   **DM Embed Regression**: A change to the message sending logic caused a regression where DMs were no longer using embeds. This was resolved by correcting the logic in the `MessageCreateHandler` to properly construct and send embeds for character responses in DMs.
*   **Vault Authentication Issues**: The initial Vault integration failed due to incorrect `bound_subject` and `bound_audiences` claims in the Vault roles. This was resolved by correctly configuring the roles to be bound to the GitHub environment and audience.