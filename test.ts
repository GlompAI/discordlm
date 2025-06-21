console.log("Hello from test binary!");
console.log("Working directory:", Deno.cwd());
console.log("Environment variables:");
for (const [key, value] of Object.entries(Deno.env.toObject())) {
    if (key.startsWith("BOT_") || key.startsWith("OPENAI")) {
        console.log(`  ${key}: ${value ? "[SET]" : "[NOT SET]"}`);
    }
}
console.log("Test complete!");

