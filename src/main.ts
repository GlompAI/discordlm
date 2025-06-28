console.log("Starting Discord LM version 1.1.1");
import { App } from "./App.ts";

export const RESET_MESSAGE_CONTENT = "--- Bot conversation history reset ---";

const app = new App();
app.start();
