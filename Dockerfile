# Use the official Deno image as the base
FROM denoland/deno:2.3.3

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy all source files
COPY . .

# Cache dependencies. The --reload flag is not necessary here
# as Docker's layer caching will handle this. If deno.json changes,
# this layer will be re-run.
RUN deno cache --node-modules-dir src/main.ts

# Expose the port the app runs on
EXPOSE 3334

# Define the entrypoint
ENTRYPOINT ["deno", "run", "--unstable-kv", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "src/main.ts"]
