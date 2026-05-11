interface SeedContact {
  name: string;
  organization: string | null;
  notes: string | null;
  emails: string[];
  phones: string[];
  links: { type: 'linkedin' | 'x' | 'website' | 'facebook' | 'instagram' | 'other'; url: string }[];
}

export const CONTACTS_1: SeedContact[] = [
  {
    name: 'Councillor Diane Fischetti',
    organization: 'City of Toronto — Ward 14',
    notes:
      'Chairs the infrastructure committee and has received significant developer donations. Her office stonewalled three FOIA requests last year. Personal cell reportedly routed through a campaign staffer.',
    emails: ['d.fischetti@toronto.ca', 'fischetti.office@gmail.com'],
    phones: ['+1 416 555 0101', '+1 416 555 0188'],
    links: [
      { type: 'x', url: 'https://x.com/fischetti_ward14' },
      { type: 'linkedin', url: 'https://linkedin.com/in/diane-fischetti' },
    ],
  },
  {
    name: 'Marcus Osei-Bonsu',
    organization: 'Ontario Ministry of Municipal Affairs',
    notes:
      'Senior policy director. Has been a quiet source on the Greenbelt file — prefers Signal. Connected to the Deputy Minister through a previous role at Infrastructure Ontario.',
    emails: ['mosei-bonsu@ontario.ca'],
    phones: ['+1 647 555 0234'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/marcus-osei-bonsu' }],
  },
  {
    name: 'Vivienne Tran',
    organization: 'Torys LLP',
    notes:
      'Specialist in municipal land-use and development law. Represents several players implicated in the Greenbelt land swap. Will not confirm or deny client relationships.',
    emails: ['vtran@torys.com'],
    phones: ['+1 416 555 0312'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/vivienne-tran-torys' }],
  },
  {
    name: 'Staff Insp. Robert Kalinowski',
    organization: 'Toronto Police Service — Financial Crimes',
    notes: null,
    emails: ['r.kalinowski@torontopolice.on.ca'],
    phones: ['+1 416 555 0451'],
    links: [],
  },
  {
    name: 'Dr. Ananya Krishnamurthy',
    organization: 'Public Health Ontario',
    notes:
      'Epidemiologist specializing in environmental health. Authored the suppressed 2023 report on industrial contamination near Pickering. Currently on secondment to Health Canada.',
    emails: ['akrishnamurthy@oahpp.ca', 'ananya.krishnamurthy@canada.ca'],
    phones: ['+1 647 555 0199'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/ananya-krishnamurthy-phd' },
      { type: 'x', url: 'https://x.com/drkrishnamurthy' },
    ],
  },
  {
    name: 'Gordon Whitfield',
    organization: 'RBC Capital Markets',
    notes:
      "VP, Structured Finance. Involved in underwriting deals for several condo developers under scrutiny. His assistant screens all calls — email is the only reliable channel.",
    emails: ['gordon.whitfield@rbccm.com'],
    phones: ['+1 416 555 0580'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/gordon-whitfield-rbc' }],
  },
  {
    name: 'Priya Subramaniam',
    organization: 'CBC News Investigations',
    notes:
      'Competing journalist working the same Greenbelt angle. Shares occasional tips on sources already burned. Do not share exclusive documents. Friendly but rivalry is real.',
    emails: ['priya.subramaniam@cbc.ca'],
    phones: ['+1 416 555 0611'],
    links: [
      { type: 'x', url: 'https://x.com/priya_investigates' },
      { type: 'linkedin', url: 'https://linkedin.com/in/priya-subramaniam-cbc' },
    ],
  },
  {
    name: 'Ted Molnar',
    organization: 'Ontario Legislature — Opposition Research',
    notes: null,
    emails: ['ted.molnar@liberal.ola.org'],
    phones: ['+1 613 555 0742'],
    links: [],
  },
  {
    name: 'Sylvie Archambault',
    organization: 'Fédération des travailleurs du Québec',
    notes:
      'Regional director. Source on the port labour dispute and related kickback allegations. Speaks only French in formal settings; bilingual off-record.',
    emails: ['s.archambault@ftq.qc.ca'],
    phones: ['+1 514 555 0887'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/sylvie-archambault-ftq' }],
  },
  {
    name: 'Deputy Commissioner Harlan Bryce',
    organization: 'RCMP — Commercial Crime Branch',
    notes:
      'Leads the national task force investigating pension fund fraud. Has pushed back on ATIP requests. Personal aide sometimes more forthcoming than Bryce himself.',
    emails: ['harlan.bryce@rcmp-grc.gc.ca'],
    phones: ['+1 613 555 0921', '+1 343 555 0038'],
    links: [],
  },
  {
    name: 'Ngozi Okafor-Ellis',
    organization: 'Osler, Hoskin & Harcourt LLP',
    notes:
      'Forensic accountant and expert witness retained in three ongoing class actions. Deeply knowledgeable about the real-estate trust structures under scrutiny. Prefers in-person meetings.',
    emails: ['nokafor-ellis@osler.com', 'ngozi.ellis.personal@gmail.com'],
    phones: ['+1 416 555 1003'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/ngozi-okafor-ellis' }],
  },
  {
    name: 'Alderman Frank Sorrentino',
    organization: "Hamilton City Council — Planning & Economic Development",
    notes: null,
    emails: ['f.sorrentino@hamilton.ca'],
    phones: ['+1 905 555 1122'],
    links: [{ type: 'facebook', url: 'https://facebook.com/franksorrentinohamilton' }],
  },
  {
    name: 'Catherine Mwangi',
    organization: 'Export Development Canada',
    notes:
      'Risk analyst who flagged irregularities in the Nairobi infrastructure loan portfolio. Filed an internal complaint in 2022 that was not actioned. Potential whistleblower — approach carefully.',
    emails: ['c.mwangi@edc.ca'],
    phones: ['+1 613 555 1244'],
    links: [],
  },
  {
    name: 'Dr. Jean-Paul Hébert',
    organization: 'Université de Montréal — School of Public Policy',
    notes:
      'Former federal deputy minister, now academic. Published critical analysis of the pension fund governance failures. Happy to speak on background.',
    emails: ['jp.hebert@umontreal.ca'],
    phones: ['+1 514 555 1366'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/jean-paul-hebert-udem' },
      { type: 'website', url: 'https://hebert.udem.ca' },
    ],
  },
  {
    name: 'Sandra Woo-Patel',
    organization: 'Woodbourne Capital Partners',
    notes:
      'Managing partner at a private equity firm with positions in three of the contaminated sites. Her firm has donated to four sitting federal MPs. Has not responded to prior outreach.',
    emails: ['swoo@woodbournecapital.com'],
    phones: ['+1 416 555 1499'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/sandra-woo-patel' }],
  },
  {
    name: 'James Calloway',
    organization: 'US Department of Justice — Fraud Section',
    notes: null,
    emails: ['james.calloway@usdoj.gov'],
    phones: ['+1 202 555 0147'],
    links: [],
  },
  {
    name: 'Oksana Petrenko',
    organization: 'Ukrainian Canadian Congress',
    notes:
      'Executive director and vocal critic of a Canadian mining company operating near Lviv. Has documentation the company disputes. Meeting scheduled for next month.',
    emails: ['o.petrenko@ucc.ca', 'oksanapetrenko@proton.me'],
    phones: ['+1 204 555 1581'],
    links: [{ type: 'x', url: 'https://x.com/OksanaPetrenko_UCC' }],
  },
  {
    name: 'Chief Medical Officer Dr. Farrukh Tashkentov',
    organization: 'Simcoe Muskoka District Health Unit',
    notes:
      'Has internal data on elevated lead levels in Barrie drinking water. The health unit delayed publication under pressure from the regional government. Data embargo ends Q3.',
    emails: ['f.tashkentov@smdhu.org'],
    phones: ['+1 705 555 1634'],
    links: [],
  },
  {
    name: 'Leah Gustafsson',
    organization: 'Global Affairs Canada — Strategic Communications',
    notes: null,
    emails: ['leah.gustafsson@international.gc.ca'],
    phones: ['+1 613 555 1727'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/leah-gustafsson-gac' }],
  },
  {
    name: 'Magistrate Thomas Dunmore-Baines',
    organization: 'Ontario Court of Justice',
    notes:
      'Retired. Presided over the 2018 environmental penalty hearings that critics say resulted in inadequate fines. Available for background comment on judicial process — not on his own rulings.',
    emails: ['tdunmore@hotmail.com'],
    phones: ['+1 519 555 1813'],
    links: [],
  },
  {
    name: 'Sergeant Félicia Comeau',
    organization: 'Sûreté du Québec — Organized Crime',
    notes:
      'Background source on the Montreal port corruption file. Has not been willing to go on record. Reliable for confirming or denying facts we surface independently.',
    emails: ['f.comeau@sq.gouv.qc.ca'],
    phones: ['+1 450 555 1955'],
    links: [],
  },
  {
    name: 'Hamish Blackwood',
    organization: 'Clifford Chance LLP — London',
    notes:
      "Partner handling UK-side litigation in the offshore trust case. Brief correspondence via LinkedIn so far. May travel to Toronto in the fall for depositions.",
    emails: ['hamish.blackwood@cliffordchance.com'],
    phones: ['+44 20 7946 0301'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/hamish-blackwood-cc' }],
  },
  {
    name: 'Renata Filipowicz',
    organization: 'Office of the Auditor General of Canada',
    notes:
      'Principal auditor on the infrastructure transfers file. Spoke briefly at a conference. Will not confirm specifics but usefully indicates areas of focus.',
    emails: ['r.filipowicz@oag-bvg.gc.ca'],
    phones: ['+1 613 555 2041'],
    links: [],
  },
  {
    name: 'Carlo Desjardins',
    organization: 'Desjardins Group',
    notes: null,
    emails: ['carlo.desjardins@desjardins.com'],
    phones: ['+1 514 555 2188', '+1 438 555 0099'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/carlo-desjardins-fin' }],
  },
  {
    name: 'Mayor Colette Abara',
    organization: 'City of Brampton',
    notes:
      'Elected in 2022 on a transparency platform but has since blocked several open-data initiatives. Her Chief of Staff, Rahul Nair, is the real gatekeeper. Press office is aggressive — document all interactions.',
    emails: ['mayor@brampton.ca'],
    phones: ['+1 905 555 2299'],
    links: [
      { type: 'x', url: 'https://x.com/MayorAbaraBrampton' },
      { type: 'facebook', url: 'https://facebook.com/MayorColetteAbara' },
    ],
  },
];
