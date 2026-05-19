interface SeedContact {
  name: string;
  organization: string | null;
  title?: string | null;
  dob?: string | null;
  notes: string | null;
  emails: string[];
  phones: string[];
  links: { type: 'linkedin' | 'x' | 'website' | 'facebook' | 'instagram' | 'other'; url: string }[];
  handles?: { type: 'signal' | 'whatsapp' | 'telegram' | 'other'; handle: string }[];
}

export const CONTACTS_3: SeedContact[] = [
  {
    name: 'Randall Chu-Nakamura',
    organization: 'Ridgemont Asset Management',
    title: 'Senior Vice-President',
    dob: '1975-06-28',
    notes:
      'Senior VP overseeing an infrastructure fund with positions in three privatized long-term care chains. Has avoided all press contact since a parliamentary committee hearing. His EA sometimes passes messages.',
    emails: ['rchu@ridgemont-am.example', 'rchu.nakamura@securemail.example'],
    phones: ['+1 363 555 5101', '+1 363 555 5144'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/randall-chu-nakamura' },
    ],
  },
  {
    name: 'Dominique Paquin-Sévigny',
    organization: 'Groupe Immobilier Paquin',
    title: 'Real Estate Developer',
    dob: '1971-10-04',
    notes:
      'Principal of a Laurentie developer linked to three municipal zoning amendments that bypassed public consultation. Donated to the mayor\'s campaign within 30 days of each approval.',
    emails: ['d.paquin@groupepaquin.example'],
    phones: ['+1 438 555 5219'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/dominique-paquin-sevigny' },
      { type: 'facebook', url: 'https://facebook.com/GroupeImmobilierPaquin' },
    ],
  },
  {
    name: 'Astrid Bergqvist',
    organization: 'Norresund Investment AB — Stockholm',
    notes: null,
    emails: ['astrid.bergqvist@norresund.example'],
    phones: ['+46 8 614 7801'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/astrid-bergqvist-norresund' }],
  },
  {
    name: 'Warren Thickett',
    organization: 'Thickett & Associates Lobbying',
    title: 'Principal Lobbyist',
    notes:
      'Capital lobbyist registered on behalf of four pharmaceutical companies and a private prison operator simultaneously. Disclosure filings show 47 contacts with cabinet staff over 18 months.',
    emails: ['warren@thickettassociates.example', 'wthickett@lobbyregistry.gov.example'],
    phones: ['+1 582 555 5331', '+1 582 555 5388'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/warren-thickett-lobbyist' },
      { type: 'website', url: 'https://thickettassociates.example' },
    ],
  },
  {
    name: 'Chantal Beaubien',
    organization: 'Pharmavance Canada',
    title: 'VP, Government Affairs',
    notes:
      'VP of Government Affairs. Main point of contact for our right-of-reply on the opioid pricing investigation. Legal has instructed her to route all responses through outside counsel.',
    emails: ['c.beaubien@pharmavance.example'],
    phones: ['+1 438 555 5447'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/chantal-beaubien-pharma' }],
  },
  {
    name: 'Oliver Pemberton-Nash',
    organization: 'Aldgate & Wentworth LLP — London',
    notes: null,
    emails: ['oliver.pemberton-nash@aldgatewentworth.example'],
    phones: ['+44 20 7946 0501'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/oliver-pemberton-nash' }],
  },
  {
    name: 'Eunice Addo-Yeboah',
    organization: 'Champlain Commercial Bank — Commercial Real Estate',
    title: 'Director of Credit Risk',
    notes:
      'Director of credit risk who flagged concentration of lending to a single developer group before the bank\'s collapse. Her internal memo was listed as a privileged document in the provincial securities commission inquiry. Has since moved to a boutique advisory firm.',
    emails: ['eunice.addo@champlainbank.example', 'eaddo.yeboah@prospectadvisory.example', 'e.addoyeboah@securemail.example'],
    phones: ['+1 438 555 5563'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/eunice-addo-yeboah' }],
    handles: [{ type: 'signal', handle: '@eunice.addo' }],
  },
  {
    name: 'Brett Holloway',
    organization: 'Calderon Energy Corp',
    title: 'Communications Director',
    notes:
      'Communications director. Responds to all press queries with boilerplate. Worth sending written questions for the record even if no substantive response is expected.',
    emails: ['brett.holloway@calderonenergy.example'],
    phones: ['+1 582 555 5681'],
    links: [],
  },
  {
    name: 'Hana Novotný',
    organization: 'Czech Trade Promotion Agency — Capital Office',
    notes: null,
    emails: [],
    phones: [],
    links: [],
  },
  {
    name: 'Tyler Deschênes',
    organization: 'Deschênes Capital Group',
    title: 'Fund Principal',
    notes:
      'Family-office principal whose fund is a significant limited partner in the long-term care REIT under investigation. His name does not appear on public filings — surfaced through shell company ownership records obtained from a leak.',
    emails: ['t.deschenes@dcgroupinc.example'],
    phones: ['+1 363 555 5794', '+1 582 555 5837'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/tyler-deschenes-capital' }],
  },
  {
    name: 'Miroslava Horvatová',
    organization: 'Bratislavan Financial Intelligence Unit',
    title: 'Deputy Director',
    notes:
      'Deputy director. Has shared typology reports on domestic real estate used for money laundering with the national financial intelligence unit under the bilateral agreement. Communicates through official channels only.',
    emails: ['m.horvatova@bfiu.example'],
    phones: ['+421 2 5799 8801'],
    links: [],
  },
  {
    name: 'Philip Gauthier-Lessard',
    organization: 'Fonds de placement de Laurentie',
    title: 'Portfolio Manager',
    notes:
      'Portfolio manager, infrastructure. Manages the fund\'s stake in the P3 hospital project flagged for cost overruns. Former colleague confirmed he was aware of the independent engineer\'s concerns before they were disclosed to government.',
    emails: ['pgauthier@fplaurentiefonds.example'],
    phones: ['+1 438 555 5912'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/philip-gauthier-lessard' }],
  },
  {
    name: 'Adrienne Kozlowski',
    organization: 'Vantrel Commerce Inc.',
    dob: '1983-01-17',
    notes: null,
    emails: ['a.kozlowski@vantrel.example'],
    phones: ['+1 582 555 6028'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/adrienne-kozlowski' }],
  },
  {
    name: 'Desmond Asamoah-Frimpong',
    organization: 'Cornerstone Property Trust',
    title: 'Chief Operating Officer',
    notes:
      'COO. The trust holds title to three distribution centres built on land that was remediated — or purportedly remediated — by a company connected to our contamination investigation. Purchase price raises questions about what they knew.',
    emails: ['d.asamoah@cornerstonereit.example', 'd.asamoah@securemail.example'],
    phones: ['+1 363 555 6149'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/desmond-asamoah-frimpong' }],
  },
  {
    name: 'Carolyn Varga-Steele',
    organization: null,
    title: 'Former VP, Pharmaceutical Distribution',
    notes:
      'Former VP at a redacted pharmaceutical distributor. Signed a NDA as part of her severance. May be willing to speak as an unnamed source about internal pricing decisions. Attorney confirms she received our letter.',
    emails: ['cvargasteele@securemail.example'],
    phones: [],
    links: [],
  },
  {
    name: 'Nathaniel Crossfield',
    organization: 'Provincial Employees Pension Fund — Private Equity',
    notes: null,
    emails: ['n.crossfield@pepf.example'],
    phones: ['+1 363 555 6257'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/nathaniel-crossfield' }],
  },
  {
    name: 'Isabelle Fontaine-Duplessis',
    organization: 'Direction du Trésor — Paris',
    title: 'Senior Economist',
    notes:
      'Manages French sovereign exposure to domestic infrastructure bonds. Met at a conference in London. Background source on how European institutional investors view the regulatory risk in P3 deals.',
    emails: ['i.fontaine@tresor.gouv.example'],
    phones: ['+33 1 4004 1551'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/isabelle-fontaine-duplessis' }],
    handles: [{ type: 'whatsapp', handle: '+33 1 4004 1551' }],
  },
  {
    name: 'Greg Slatten',
    organization: 'Carleton-Hartwell Engineering Group',
    title: 'Government Relations Director',
    notes:
      'Government relations director. On the lobbying registry for 23 active files. Connected the previous CEO to federal ministers at the centre of the deferred prosecution arrangement controversy. Hard to reach; responds only to written queries.',
    emails: ['greg.slatten@cheg.example'],
    phones: ['+1 438 555 6374'],
    links: [],
  },
  {
    name: 'Fumiko Yamaguchi',
    organization: 'Tokyo Metropolitan Government — Investment Promotion',
    notes: null,
    emails: [],
    phones: [],
    links: [],
  },
  {
    name: 'Cynthia Drayton',
    organization: 'Dominion Securities Capital',
    title: 'Managing Director',
    notes:
      'Managing director, equity capital markets. Underwriter on two IPOs for companies now under securities regulator investigation for prospectus misrepresentation. Has not replied to three email attempts.',
    emails: ['cdrayton@dominionsc.example'],
    phones: ['+1 363 555 6498'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/cynthia-drayton' }],
  },
  {
    name: 'Luca Borromeo',
    organization: 'Borsa Meridionale — Milan',
    title: 'Head of Cross-Border M&A',
    notes:
      'Head of cross-border M&A. Advised on the acquisition of the domestic pharma distributor by a Luxembourg holding structure. Has spoken to our Rome correspondent. Will consider a call.',
    emails: ['l.borromeo@borsameri.example', 'luca.borromeo@securemail.example'],
    phones: ['+39 02 8829 1701'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/luca-borromeo' }],
    handles: [{ type: 'whatsapp', handle: '+39 02 8829 1701' }],
  },
  {
    name: 'Amber Christiansen-Park',
    organization: 'PacificTimber Resources',
    title: 'Investor Relations Manager',
    notes:
      'Investor relations. Company holds provincial timber licences that were quietly transferred from a Crown corporation at below-market rates. IR answers are carefully worded — useful to log verbatim.',
    emails: ['a.christiansen@pacifictimber.example'],
    phones: ['+1 363 555 6612'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/amber-christiansen-park' },
      { type: 'x', url: 'https://x.com/pacifictimberir' },
    ],
  },
  {
    name: 'Patrick Villeneuve',
    organization: 'Capital Laurentie',
    notes: null,
    emails: ['p.villeneuve@capital-laurentie.example'],
    phones: ['+1 438 555 6729'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/patrick-villeneuve' }],
  },
  {
    name: 'Rowena Bautista-Cruz',
    organization: 'Westmarch Community Legal Clinic',
    title: 'Staff Lawyer',
    notes:
      'Staff lawyer representing tenants displaced by a developer whose principals overlap with those in our housing fraud investigation. Has filed an SLAPP defence on behalf of three of her clients.',
    emails: ['r.bautista@westmarchlegal.example', 'r.bautista.cruz@securemail.example'],
    phones: ['+1 363 555 6841', '+1 582 555 6887'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/rowena-bautista-cruz' },
      { type: 'x', url: 'https://x.com/rowenabclegal' },
    ],
  },
  {
    name: 'Hendrik van der Merwe',
    organization: 'Harbourside Infrastructure Fund — Sydney',
    title: 'Infrastructure Fund Principal',
    notes:
      'Principal overseeing the fund\'s domestic toll-road investments. Australian regulators reviewed similar deal structures in 2021 — useful comparison jurisdiction for our P3 analysis.',
    emails: ['h.vandermerwe@harbourside-infra.example'],
    phones: ['+61 2 8232 3301'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/hendrik-van-der-merwe' }],
    handles: [{ type: 'whatsapp', handle: '+61 2 8232 3301' }],
  },
];
