export class StatsPanel {
  readonly element: HTMLDivElement;
  private frames = 0;
  private elapsed = 0;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'stats-panel';
    this.element.textContent = 'FPS --';
  }

  update(deltaSeconds: number): void {
    this.frames += 1;
    this.elapsed += deltaSeconds;

    if (this.elapsed >= 0.5) {
      const fps = Math.round(this.frames / this.elapsed);
      this.element.textContent = `FPS ${fps}`;
      this.frames = 0;
      this.elapsed = 0;
    }
  }
}
