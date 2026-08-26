/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

/**
 * Minimal fake-data generator backing the mock server.
 *
 * This replaces @faker-js/faker. The realism of a mock payload comes from the
 * property-name heuristics in MockGenerator — an "email" field gets an email —
 * not from the breadth of the dictionary behind it, so a small curated pool
 * produces the same quality of mock at a fraction of the install size, and
 * removes a runtime dependency.
 */

const WORDS = [
  'account', 'branch', 'catalog', 'channel', 'client', 'cluster', 'config',
  'dashboard', 'domain', 'engine', 'export', 'feature', 'gateway', 'handler',
  'import', 'index', 'insight', 'invoice', 'ledger', 'metric', 'module',
  'network', 'order', 'payload', 'pipeline', 'policy', 'profile', 'project',
  'queue', 'record', 'region', 'report', 'request', 'resource', 'schema',
  'segment', 'service', 'session', 'signal', 'source', 'status', 'stream',
  'summary', 'target', 'ticket', 'token', 'vendor', 'widget', 'workflow',
];

const FIRST_NAMES = [
  'Adam', 'Amira', 'Carlos', 'Diana', 'Elena', 'Hassan', 'Ines', 'James',
  'Julia', 'Karim', 'Laila', 'Liam', 'Maria', 'Mohamed', 'Nadia', 'Noah',
  'Olivia', 'Omar', 'Sara', 'Sofia', 'Tarek', 'Yara', 'Youssef', 'Zainab',
];

const LAST_NAMES = [
  'Ali', 'Anderson', 'Brown', 'Chen', 'Davis', 'Garcia', 'Hassan', 'Ibrahim',
  'Johnson', 'Khalil', 'Kim', 'Lopez', 'Martin', 'Miller', 'Mustafa', 'Nguyen',
  'Osman', 'Patel', 'Silva', 'Smith', 'Taylor', 'Wilson',
];

const CITIES = [
  'Alexandria', 'Amsterdam', 'Barcelona', 'Berlin', 'Cairo', 'Dubai', 'Lisbon',
  'London', 'Madrid', 'Nairobi', 'New York', 'Paris', 'Riyadh', 'Singapore',
  'Tokyo', 'Toronto',
];

const COUNTRIES = [
  'Brazil', 'Canada', 'Egypt', 'France', 'Germany', 'India', 'Japan',
  'Netherlands', 'Portugal', 'Saudi Arabia', 'Singapore', 'Spain',
  'United Arab Emirates', 'United Kingdom', 'United States',
];

const STREETS = [
  'Cedar Lane', 'Elm Street', 'Harbor Road', 'High Street', 'King Avenue',
  'Lake Drive', 'Main Street', 'Maple Avenue', 'Oak Street', 'Park Boulevard',
  'Pine Road', 'River Way',
];

const EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net'];

export class Fake {
  /** Random integer in the inclusive range [min, max]. */
  static int(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static boolean(): boolean {
    return Math.random() < 0.5;
  }

  static arrayElement<T>(values: readonly T[]): T {
    return values[this.int(0, values.length - 1)];
  }

  static word(): string {
    return this.arrayElement(WORDS);
  }

  static words(count = 3): string {
    return Array.from({ length: count }, () => this.word()).join(' ');
  }

  static sentence(): string {
    const words = this.words(this.int(6, 10));
    return words.charAt(0).toUpperCase() + words.slice(1) + '.';
  }

  static sentences(count = 2): string {
    return Array.from({ length: count }, () => this.sentence()).join(' ');
  }

  /** A date within the last ten days, mirroring faker.date.recent(). */
  static recentDate(): Date {
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    return new Date(Date.now() - this.int(0, tenDaysMs));
  }

  static fullName(): string {
    return `${this.arrayElement(FIRST_NAMES)} ${this.arrayElement(LAST_NAMES)}`;
  }

  static email(): string {
    const first = this.arrayElement(FIRST_NAMES).toLowerCase();
    const last = this.arrayElement(LAST_NAMES).toLowerCase();
    return `${first}.${last}${this.int(1, 99)}@${this.arrayElement(EMAIL_DOMAINS)}`;
  }

  static url(): string {
    return `https://${this.word()}.example.com/${this.word()}`;
  }

  static phone(): string {
    const line = String(this.int(0, 9999)).padStart(4, '0');
    return `+1-${this.int(200, 989)}-${this.int(200, 989)}-${line}`;
  }

  static streetAddress(): string {
    return `${this.int(1, 9999)} ${this.arrayElement(STREETS)}`;
  }

  static city(): string {
    return this.arrayElement(CITIES);
  }

  static country(): string {
    return this.arrayElement(COUNTRIES);
  }
}
