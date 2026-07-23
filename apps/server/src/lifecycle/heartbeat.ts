export type PageCommand = { type: "reload" };

type PageRecord = {
  lastSeen: number;
  activityOrder: number;
  send: ((command: PageCommand) => void) | undefined;
};

export class HeartbeatClock {
  private readonly pages = new Map<string, PageRecord>();
  private readonly startedAt: number;
  private idleNotified = false;
  private activityOrder = 0;

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
    const current = this.pages.get(pageId);
    this.pages.set(pageId, {
      lastSeen: this.options.now(),
      activityOrder: ++this.activityOrder,
      send: current?.send,
    });
    this.idleNotified = false;
  }

  connect(pageId: string, send: (command: PageCommand) => void): () => void {
    const current = this.pages.get(pageId);
    this.pages.set(pageId, {
      lastSeen: current?.lastSeen ?? this.options.now(),
      activityOrder: current?.activityOrder ?? ++this.activityOrder,
      send,
    });
    return () => {
      const page = this.pages.get(pageId);
      if (page?.send === send) page.send = undefined;
    };
  }

  refreshMostRecent(): boolean {
    const target = [...this.pages.values()]
      .filter((page) => page.send)
      .sort((left, right) => right.activityOrder - left.activityOrder)[0];
    if (!target?.send) return false;
    target.send({ type: "reload" });
    return true;
  }

  close(pageId: string): void {
    this.pages.delete(pageId);
  }

  activePages(): string[] {
    return [...this.pages.keys()];
  }

  sweep(): void {
    const cutoff = this.options.now() - this.options.idleMs;
    for (const [id, page] of this.pages) {
      if (page.lastSeen < cutoff) this.pages.delete(id);
    }
    if (!this.pages.size && this.startedAt < cutoff && !this.idleNotified) {
      this.idleNotified = true;
      this.options.onIdle();
    }
  }
}
