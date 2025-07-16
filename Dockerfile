# Use the official Deno image as the base
FROM denoland/deno:2.3.3

# Set the working directory
WORKDIR /app

# Copy all source files
COPY . .

# Cache dependencies. The --reload flag is not necessary here
# as Docker's layer caching will handle this. If deno.json changes,
# this layer will be re-run.
RUN deno cache src/main.ts
RUN apt-get update && apt-get install -y wget && wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -O /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared

# Expose the port the app runs on
EXPOSE 3334

# Define the entrypoint
ENTRYPOINT ["deno", "run", "--unstable-kv", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-run", "src/main.ts"]
