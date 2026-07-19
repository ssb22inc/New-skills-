/**
 * Minimal Prometheus-text-format metrics registry. Hand-rolled on purpose
 * (Constitution §1.7): counters and gauges with labels are ~60 lines and
 * zero dependencies; a metrics vendor adapter can replace rendering later.
 */

type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  return `{${keys.map((k) => `${k}="${labels[k]}"`).join(',')}}`;
}

class Counter {
  private readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  inc(labels: Labels = {}, by = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [key, value] of this.values) lines.push(`${this.name}${key} ${value}`);
    if (this.values.size === 0) lines.push(`${this.name} 0`);
    return lines.join('\n');
  }
}

class Gauge {
  private readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  set(value: number, labels: Labels = {}): void {
    this.values.set(labelKey(labels), value);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const [key, value] of this.values) lines.push(`${this.name}${key} ${value}`);
    if (this.values.size === 0) lines.push(`${this.name} 0`);
    return lines.join('\n');
  }
}

export class MetricsRegistry {
  private readonly counters = new Map<string, Counter>();
  private readonly gauges = new Map<string, Gauge>();

  counter(name: string, help: string): Counter {
    let c = this.counters.get(name);
    if (!c) {
      c = new Counter(name, help);
      this.counters.set(name, c);
    }
    return c;
  }

  gauge(name: string, help: string): Gauge {
    let g = this.gauges.get(name);
    if (!g) {
      g = new Gauge(name, help);
      this.gauges.set(name, g);
    }
    return g;
  }

  /** Prometheus exposition text for a /metrics endpoint. */
  render(): string {
    const parts = [
      ...[...this.counters.values()].map((c) => c.render()),
      ...[...this.gauges.values()].map((g) => g.render()),
    ];
    return parts.join('\n') + '\n';
  }
}

export type { Counter, Gauge };
