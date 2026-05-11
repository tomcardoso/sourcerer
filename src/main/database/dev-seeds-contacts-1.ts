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
    name: 'Councillor Diane Ferreira',
    organization: 'City of Westmarch — Ward 9',
    notes:
      'Chairs the infrastructure committee and has received significant developer donations. Her office has stonewalled three freedom-of-information requests. Personal cell reportedly routed through a campaign staffer.',
    emails: ['d.ferreira@westmarch.example', 'ferreira.ward9@pressbox.example'],
    phones: ['+1 363 555 0101', '+1 363 555 0188'],
    links: [
      { type: 'x', url: 'https://x.com/ferreira_ward9' },
      { type: 'linkedin', url: 'https://linkedin.com/in/diane-ferreira-westmarch' },
    ],
  },
  {
    name: 'Marcus Owusu-Boateng',
    organization: 'Province of Cascadia — Ministry of Municipal Affairs',
    notes:
      'Senior policy director. Has been a quiet source on the land-use file — prefers Signal. Connected to the Deputy Minister through a previous role at Infrastructure Cascadia.',
    emails: ['m.owusuboateng@cascadia.example'],
    phones: ['+1 265 555 0234'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/marcus-owusu-boateng' }],
  },
  {
    name: 'Vivienne Tran',
    organization: 'Northgate Barristers',
    notes:
      'Specialist in municipal land-use and development law. Represents several players implicated in the rezoning file. Will not confirm or deny client relationships.',
    emails: ['vtran@northgatelaw.example'],
    phones: ['+1 363 555 0312'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/vivienne-tran-northgate' }],
  },
  {
    name: 'Staff Insp. Robert Kalinowski',
    organization: 'Westmarch Police Service — Financial Crimes',
    notes: null,
    emails: ['r.kalinowski@westmarchpolice.example'],
    phones: ['+1 363 555 0451'],
    links: [],
  },
  {
    name: 'Dr. Ananya Krishnamurthy',
    organization: 'Cascadia Public Health Agency',
    notes:
      'Epidemiologist specializing in environmental health. Authored a suppressed internal report on industrial contamination near the Lakeview industrial corridor. Currently on secondment to the federal health ministry.',
    emails: ['a.krishnamurthy@cpha.example', 'ananya.k@fedhealth.example'],
    phones: ['+1 265 555 0199'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/ananya-krishnamurthy-phd' },
      { type: 'x', url: 'https://x.com/drkrishnamurthy' },
    ],
  },
  {
    name: 'Gordon Whitfield',
    organization: 'Meridian Capital Markets',
    notes:
      'VP, Structured Finance. Involved in underwriting deals for several condo developers under scrutiny. His assistant screens all calls — email is the only reliable channel.',
    emails: ['gordon.whitfield@meridiancm.example'],
    phones: ['+1 363 555 0580'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/gordon-whitfield-meridian' }],
  },
  {
    name: 'Priya Subramaniam',
    organization: 'Broadsheet Investigations',
    notes:
      'Competing journalist working the same rezoning angle. Shares occasional tips on sources already burned. Do not share exclusive documents. Friendly but rivalry is real.',
    emails: ['p.subramaniam@broadsheetinv.example'],
    phones: ['+1 363 555 0611'],
    links: [
      { type: 'x', url: 'https://x.com/priya_investigates' },
      { type: 'linkedin', url: 'https://linkedin.com/in/priya-subramaniam-broadsheet' },
    ],
  },
  {
    name: 'Ted Molnar',
    organization: 'Cascadia Legislature — Opposition Research Office',
    notes: null,
    emails: ['t.molnar@oppositionresearch.example'],
    phones: ['+1 582 555 0742'],
    links: [],
  },
  {
    name: 'Sylvie Archambault',
    organization: 'Fédération des travailleurs de Laurentie',
    notes:
      'Regional director. Source on the port labour dispute and related kickback allegations. Speaks only French in formal settings; bilingual off-record.',
    emails: ['s.archambault@ftl-laurentie.example'],
    phones: ['+1 438 555 0887'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/sylvie-archambault-ftl' }],
  },
  {
    name: 'Deputy Commissioner Harlan Bryce',
    organization: 'Federal Investigative Police — Commercial Crime',
    notes:
      'Leads the national task force investigating pension fund irregularities. Has pushed back on access-to-information requests. Personal aide sometimes more forthcoming than Bryce himself.',
    emails: ['h.bryce@fip-pfi.example'],
    phones: ['+1 582 555 0921', '+1 582 555 0038'],
    links: [],
  },
  {
    name: 'Ngozi Okafor-Ellis',
    organization: 'Halcyon, Selby & Partners LLP',
    notes:
      'Forensic accountant and expert witness retained in three ongoing class actions. Deeply knowledgeable about real-estate trust structures under scrutiny. Prefers in-person meetings.',
    emails: ['nokafor-ellis@halcyonselby.example', 'ngozi.ellis.work@securemail.example'],
    phones: ['+1 363 555 1003'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/ngozi-okafor-ellis' }],
  },
  {
    name: 'Alderman Frank Sorrentino',
    organization: 'Harbourne City Council — Planning & Economic Development',
    notes: null,
    emails: ['f.sorrentino@harbourne.example'],
    phones: ['+1 265 555 1122'],
    links: [{ type: 'facebook', url: 'https://facebook.com/franksorrentino.harbourne' }],
  },
  {
    name: 'Catherine Mwangi',
    organization: 'National Export Finance Corporation',
    notes:
      'Risk analyst who flagged irregularities in an overseas infrastructure loan portfolio. Filed an internal complaint that was not actioned. Potential whistleblower — approach carefully.',
    emails: ['c.mwangi@nefc.example'],
    phones: ['+1 582 555 1244'],
    links: [],
  },
  {
    name: 'Dr. Jean-Paul Hébert',
    organization: 'Université de Laurentie — School of Public Policy',
    notes:
      'Former federal deputy minister, now academic. Published critical analysis of pension fund governance failures. Happy to speak on background.',
    emails: ['jp.hebert@univ-laurentie.example'],
    phones: ['+1 438 555 1366'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/jean-paul-hebert-udl' },
      { type: 'website', url: 'https://hebert.univ-laurentie.example' },
    ],
  },
  {
    name: 'Sandra Woo-Patel',
    organization: 'Woodbourne Capital Partners',
    notes:
      'Managing partner at a private equity firm with positions in three of the contaminated sites. Her firm has donated to four sitting federal MPs. Has not responded to prior outreach.',
    emails: ['swoo@woodbournecapital.example'],
    phones: ['+1 363 555 1499'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/sandra-woo-patel' }],
  },
  {
    name: 'James Calloway',
    organization: 'Fictional Bureau of Investigation — Economic Crimes Division',
    notes: null,
    emails: ['j.calloway@fbi-ecd.example'],
    phones: ['+1 582 555 0147'],
    links: [],
  },
  {
    name: 'Oksana Petrenko',
    organization: 'Veltrian Diaspora Council',
    notes:
      'Executive director and vocal critic of a national mining company operating near the Veltrian border. Has documentation the company disputes. Meeting scheduled for next month.',
    emails: ['o.petrenko@veltrian-diaspora.example', 'oksana.petrenko@securemail.example'],
    phones: ['+1 265 555 1581'],
    links: [{ type: 'x', url: 'https://x.com/OksanaPetrenko_VDC' }],
  },
  {
    name: 'Chief Medical Officer Dr. Farrukh Tashkentov',
    organization: 'Lakelands District Health Unit',
    notes:
      'Has internal data on elevated lead levels in drinking water in the region. The health unit delayed publication under pressure from regional government. Data embargo ends Q3.',
    emails: ['f.tashkentov@ldhu.example'],
    phones: ['+1 363 555 1634'],
    links: [],
  },
  {
    name: 'Leah Gustafsson',
    organization: 'Ministry of Global Relations — Strategic Communications',
    notes: null,
    emails: ['l.gustafsson@global-relations.example'],
    phones: ['+1 582 555 1727'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/leah-gustafsson-mgr' }],
  },
  {
    name: 'Magistrate Thomas Dunmore-Baines',
    organization: 'Cascadia Court of Justice (ret.)',
    notes:
      'Retired. Presided over environmental penalty hearings that critics say resulted in inadequate fines. Available for background comment on judicial process — not on his own rulings.',
    emails: ['tdunmore-baines@retiredjudges.example'],
    phones: ['+1 265 555 1813'],
    links: [],
  },
  {
    name: 'Sergeant Félicia Comeau',
    organization: 'Laurentie Provincial Police — Organized Crime Unit',
    notes:
      'Background source on the port corruption file. Has not been willing to go on record. Reliable for confirming or denying facts surfaced independently.',
    emails: ['f.comeau@lpp-ocu.example'],
    phones: ['+1 438 555 1955'],
    links: [],
  },
  {
    name: 'Hamish Blackwood',
    organization: 'Clifton & Wray LLP — London',
    notes:
      'Partner handling UK-side litigation in the offshore trust case. Brief correspondence via LinkedIn so far. May travel for depositions in the fall.',
    emails: ['h.blackwood@cliftonwray.example'],
    phones: ['+44 20 7946 0301'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/hamish-blackwood-cw' }],
  },
  {
    name: 'Renata Filipowicz',
    organization: 'Office of the Auditor General — Infrastructure Division',
    notes:
      'Principal auditor on the infrastructure transfers file. Spoke briefly at a conference. Will not confirm specifics but usefully indicates areas of focus.',
    emails: ['r.filipowicz@auditor-general.example'],
    phones: ['+1 582 555 2041'],
    links: [],
  },
  {
    name: 'Carlo Desjardins',
    organization: 'Rivière Financial Group',
    notes: null,
    emails: ['c.desjardins@rivierefin.example'],
    phones: ['+1 438 555 2188', '+1 438 555 0099'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/carlo-desjardins-rfg' }],
  },
  {
    name: 'Mayor Colette Abara',
    organization: 'City of Harbourne',
    notes:
      'Elected on a transparency platform but has since blocked several open-data initiatives. Her Chief of Staff, Rahul Nair, is the real gatekeeper. Press office is aggressive — document all interactions.',
    emails: ['mayor@harbourne.example'],
    phones: ['+1 265 555 2299'],
    links: [
      { type: 'x', url: 'https://x.com/MayorAbaraHarbourne' },
      { type: 'facebook', url: 'https://facebook.com/MayorColetteAbara.Harbourne' },
    ],
  },
];
