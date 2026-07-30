import { Sandbox as CloudflareSandbox } from "@cloudflare/sandbox";

/** Sandbox SDK extension with a non-blocking emergency kill primitive. */
export class Sandbox extends CloudflareSandbox {
  forceKill(): void {
    const container = this.ctx.container;
    if (container?.running) container.signal(9);
  }
}
