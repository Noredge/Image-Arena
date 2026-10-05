/** Some native/accessibility input sends key names without physical key codes. */
export function keyIdentity(event: Pick<KeyboardEvent, 'code' | 'key'>): string {
  return event.code || (/^[a-z]$/i.test(event.key) ? `Key${event.key.toUpperCase()}` : event.key);
}

/** A press is accepted once until keyup, even if the rendered match changes. */
export class KeyboardGate {
  private held = new Set<string>();
  accept(code: string, repeat: boolean): boolean {
    if (repeat || this.held.has(code)) return false;
    this.held.add(code); return true;
  }
  release(code: string) { this.held.delete(code); }
  clear() { this.held.clear(); }
}
