import { createApp } from './app.js';
import { loadConfig } from './config/env.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const app = createApp();

// Express 5 passes startup errors (such as a port already in use) to this callback.
app.listen(config.port, (error) => {
  if (error) {
    console.error(`Could not start the API on port ${config.port}: ${error.message}`);
    process.exit(1);
  }

  console.log(`OpsPilot API listening on port ${config.port} (${config.nodeEnv})`);
});
