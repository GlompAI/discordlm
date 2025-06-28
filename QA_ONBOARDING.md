# QA Environment Onboarding Guide

This document provides a summary of the QA environment setup for the Discord LM project.

## 1. QA Environment Overview

The QA environment is hosted on a dedicated server and is configured to run a separate instance of the Discord LM bot for testing purposes.

*   **Server**: `heni@ooo.observer`
*   **Process Manager**: The application is managed by a `systemd` user service with lingering enabled to ensure it runs persistently. The service is defined in `~/.config/systemd/user/discordlm.service`.
*   **LLM Provider**: The QA environment uses a local OpenAI-compatible instance running on `http://127.0.0.1:11434`.
*   **LLM Model**: The default model for the QA environment is `nidumai/nidum-gemma-3-4b-it-uncensored:q5_k_m`.

## 2. Access and Deployment

### SSH Access

Access to the QA server is granted via an `ed25519` SSH key. The private key is stored as a secret in the GitHub repository with the name `SSH_PRIVATE_KEY_QA`.

### CI/CD Deployment

The deployment process for the QA environment is automated via a GitHub Actions workflow defined in `.github/workflows/ci.yml`.
- `GROQ_API_KEY`: Your Groq API key.

*   **Workflow Job**: A dedicated job named `deploy-qa-binary` handles the deployment.
*   **Trigger**: The workflow is triggered on every push to the `main` branch.
*   **Process**: The workflow builds the Deno application inside a Docker container, copies the compiled binary to the QA server, and restarts the `systemd` service.

## 3. Character Management

### Character Audit

An audit was performed on the character files from the production server to identify and filter out any content that is not strictly safe for work (SFW).

### Character Deployment

A curated set of "clean" characters has been deployed to the QA server. The deployment was performed using the `deploy_clean_characters.ts` script, which can be used as a reference for future character management tasks.

## 4. Secrets Management

Secrets for the QA environment are managed via a `.env.qa` file located in the application's root directory on the server (`/home/heni/discordlm/.env.qa`). The following variables are configured:

*   `BOT_TOKEN`
*   `BOT_SELF_ID`
*   `LLM_PROVIDER`
*   `MODEL_NAME`
*   `TOKEN_LIMIT`
*   `ENABLE_AVATAR_SERVER`
*   `AVATAR_PORT`
*   `PUBLIC_AVATAR_BASE_URL`
*   `INFERENCE_PARALLELISM`
*   `RATE_LIMIT_PER_MINUTE`
*   `MAX_HISTORY_MESSAGES`
*   `GEMINI_API_KEY` (placeholder)