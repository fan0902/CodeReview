export class HeartbeatClock {
  private readonly pages = new Map<string, number>();
  private readonly startedAt: number;
  private idleNotified = false;

  constructor(
    private readonly options: {
      idleMs: number;
      now: () => number;
      onIdle: () => void;
    },
  ) {
    this.startedAt = options.now();
  }

  beat(pageId: string): void {
    this.pages.set(pageId, this.options.now());
    this.idleNotified = false;
  }

  close(pageId: string): void {
    this.pages.delete(pageId);
  }

  activePages(): string[] {
    return [...this.pages.keys()];
  }

  sweep(): void {
    const cutoff = this.options.now() - this.options.idleMs;
    for (const [id, lastSeen] of this.pages) {
      if (lastSeen < cutoff) this.pages.delete(id);
    }
    if (!this.pages.size && this.startedAt < cutoff && !this.idleNotified) {
      this.idleNotified = true;
      this.options.onIdle();
    }
  }
}
