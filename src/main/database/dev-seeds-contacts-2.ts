interface SeedContact {
  name: string;
  organization: string | null;
  notes: string | null;
  emails: string[];
  phones: string[];
  links: { type: 'linkedin' | 'x' | 'website' | 'facebook' | 'instagram' | 'other'; url: string }[];
}

export const CONTACTS_2: SeedContact[] = [
  {
    name: 'Bertrand Lacombe',
    organization: 'Confédération des syndicats nationaux',
    notes:
      'Lead negotiator on the nursing shortage file. Has internal grievance data from three hospital regions that have not been made public. Prefers contact after 5 p.m.',
    emails: ['b.lacombe@csn.qc.ca'],
    phones: ['+1 514 555 2301'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/bertrand-lacombe-csn' }],
  },
  {
    name: 'Dr. Patience Adusei-Mensah',
    organization: 'Vancouver General Hospital — Infectious Disease',
    notes:
      'Published dissenting memo on pandemic PPE procurement. Her research institution received reduced funding the following fiscal year. Willing to speak on background.',
    emails: ['p.adusei-mensah@vch.ca'],
    phones: ['+1 604 555 2417'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/patience-adusei-mensah' },
      { type: 'x', url: 'https://x.com/dr_adusei' },
    ],
  },
  {
    name: 'Kevin Stelmach',
    organization: 'Alberta Union of Provincial Employees',
    notes: null,
    emails: ['kstelmach@aupe.org'],
    phones: ['+1 780 555 2534'],
    links: [],
  },
  {
    name: 'Prof. Miriam Goldstein-Lau',
    organization: 'UBC School of Law — Indigenous Rights Clinic',
    notes:
      'Specialist in resource extraction and treaty rights. Has reviewed the confidential co-management agreements at the centre of the pipeline dispute. Will testify as expert witness.',
    emails: ['mgoldstein@law.ubc.ca'],
    phones: ['+1 604 555 2651'],
    links: [
      { type: 'website', url: 'https://law.ubc.ca/faculty/miriam-goldstein-lau' },
      { type: 'linkedin', url: 'https://linkedin.com/in/miriam-goldstein-lau' },
    ],
  },
  {
    name: 'Theresa Ouellet-Gauvin',
    organization: 'Centre hospitalier universitaire de Québec',
    notes:
      'Chief nursing officer. Filed an internal report on understaffing that the hospital board buried. Union rep confirmed she was subsequently passed over for promotion.',
    emails: ['t.ouellet-gauvin@chuq.qc.ca', 'theresa.ouellet@hotmail.com'],
    phones: ['+1 418 555 2744'],
    links: [],
  },
  {
    name: 'Rashid Abdirahman',
    organization: 'Manitoba Ombudsman',
    notes: null,
    emails: ['r.abdirahman@ombudsman.mb.ca'],
    phones: ['+1 204 555 2867'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/rashid-abdirahman-mb' }],
  },
  {
    name: 'Dr. Ingrid Svensson-Park',
    organization: 'Simon Fraser University — Environmental Science',
    notes:
      'Authored the independent assessment of tailings pond integrity at the Elk Valley mine. Received a cease-and-desist from the mining company\'s lawyers. Speaking with legal counsel before further comment.',
    emails: ['i.svensson@sfu.ca'],
    phones: ['+1 778 555 2983'],
    links: [
      { type: 'x', url: 'https://x.com/svenssonpark_env' },
      { type: 'website', url: 'https://sfu.ca/envs/faculty/svensson-park' },
    ],
  },
  {
    name: 'Yusuf Abdullahi',
    organization: 'Canadian Council for Refugees',
    notes:
      'Policy director with access to internal CBSA data on detention conditions at Laval. Has filed two court affidavits in ongoing Charter challenges.',
    emails: ['y.abdullahi@ccrweb.ca'],
    phones: ['+1 514 555 3091'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/yusuf-abdullahi-ccr' },
      { type: 'x', url: 'https://x.com/yusuf_ccr' },
    ],
  },
  {
    name: 'Madeleine Tremblay-Côté',
    organization: 'Équiterre',
    notes:
      'Senior researcher on federal subsidies to fossil fuel industry. Her organization published an access-to-information database that the energy ministry tried to have taken down.',
    emails: ['mtremblay@equiterre.org'],
    phones: ['+1 514 555 3208'],
    links: [
      { type: 'x', url: 'https://x.com/madeleine_equiterre' },
      { type: 'linkedin', url: 'https://linkedin.com/in/madeleine-tremblay-cote' },
    ],
  },
  {
    name: 'Owen Blackstock',
    organization: 'Saskatchewan Health Authority',
    notes: null,
    emails: ['o.blackstock@saskhealthauthority.ca'],
    phones: ['+1 306 555 3314'],
    links: [],
  },
  {
    name: 'Prof. Amara Diallo-Kamara',
    organization: 'Dalhousie University — Marine Environmental Law',
    notes:
      'Monitors offshore drilling permit compliance in the Scotia Shelf. Provided key technical context for our earlier CAPP exposé. Easy to reach and forthcoming on background.',
    emails: ['a.diallo@dal.ca'],
    phones: ['+1 902 555 3427'],
    links: [
      { type: 'website', url: 'https://dal.ca/faculty/law/diallo-kamara' },
      { type: 'linkedin', url: 'https://linkedin.com/in/amara-diallo-kamara' },
    ],
  },
  {
    name: 'Nadia Karpenko',
    organization: 'Pembina Institute',
    notes:
      'Energy transition analyst specializing in coal-phase-out compliance. Has a source inside Natural Resources Canada who has flagged internal modelling discrepancies.',
    emails: ['nkarpenko@pembina.org'],
    phones: ['+1 403 555 3551'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/nadia-karpenko-pembina' }],
  },
  {
    name: 'Inspector Gilles Parenteau',
    organization: 'Sûreté du Québec — Major Crimes',
    notes: null,
    emails: ['g.parenteau@sq.gouv.qc.ca'],
    phones: ['+1 819 555 3668'],
    links: [],
  },
  {
    name: 'Dr. Susan Whitmore-Haig',
    organization: 'Centre for Addiction and Mental Health',
    notes:
      'Led the unreleased audit of Ontario\'s supportive housing contracts. Several providers audited have filed defamation notices against CAMH. Willing to share methodology, not findings, until legal clears it.',
    emails: ['s.whitmore@camh.ca'],
    phones: ['+1 416 555 3784'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/susan-whitmore-haig' }],
  },
  {
    name: 'Alejandro Fuentes-Ríos',
    organization: 'Federación de Trabajadores del Puerto — Buenos Aires',
    notes:
      'Source on Canadian pension fund investments in Argentine port infrastructure. Provided translated labour contracts and photos of site conditions. Contact via encrypted email only.',
    emails: ['afuentes@fedtrabajadores.org.ar', 'alejandro.fuentes@proton.me'],
    phones: ['+54 11 5555 3891'],
    links: [],
  },
  {
    name: 'Janet Koo',
    organization: 'BC Teachers\' Federation',
    notes:
      'Chief grievance officer. Has filed 14 complaints against school district IT procurement decisions that channelled contracts to a trustee-linked firm.',
    emails: ['jkoo@bctf.ca'],
    phones: ['+1 604 555 3905'],
    links: [
      { type: 'x', url: 'https://x.com/jkoo_bctf' },
      { type: 'linkedin', url: 'https://linkedin.com/in/janet-koo-bctf' },
    ],
  },
  {
    name: 'Prof. Henrik Daalmans',
    organization: 'Carleton University — School of Public Administration',
    notes: null,
    emails: ['h.daalmans@carleton.ca'],
    phones: ['+1 613 555 4017'],
    links: [{ type: 'website', url: 'https://carleton.ca/spa/faculty/daalmans' }],
  },
  {
    name: 'Constance Abiodun',
    organization: 'Office of the Privacy Commissioner of Canada',
    notes:
      'Senior investigator who handled the 2023 complaint against a federal biometric data program. Her office\'s redacted report contains sections I\'ve been trying to obtain via ATIP.',
    emails: ['c.abiodun@priv.gc.ca'],
    phones: ['+1 613 555 4143'],
    links: [],
  },
  {
    name: 'Trevor Colpitts',
    organization: 'New Brunswick Department of Environment',
    notes:
      'Regional enforcement officer who issued — then quietly withdrew — a compliance order against a pulp mill. Currently on administrative leave. Reached once through a mutual source.',
    emails: ['t.colpitts@gnb.ca', 'tcolpitts72@gmail.com'],
    phones: ['+1 506 555 4261'],
    links: [],
  },
  {
    name: 'Dr. Felicity Okonkwo',
    organization: 'McMaster University — Health Evidence Synthesis',
    notes:
      'Peer reviewer for the contested pharmaceutical efficacy studies. Has flagged methodology concerns in writing. Her department chair has asked her to route all media inquiries through the university\'s PR office.',
    emails: ['f.okonkwo@mcmaster.ca'],
    phones: ['+1 905 555 4378'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/felicity-okonkwo-mcmaster' }],
  },
  {
    name: 'Simon Beauchamp-Roy',
    organization: 'Institut du Nouveau Monde',
    notes: null,
    emails: ['sbeauchamp@inm.qc.ca'],
    phones: ['+1 514 555 4492'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/simon-beauchamp-roy' }],
  },
  {
    name: 'Anita Fong-Marquez',
    organization: 'Canada Border Services Agency — Intelligence',
    notes:
      'Mid-level analyst. Made contact after our CBSA story ran. Willing to verify documents but will not originate disclosures. Has a security clearance concern about direct email — suggested courier drop.',
    emails: [],
    phones: ['+1 343 555 4617'],
    links: [],
  },
  {
    name: 'Prof. David Adesanya',
    organization: 'University of Ottawa — Criminology',
    notes:
      'Specialist in white-collar crime enforcement gaps. Published the definitive study of deferred prosecution agreement usage in Canada. Reliable on-record expert voice.',
    emails: ['d.adesanya@uottawa.ca'],
    phones: ['+1 613 555 4734'],
    links: [
      { type: 'website', url: 'https://socialsciences.uottawa.ca/criminology/professors/adesanya' },
      { type: 'x', url: 'https://x.com/prof_adesanya' },
    ],
  },
  {
    name: 'Lorraine Hedley-Cross',
    organization: 'Yukon Environmental and Socio-economic Assessment Board',
    notes:
      'Review officer who flagged deficiencies in the Minto mine remediation plan. The board\'s public report was edited before release. She has the unredacted version.',
    emails: ['lhedley@yesab.ca'],
    phones: ['+1 867 555 4851'],
    links: [],
  },
  {
    name: 'Marco Pietrangelo',
    organization: 'Unifor — Local 222',
    notes:
      'President of the Oshawa plant local. Source on illegal subcontracting arrangements and safety violations after the 2024 line conversion. Keeps meticulous records. Will meet in person only.',
    emails: ['m.pietrangelo@unifor222.ca'],
    phones: ['+1 905 555 4968', '+1 905 555 5011'],
    links: [{ type: 'facebook', url: 'https://facebook.com/unifor222local' }],
  },
];
