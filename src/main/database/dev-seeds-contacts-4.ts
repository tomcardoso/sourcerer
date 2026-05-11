interface SeedContact {
  name: string;
  organization: string | null;
  notes: string | null;
  emails: string[];
  phones: string[];
  links: { type: 'linkedin' | 'x' | 'website' | 'facebook' | 'instagram' | 'other'; url: string }[];
}

export const CONTACTS_4: SeedContact[] = [
  {
    name: 'Michael Clarke',
    organization: 'Clarke Strategies Inc.',
    notes:
      'Crisis communications consultant retained by two of the developers under investigation. Former PMO comms director. Tracks our stories closely — assume anything shared with him reaches his clients within hours.',
    emails: ['michael@clarkestrategies.ca'],
    phones: ['+1 613 555 7101'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/michael-clarke-comms' },
      { type: 'x', url: 'https://x.com/mclarkestrategies' },
    ],
  },
  {
    name: 'Michael Clark',
    organization: 'Clark & Whitten Barristers',
    notes:
      'Senior litigator specialising in defamation and media law. Has represented three subjects of our investigations in cease-and-desist proceedings. Different firm from the Clarke Strategies contact.',
    emails: ['mclark@clarkwhitten.ca'],
    phones: ['+1 416 555 7158'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/michael-clark-barrister' }],
  },
  {
    name: 'Anne Robertson',
    organization: 'Robertson Government Relations',
    notes:
      'Former Ontario Minister of the Environment, now a registered lobbyist for three oil sands operators. Active on 11 federal files. Disclosure registry shows 34 contacts with Environment Canada staff since 2022.',
    emails: ['anne@robertsongovrel.ca', 'a.robertson@lobbyist.gc.ca'],
    phones: ['+1 613 555 7214', '+1 343 555 7261'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/anne-robertson-govrel' },
      { type: 'website', url: 'https://robertsongovernmentrelations.ca' },
    ],
  },
  {
    name: 'Anne Robinson',
    organization: 'The Globe and Mail',
    notes:
      'Investigative reporter covering the same housing fraud beat. Has published two pieces that overlap significantly with our sourcing — possible common whistleblower. Friendly at industry events.',
    emails: ['a.robinson@globeandmail.com'],
    phones: ['+1 416 555 7319'],
    links: [
      { type: 'x', url: 'https://x.com/annerobinson_gam' },
      { type: 'linkedin', url: 'https://linkedin.com/in/anne-robinson-globe' },
    ],
  },
  {
    name: 'Darnell Okafor',
    organization: null,
    notes:
      'Former Treasury Board analyst who left under disputed circumstances in 2021. Claims to have witnessed document destruction related to the infrastructure fund audit. Will not use email — Signal only, number provided through intermediary.',
    emails: [],
    phones: ['+1 343 555 7433'],
    links: [],
  },
  {
    name: 'Jocelyn Paré-Vachon',
    organization: 'Fasken Martineau — Montréal',
    notes:
      'Partner, class actions. Represents 340 former residents of the contaminated housing development. Has filed a motion to compel document production from the Ministry of Environment.',
    emails: ['jpare-vachon@fasken.com'],
    phones: ['+1 514 555 7547'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/jocelyn-pare-vachon' }],
  },
  {
    name: 'Rupert Ainsworth',
    organization: 'The Guardian — Investigations Desk',
    notes:
      'London-based colleague working on the offshore trust angle from the UK end. Sharing leads under a loose collaboration agreement. Copy any documents before sending — his editors sometimes publish without prior notice.',
    emails: ['r.ainsworth@theguardian.com'],
    phones: ['+44 20 7946 0744'],
    links: [
      { type: 'x', url: 'https://x.com/rupert_ainsworth' },
      { type: 'linkedin', url: 'https://linkedin.com/in/rupert-ainsworth-guardian' },
    ],
  },
  {
    name: 'Congresswoman\'s aide — Tiffany Holbrook',
    organization: 'US House Committee on Financial Services',
    notes: null,
    emails: ['tiffany.holbrook@mail.house.gov'],
    phones: ['+1 202 555 7661'],
    links: [],
  },
  {
    name: 'Sen. (ret.) Gérald Marquette',
    organization: null,
    notes:
      'Retired senator who sat on the banking committee during the period under scrutiny. Has written an unpublished memoir chapter that he shared selectively. Willing to speak on background about internal committee dynamics.',
    emails: ['gerald.marquette@senatorsemeriti.ca'],
    phones: ['+1 819 555 7778'],
    links: [],
  },
  {
    name: 'Priscilla Nakagawa',
    organization: 'Australian Securities and Investments Commission',
    notes:
      'Senior investigator on cross-border enforcement. Australian regulatory action against the same Luxembourg holding structure preceded our story. Shared two public enforcement documents; more may be available via formal request.',
    emails: ['p.nakagawa@asic.gov.au'],
    phones: ['+61 2 9911 2501'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/priscilla-nakagawa-asic' }],
  },
  {
    name: 'Édouard Beaupré-Fontaine',
    organization: 'Beaupré-Fontaine Communications',
    notes: null,
    emails: ['e.beaupre@bfcomm.ca'],
    phones: ['+1 514 555 7891'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/edouard-beaupre-fontaine' }],
  },
  {
    name: 'Maureen Stafford-Hynes',
    organization: 'Former Deputy Minister — Innovation, Science and Economic Development',
    notes:
      'Retired in 2022. Was in post during the approvals process for the AI procurement contracts under scrutiny. Has agreed to one background briefing — scheduling through her personal assistant.',
    emails: ['mstafford@bell.net'],
    phones: ['+1 613 555 7904'],
    links: [],
  },
  {
    name: 'Zach Pendergast',
    organization: 'Toronto Star — Queen\'s Park Bureau',
    notes: null,
    emails: ['z.pendergast@thestar.ca'],
    phones: ['+1 416 555 8011'],
    links: [
      { type: 'x', url: 'https://x.com/zpendergast_star' },
      { type: 'linkedin', url: 'https://linkedin.com/in/zach-pendergast' },
    ],
  },
  {
    name: 'Dr. Bridget O\'Halloran',
    organization: 'Health Canada — Drug Evaluation',
    notes:
      'Reviewer who signed off on accelerated approval for a drug whose clinical trial data is now disputed. Has been placed on administrative leave pending internal review. Personal email used after office email bounced.',
    emails: ['bridget.ohalloran@canada.ca', 'bridgieoh@gmail.com'],
    phones: ['+1 613 555 8129'],
    links: [],
  },
  {
    name: 'Finlay Drummond',
    organization: 'Transparency International Canada',
    notes:
      'Executive director. Useful for contextualizing our findings in a comparative international corruption framework. Willing to comment on record and can point to peer NGOs in affected jurisdictions.',
    emails: ['f.drummond@transparencycanada.ca'],
    phones: ['+1 416 555 8247'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/finlay-drummond-tic' },
      { type: 'x', url: 'https://x.com/finlaydrummond' },
      { type: 'website', url: 'https://transparencycanada.ca' },
    ],
  },
  {
    name: 'Rebecca Stowe-Almeida',
    organization: 'Stikeman Elliott — Vancouver',
    notes: null,
    emails: ['rstowe-almeida@stikeman.com'],
    phones: ['+1 604 555 8364'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/rebecca-stowe-almeida' }],
  },
  {
    name: 'Antoine Durocher',
    organization: 'Radio-Canada — Enquête',
    notes:
      'Senior producer at the CBC\'s French-language investigative unit. Working a parallel thread on the same pension file from the Quebec angle. Met at IRE conference. Coordination call booked for next week.',
    emails: ['durocher.antoine@radio-canada.ca'],
    phones: ['+1 514 555 8471'],
    links: [{ type: 'x', url: 'https://x.com/durocher_enquete' }],
  },
  {
    name: 'Kwame Asante-Mensah',
    organization: null,
    notes:
      'Former auditor at a provincial long-term care operator. Provided the spreadsheet showing discrepancy between reported and actual staffing hours. Left under a confidential settlement — legal has advised he cannot speak to that specifically.',
    emails: ['k.asante@proton.me'],
    phones: [],
    links: [],
  },
  {
    name: 'Hon. Patricia Venn',
    organization: 'Federal Court of Canada',
    notes: null,
    emails: [],
    phones: [],
    links: [],
  },
  {
    name: 'Callum Forsythe',
    organization: 'Deloitte Canada — Forensics & Investigations',
    notes:
      'Partner, forensic accounting. Has been retained as court-appointed monitor in the receivership of one of the development companies. His reports are technically public once filed but often posted with minimal notice.',
    emails: ['callum.forsythe@deloitte.ca'],
    phones: ['+1 416 555 8694', '+1 416 555 8741'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/callum-forsythe-deloitte' }],
  },
  {
    name: 'Dana Przybylski',
    organization: 'Canadian Association of Journalists',
    notes:
      'Executive director. Useful for institutional support on press freedom angles and formal complaints to government press offices. Helped with two ATIP appeals already this year.',
    emails: ['d.przybylski@caj.ca'],
    phones: ['+1 613 555 8812'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/dana-przybylski-caj' },
      { type: 'x', url: 'https://x.com/dana_caj' },
    ],
  },
  {
    name: 'Ignacio Velázquez-Mora',
    organization: 'OECD — Anti-Corruption Division',
    notes:
      'Analyst working on Canada\'s peer review under the Anti-Bribery Convention. Has indicated informally that the review flagged enforcement gaps consistent with our reporting.',
    emails: ['i.velazquez@oecd.org'],
    phones: ['+33 1 4524 8201'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/ignacio-velazquez-mora-oecd' }],
  },
  {
    name: 'Sandra Hutchings-Bell',
    organization: 'Dentons Canada — Ottawa',
    notes: null,
    emails: ['sandra.hutchings@dentons.com'],
    phones: ['+1 613 555 8927'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/sandra-hutchings-bell' }],
  },
  {
    name: 'Emil Rosenqvist',
    organization: 'Riksrevisionen — Stockholm',
    notes:
      'Swedish National Audit Office examiner who audited a joint venture that included the Canadian pension fund under our scrutiny. His published report contains data our sources say contradicts the Canadian fund\'s investor communications.',
    emails: ['emil.rosenqvist@riksrevisionen.se'],
    phones: ['+46 8 5171 4001'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/emil-rosenqvist-riksrevisionen' }],
  },
  {
    name: 'Petra Vogelsang',
    organization: 'BaFin — Frankfurt',
    notes:
      'Senior examiner, asset management supervision. German regulator reviewed a fund management company that is a subsidiary of one of our investigation targets. Sent initial query via official channels — awaiting response.',
    emails: ['p.vogelsang@bafin.de'],
    phones: ['+49 228 4108 1801'],
    links: [],
  },
];
