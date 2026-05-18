import './style.css';
import { startOceanDemo } from './demo/OceanDemo';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element.');
}

startOceanDemo(app).catch((error: unknown) => {
  console.error(error);
  app.innerHTML = `
    <main class="startup-error">
      <h1>Ocean demo failed to start</h1>
      <p>${error instanceof Error ? error.message : String(error)}</p>
    </main>
  `;
});
