import type { JobStore } from '../../src/db/store.js';
/** Explicit synthetic operator step; never used by production intake or eligibility. */
export function confirmSyntheticDescriptions(store: JobStore): void {
  for (const lead of store.listLeads()) {
    if (store.descriptions.current(lead.leadId)) continue;
    store.descriptions.capture({
      ...store.descriptions.template(lead.leadId), fullDescriptionConfirmed: true,
      body: 'About the role\nMaintain synthetic validation systems with the team.\nResponsibilities\nWrite tests, review changes and document their behavior.\nRequirements\nExperience with Python and TypeScript is required.\nBenefits\nFlexible hours. Apply through the employer portal.'
    });
  }
}
