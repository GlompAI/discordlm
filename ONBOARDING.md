# Discord LM Onboarding Guide

This document provides a concise summary of the Discord LM project's context. It is intended to be used as a prefix for prompts to quickly onboard new agents.

## 1. Project Overview

Discord LM is a Deno-based Discord bot that provides a platform for creating and interacting with AI-powered characters. The bot supports multiple LLM providers, including Gemini and OpenAI, and is designed to be a highly customizable and extensible platform for creating unique and engaging AI experiences.

## 2. Technical Stack

*   **Language**: Deno/TypeScript
*   **Libraries**:
    *   `discord.js`: For interacting with the Discord API.
    *   `@google/generative-ai`: For interacting with the Google Generative AI API.
    *   `openai`: For interacting with OpenAI-compatible APIs.
*   **Containerization**: Docker
*   **Orchestration**: Kubernetes (K3s)
*   **CI/CD**: GitHub Actions
*   **Secrets Management**: HashiCorp Vault

## 3. Server Environment

*   **Server**: `giga.pingas.org`
*   **Operating System**: Ubuntu
*   **Web Server**: Caddy (used as a reverse proxy)
*   **Container Runtime**: Docker

## 4. CI/CD Pipeline

The project uses a GitHub Actions workflow defined in `.github/workflows/ci.yml` to build, push, and deploy the application. The workflow is triggered on every push to the `main` and `prod` branches and uses the commit SHA to tag the Docker image, ensuring that every new commit triggers a deployment of the correct image version. The pipeline has separate jobs for deploying to QA and Production environments, which retrieve secrets from HashiCorp Vault.

## 5. Further Reading

For a more detailed overview of the project's architecture, infrastructure, and deployment process, please refer to the `INFRASTRUCTURE.md` file in the root of the repository.