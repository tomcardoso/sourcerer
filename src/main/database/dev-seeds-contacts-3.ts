interface SeedContact {
  name: string;
  organization: string | null;
  notes: string | null;
  emails: string[];
  phones: string[];
  links: { type: 'linkedin' | 'x' | 'website' | 'facebook' | 'instagram' | 'other'; url: string }[];
}

export const CONTACTS_3: SeedContact[] = [
  {
    name: 'Randall Chu-Nakamura',
    organization: 'Brookfield Asset Management',
    notes:
      'Senior VP overseeing infrastructure fund with positions in three privatized long-term care chains. Has avoided all press contact since the 2023 Senate committee appearance. His EA sometimes passes messages.',
    emails: ['rchu@brookfield.com', 'rchu.nakamura@gmail.com'],
    phones: ['+1 416 555 5101', '+1 416 555 5144'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/randall-chu-nakamura' },
    ],
  },
  {
    name: 'Dominique Paquin-Sévigny',
    organization: 'Groupe Immobilier Paquin',
    notes:
      'Principal of a Quebec City developer linked to three municipal zoning amendments that bypassed public consultation. Donated to the mayor\'s campaign within 30 days of each approval.',
    emails: ['d.paquin@groupepaquin.com'],
    phones: ['+1 418 555 5219'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/dominique-paquin-sevigny' },
      { type: 'facebook', url: 'https://facebook.com/GroupeImmobilierPaquin' },
    ],
  },
  {
    name: 'Astrid Bergqvist',
    organization: 'Nordea Investment Management — Stockholm',
    notes: null,
    emails: ['astrid.bergqvist@nordea.com'],
    phones: ['+46 8 614 7801'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/astrid-bergqvist-nordea' }],
  },
  {
    name: 'Warren Thickett',
    organization: 'Thickett & Associates Lobbying',
    notes:
      'Ottawa lobbyist registered on behalf of four pharmaceutical companies and a private prison operator simultaneously. Disclosure filings show 47 contacts with cabinet staff over 18 months.',
    emails: ['warren@thickettassociates.ca', 'wthickett@lobbyist.gc.ca'],
    phones: ['+1 613 555 5331', '+1 613 555 5388'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/warren-thickett-lobbyist' },
      { type: 'website', url: 'https://thickettassociates.ca' },
    ],
  },
  {
    name: 'Chantal Beaubien',
    organization: 'Pharmavance Canada',
    notes:
      'VP of Government Affairs. Main point of contact for our right-of-reply on the opioid pricing investigation. Legal has instructed her to route all responses through outside counsel.',
    emails: ['c.beaubien@pharmavance.ca'],
    phones: ['+1 514 555 5447'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/chantal-beaubien-pharma' }],
  },
  {
    name: 'Oliver Pemberton-Nash',
    organization: 'Norton Rose Fulbright — London',
    notes: null,
    emails: ['oliver.pemberton-nash@nortonrosefulbright.com'],
    phones: ['+44 20 7946 0501'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/oliver-pemberton-nash' }],
  },
  {
    name: 'Eunice Addo-Yeboah',
    organization: 'Laurentian Bank — Commercial Real Estate',
    notes:
      'Director of credit risk who flagged concentration of lending to a single developer group before the bank\'s collapse. Her internal memo was listed as a privileged document in the OSC inquiry. Has since moved to a boutique advisory firm.',
    emails: ['eunice.addo@laurentian.com', 'eaddo.yeboah@prospectadvisory.ca', 'eunice.addoyeboah@gmail.com'],
    phones: ['+1 514 555 5563'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/eunice-addo-yeboah' }],
  },
  {
    name: 'Brett Holloway',
    organization: 'Suncor Energy',
    notes:
      'Communications director. Responds to all press queries with boilerplate. Worth sending written questions for the record even if no substantive response is expected.',
    emails: ['brett.holloway@suncor.com'],
    phones: ['+1 403 555 5681'],
    links: [],
  },
  {
    name: 'Hana Novotný',
    organization: 'Czech Trade Promotion Agency — Ottawa',
    notes: null,
    emails: [],
    phones: [],
    links: [],
  },
  {
    name: 'Tyler Deschênes',
    organization: 'Deschênes Capital Group',
    notes:
      'Family-office principal whose fund is a significant limited partner in the long-term care REIT under investigation. His name does not appear on public filings — surfaced through shell company ownership records obtained from a leak.',
    emails: ['t.deschenes@dcgroupinc.com'],
    phones: ['+1 416 555 5794', '+1 905 555 5837'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/tyler-deschenes-capital' }],
  },
  {
    name: 'Miroslava Horvatová',
    organization: 'Slovak Financial Intelligence Unit',
    notes:
      'Deputy director. Has shared typology reports on Canadian real estate used for money laundering with FINTRAC under the bilateral agreement. Communicates through official channels only.',
    emails: ['m.horvatova@jinf.sk'],
    phones: ['+421 2 5799 8801'],
    links: [],
  },
  {
    name: 'Philip Gauthier-Lessard',
    organization: 'Caisse de dépôt et placement du Québec',
    notes:
      'Portfolio manager, infrastructure. Manages the CDPQ stake in the P3 hospital project flagged for cost overruns. Former colleague confirmed he was aware of the independent engineer\'s concerns before they were disclosed to government.',
    emails: ['pgauthier@cdpq.com'],
    phones: ['+1 514 555 5912'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/philip-gauthier-lessard' }],
  },
  {
    name: 'Adrienne Kozlowski',
    organization: 'Shopify Inc.',
    notes: null,
    emails: ['a.kozlowski@shopify.com'],
    phones: ['+1 613 555 6028'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/adrienne-kozlowski-shopify' }],
  },
  {
    name: 'Desmond Asamoah-Frimpong',
    organization: 'Granite REIT',
    notes:
      'COO. The REIT holds title to three distribution centres built on land that was remediated — or purportedly remediated — by a company connected to our contamination investigation. Purchase price raises questions about what they knew.',
    emails: ['d.asamoah@granitreit.com', 'desmond.asamoah@gmail.com'],
    phones: ['+1 416 555 6149'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/desmond-asamoah-frimpong' }],
  },
  {
    name: 'Carolyn Varga-Steele',
    organization: null,
    notes:
      'Former VP at a redacted pharmaceutical distributor. Signed a NDA as part of her severance. May be willing to speak as an unnamed source about internal pricing decisions. Attorney confirms she received our letter.',
    emails: ['cvargasteele@proton.me'],
    phones: [],
    links: [],
  },
  {
    name: 'Nathaniel Crossfield',
    organization: 'OMERS Private Equity',
    notes: null,
    emails: ['n.crossfield@omers.com'],
    phones: ['+1 416 555 6257'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/nathaniel-crossfield-omers' }],
  },
  {
    name: 'Isabelle Fontaine-Duplessis',
    organization: 'Agence France-Trésor — Paris',
    notes:
      'Manages French sovereign exposure to Canadian infrastructure bonds. Met at a conference in London. Background source on how European institutional investors view the regulatory risk in Canadian P3 deals.',
    emails: ['i.fontaine@aft.gouv.fr'],
    phones: ['+33 1 4004 1551'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/isabelle-fontaine-duplessis' }],
  },
  {
    name: 'Greg Slatten',
    organization: 'SNC-Lavalin Group',
    notes:
      'Government relations director. On the lobbying registry for 23 active files. Connected the previous CEO to the federal ministers at the centre of the deferred prosecution controversy. Hard to reach; responds only to written queries.',
    emails: ['greg.slatten@snclavalin.com'],
    phones: ['+1 514 555 6374'],
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
    organization: 'Canaccord Genuity',
    notes:
      'Managing director, equity capital markets. Underwriter on two IPOs for companies now under OSC investigation for prospectus misrepresentation. Has not replied to three email attempts.',
    emails: ['cdrayton@canaccord.com'],
    phones: ['+1 416 555 6498'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/cynthia-drayton-canaccord' }],
  },
  {
    name: 'Luca Borromeo',
    organization: 'Mediobanca — Milan',
    notes:
      'Head of cross-border M&A. Advised on the acquisition of the Canadian pharma distributor by a Luxembourg holding structure. Has spoken to our Rome correspondent. Will consider a call.',
    emails: ['l.borromeo@mediobanca.it', 'luca.borromeo@proton.me'],
    phones: ['+39 02 8829 1701'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/luca-borromeo-mediobanca' }],
  },
  {
    name: 'Amber Christiansen-Park',
    organization: 'GreenFirst Forest Products',
    notes:
      'Investor relations. Company holds provincial timber licences that were quietly transferred from a Crown corporation at below-market rates. IR answers are carefully worded — useful to log verbatim.',
    emails: ['a.christiansen@greenfirst.ca'],
    phones: ['+1 416 555 6612'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/amber-christiansen-park' },
      { type: 'x', url: 'https://x.com/greenfirstir' },
    ],
  },
  {
    name: 'Patrick Villeneuve',
    organization: 'Investissement Québec',
    notes: null,
    emails: ['p.villeneuve@investissement-quebec.com'],
    phones: ['+1 514 555 6729'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/patrick-villeneuve-iq' }],
  },
  {
    name: 'Rowena Bautista-Cruz',
    organization: 'Community Legal Clinic of York Region',
    notes:
      'Staff lawyer representing tenants displaced by a developer whose principals overlap with those in our housing fraud investigation. Has filed an SLAPP defence on behalf of three of her clients.',
    emails: ['r.bautista@yorkregionlegal.ca', 'rowenabcruz@gmail.com'],
    phones: ['+1 905 555 6841', '+1 647 555 6887'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/rowena-bautista-cruz' },
      { type: 'x', url: 'https://x.com/rowenabclegal' },
    ],
  },
  {
    name: 'Hendrik van der Merwe',
    organization: 'Macquarie Infrastructure — Sydney',
    notes:
      'Principal overseeing Macquarie\'s Canadian toll-road fund. Australian regulator reviewed similar deal structures in 2021 — useful comparison jurisdiction for our P3 analysis.',
    emails: ['h.vandermerwe@macquarie.com'],
    phones: ['+61 2 8232 3301'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/hendrik-van-der-merwe-macquarie' }],
  },
];
