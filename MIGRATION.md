# K8s Migration Plan: giga.pingas.org to pi.hole

This document outlines the steps to migrate the Discord LM Kubernetes production instance from `root@giga.pingas.org` to `isaac@pi.hole`.

## 1. New Server Setup (isaac@pi.hole)

1.  **Install Dependencies:** Install K3s, Docker, and Caddy on the Raspberry Pi.
    ```bash
    # Install K3s (disabling Traefik)
    curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable=traefik" sh -s -

    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh

    # Install Caddy
    sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt update
    sudo apt install caddy
    ```

2.  **Create Directory Structure:** Create the necessary directories for the application.
    ```bash
    mkdir -p /home/isaac/discordlm/characters
    mkdir -p /home/isaac/discordlm/logs
    ```

## 2. Data Migration

1.  **Backup Data from giga.pingas.org:** Connect to the old server and archive the character and log data.
    ```bash
    ssh root@giga.pingas.org "tar -czf discordlm_backup.tar.gz /root/discordlm/characters /home/luigi/discordlm/logs"
    ```
    *Note: The deployment manifest points to `/root/discordlm/logs` but the infrastructure doc points to `/home/luigi/discordlm/logs`. I will assume the infrastructure doc is correct and Luigi is the user running the service.*

2.  **Transfer Backup:** Copy the backup file from the old server to the new server.
    ```bash
    scp root@giga.pingas.org:~/discordlm_backup.tar.gz isaac@pi.hole:~/
    ```

3.  **Restore Data on pi.hole:** Extract the backup on the new server.
    ```bash
    ssh isaac@pi.hole "tar -xzf ~/discordlm_backup.tar.gz -C /home/isaac/discordlm/"
    ```

## 3. Configuration Updates

1.  **Update `k8s-config.yaml`:** Change `PUBLIC_AVATAR_BASE_URL` to the new address.
2.  **Update `k8s-deployment.yaml`:** Change the `hostPath` for `logs` and `characters` to the new paths on the Raspberry Pi.
3.  **Update CI/CD Pipeline:** The GitHub Actions workflow in `.github/workflows/ci.yml` will need to be updated to deploy to the new server. This will involve changing the server address, user, and any paths in the deployment scripts.
4.  **DNS and Reverse Proxy:** The DNS record for `cutie.pingas.org` will need to be updated to point to the IP address of `pi.hole`. The Caddy configuration on `pi.hole` will need to be set up to reverse proxy requests to the new Kubernetes service.
