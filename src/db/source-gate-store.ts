import type Database from 'better-sqlite3';
export const ZERO_BUDGET_SOURCES = ['linkedin', 'indeed'] as const;
export function assertSourceBudget(source: string): void {
  throw new Error(`Automated ${source} requests disabled: budget = 0. Alerts are leads only; use local manual paste.`);
}
export class SourceGateStore {
  constructor(private readonly db: Database.Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS job_source_controls (source TEXT PRIMARY KEY, killed INTEGER NOT NULL CHECK(killed IN (0,1)));
      INSERT OR IGNORE INTO job_source_controls VALUES ('global', 1), ('linkedin', 1), ('indeed', 1);`);
  }
  state() {
    const killed = (source: string) => {
      const row = this.db.prepare('SELECT killed FROM job_source_controls WHERE source = ?').get(source) as { killed: number } | undefined;
      if (!row || ![0, 1].includes(row.killed)) throw new Error('Missing/invalid persisted source control; automation held.');
      return row.killed === 1;
    };
    return { globalKilled: killed('global'), sources: { linkedin: { killed: killed('linkedin'), budget: 0 }, indeed: { killed: killed('indeed'), budget: 0 } } };
  }
  setKill(source: string, killed: boolean): void {
    if (!['global', ...ZERO_BUDGET_SOURCES].includes(source) || typeof killed !== 'boolean') throw new Error('Source kill requires global/linkedin/indeed and an explicit boolean.');
    this.db.prepare('UPDATE job_source_controls SET killed = ? WHERE source = ?').run(Number(killed), source);
  }
  assertAutomated(source: string): void {
    const state = this.state();
    if (state.globalKilled) throw new Error('Automated sources disabled by persisted global kill.');
    if (source === 'linkedin' || source === 'indeed') {
      if (state.sources[source].killed) throw new Error(`Automated ${source} requests disabled by persisted source kill; budget = 0.`);
    }
    return assertSourceBudget(source);
  }
}
