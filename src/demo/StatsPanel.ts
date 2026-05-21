export class StatsPanel {
  readonly element: HTMLDivElement;
  private frames = 0;
  private elapsed = 0;
  private fps = 0;
  private qualityPreset = 'High';

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'stats-panel';
    this.render();
  }

  update(deltaSeconds: number): void {
    this.frames += 1;
    this.elapsed += deltaSeconds;

    if (this.elapsed >= 0.5) {
      this.fps = Math.round(this.frames / this.elapsed);
      this.render();
      this.frames = 0;
      this.elapsed = 0;
    }
  }

  setQualityPreset(label: string): void {
    this.qualityPreset = label;
    this.render();
  }

  private render(): void {
    this.element.textContent = `FPS ${this.fps || '--'}\nQuality ${this.qualityPreset}`;
  }
}
