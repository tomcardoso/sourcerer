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
    organization: 'Fédération des syndicats de Laurentie',
    notes:
      'Lead negotiator on the nursing shortage file. Has internal grievance data from three hospital regions that has not been made public. Prefers contact after 5 p.m.',
    emails: ['b.lacombe@fsl-laurentie.example'],
    phones: ['+1 438 555 2301'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/bertrand-lacombe-fsl' }],
  },
  {
    name: 'Dr. Patience Adusei-Mensah',
    organization: 'Westmarch General Hospital — Infectious Disease',
    notes:
      'Published a dissenting memo on pandemic PPE procurement. Her research institution received reduced funding the following fiscal year. Willing to speak on background.',
    emails: ['p.adusei-mensah@wgh.example'],
    phones: ['+1 363 555 2417'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/patience-adusei-mensah' },
      { type: 'x', url: 'https://x.com/dr_adusei' },
    ],
  },
  {
    name: 'Kevin Stelmach',
    organization: 'Cascadia Union of Provincial Employees',
    notes: null,
    emails: ['k.stelmach@cupe-cascadia.example'],
    phones: ['+1 265 555 2534'],
    links: [],
  },
  {
    name: 'Prof. Miriam Goldstein-Lau',
    organization: 'Ridgecrest University — School of Law, Indigenous Rights Clinic',
    notes:
      'Specialist in resource extraction and treaty rights. Has reviewed confidential co-management agreements at the centre of the pipeline dispute. Will testify as expert witness.',
    emails: ['m.goldstein@law.ridgecrest.example'],
    phones: ['+1 363 555 2651'],
    links: [
      { type: 'website', url: 'https://law.ridgecrest.example/faculty/goldstein-lau' },
      { type: 'linkedin', url: 'https://linkedin.com/in/miriam-goldstein-lau' },
    ],
  },
  {
    name: 'Theresa Ouellet-Gauvin',
    organization: 'Centre hospitalier universitaire de Laurentie',
    notes:
      'Chief nursing officer. Filed an internal report on understaffing that the hospital board buried. Union rep confirmed she was subsequently passed over for promotion.',
    emails: ['t.ouellet-gauvin@chul.example', 'theresa.ouellet@securemail.example'],
    phones: ['+1 438 555 2744'],
    links: [],
  },
  {
    name: 'Rashid Abdirahman',
    organization: 'Prairie Province Ombudsman',
    notes: null,
    emails: ['r.abdirahman@ombudsman.prairie.example'],
    phones: ['+1 582 555 2867'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/rashid-abdirahman-prairie' }],
  },
  {
    name: 'Dr. Ingrid Svensson-Park',
    organization: 'Hargreaves University — Environmental Science',
    notes:
      "Authored the independent assessment of tailings pond integrity at the Coldwater mine. Received a cease-and-desist from the mining company's lawyers. Speaking with legal counsel before further comment.",
    emails: ['i.svensson@hargreaves.example'],
    phones: ['+1 265 555 2983'],
    links: [
      { type: 'x', url: 'https://x.com/svenssonpark_env' },
      { type: 'website', url: 'https://hargreaves.example/envs/faculty/svensson-park' },
    ],
  },
  {
    name: 'Yusuf Abdullahi',
    organization: 'National Council for Displaced Persons',
    notes:
      'Policy director with access to internal border agency data on detention conditions at a regional facility. Has filed two court affidavits in ongoing civil rights challenges.',
    emails: ['y.abdullahi@ncdp.example'],
    phones: ['+1 438 555 3091'],
    links: [
      { type: 'linkedin', url: 'https://linkedin.com/in/yusuf-abdullahi-ncdp' },
      { type: 'x', url: 'https://x.com/yusuf_ncdp' },
    ],
  },
  {
    name: 'Madeleine Tremblay-Côté',
    organization: 'Réseau Environnement Laurentie',
    notes:
      'Senior researcher on federal subsidies to the fossil fuel industry. Her organization published an access-to-information database that the energy ministry tried to have taken down.',
    emails: ['mtremblay@rel-env.example'],
    phones: ['+1 438 555 3208'],
    links: [
      { type: 'x', url: 'https://x.com/madeleine_rel' },
      { type: 'linkedin', url: 'https://linkedin.com/in/madeleine-tremblay-cote' },
    ],
  },
  {
    name: 'Owen Blackstock',
    organization: 'Plainlands Regional Health Authority',
    notes: null,
    emails: ['o.blackstock@plainlandshealth.example'],
    phones: ['+1 582 555 3314'],
    links: [],
  },
  {
    name: 'Prof. Amara Diallo-Kamara',
    organization: 'Coastal University — Marine Environmental Law',
    notes:
      'Monitors offshore drilling permit compliance on the Atlantic shelf. Provided key technical context for an earlier industry exposé. Easy to reach and forthcoming on background.',
    emails: ['a.diallo@coastal.example'],
    phones: ['+1 265 555 3427'],
    links: [
      { type: 'website', url: 'https://coastal.example/law/faculty/diallo-kamara' },
      { type: 'linkedin', url: 'https://linkedin.com/in/amara-diallo-kamara' },
    ],
  },
  {
    name: 'Nadia Karpenko',
    organization: 'Energy Accountability Institute',
    notes:
      'Energy transition analyst specializing in coal-phase-out compliance. Has a source inside the federal natural resources ministry who flagged internal modelling discrepancies.',
    emails: ['n.karpenko@energyaccountability.example'],
    phones: ['+1 582 555 3551'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/nadia-karpenko-eai' }],
  },
  {
    name: 'Inspector Gilles Parenteau',
    organization: 'Laurentie Provincial Police — Major Crimes',
    notes: null,
    emails: ['g.parenteau@lpp-mc.example'],
    phones: ['+1 438 555 3668'],
    links: [],
  },
  {
    name: 'Dr. Susan Whitmore-Haig',
    organization: 'Centre for Mental Health and Addictions Research',
    notes:
      "Led the unreleased audit of supportive housing contracts in the province. Several providers audited have filed defamation notices. Willing to share methodology, not findings, until legal clears it.",
    emails: ['s.whitmore@cmhar.example'],
    phones: ['+1 363 555 3784'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/susan-whitmore-haig' }],
  },
  {
    name: 'Alejandro Fuentes-Ríos',
    organization: 'Federación de Trabajadores del Puerto — Veltria',
    notes:
      'Source on pension fund investments in Veltrian port infrastructure. Provided translated labour contracts and photos of site conditions. Contact via encrypted email only.',
    emails: ['a.fuentes@fedtrabveltria.example', 'alejandro.fuentes@securemail.example'],
    phones: ['+54 11 5555 3891'],
    links: [],
  },
  {
    name: 'Janet Koo',
    organization: 'Cascadia Teachers\' Federation',
    notes:
      'Chief grievance officer. Has filed 14 complaints against school district IT procurement decisions that channelled contracts to a trustee-linked firm.',
    emails: ['j.koo@ctf-cascadia.example'],
    phones: ['+1 265 555 3905'],
    links: [
      { type: 'x', url: 'https://x.com/jkoo_ctf' },
      { type: 'linkedin', url: 'https://linkedin.com/in/janet-koo-ctf' },
    ],
  },
  {
    name: 'Prof. Henrik Daalmans',
    organization: 'Ashworth University — School of Public Administration',
    notes: null,
    emails: ['h.daalmans@ashworth.example'],
    phones: ['+1 582 555 4017'],
    links: [{ type: 'website', url: 'https://ashworth.example/spa/faculty/daalmans' }],
  },
  {
    name: 'Constance Abiodun',
    organization: 'Office of the Privacy Commissioner',
    notes:
      "Senior investigator who handled a complaint against a federal biometric data program. Her office's redacted report contains sections sought via access-to-information requests.",
    emails: ['c.abiodun@privacycommissioner.example'],
    phones: ['+1 582 555 4143'],
    links: [],
  },
  {
    name: 'Trevor Colpitts',
    organization: 'Eastcoast Province — Department of Environment',
    notes:
      'Regional enforcement officer who issued — then quietly withdrew — a compliance order against a pulp mill. Currently on administrative leave. Reached once through a mutual source.',
    emails: ['t.colpitts@eastcoast-env.example', 't.colpitts.personal@securemail.example'],
    phones: ['+1 265 555 4261'],
    links: [],
  },
  {
    name: 'Dr. Felicity Okonkwo',
    organization: 'Halden University — Health Evidence Synthesis',
    notes:
      "Peer reviewer for contested pharmaceutical efficacy studies. Has flagged methodology concerns in writing. Her department chair has asked her to route all media inquiries through the university's PR office.",
    emails: ['f.okonkwo@halden.example'],
    phones: ['+1 363 555 4378'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/felicity-okonkwo-halden' }],
  },
  {
    name: 'Simon Beauchamp-Roy',
    organization: 'Institut pour la démocratie de Laurentie',
    notes: null,
    emails: ['s.beauchamp@idl.example'],
    phones: ['+1 438 555 4492'],
    links: [{ type: 'linkedin', url: 'https://linkedin.com/in/simon-beauchamp-roy' }],
  },
  {
    name: 'Anita Fong-Marquez',
    organization: 'Federal Border Enforcement Agency — Intelligence Division',
    notes:
      'Mid-level analyst. Made contact after a border agency story ran. Willing to verify documents but will not originate disclosures. Has a security clearance concern about direct email — suggested courier drop.',
    emails: [],
    phones: ['+1 582 555 4617'],
    links: [],
  },
  {
    name: 'Prof. David Adesanya',
    organization: 'Grantmore University — Criminology',
    notes:
      'Specialist in white-collar crime enforcement gaps. Published the definitive study of deferred prosecution agreements in the jurisdiction. Reliable on-record expert voice.',
    emails: ['d.adesanya@grantmore.example'],
    phones: ['+1 582 555 4734'],
    links: [
      { type: 'website', url: 'https://grantmore.example/criminology/faculty/adesanya' },
      { type: 'x', url: 'https://x.com/prof_adesanya' },
    ],
  },
  {
    name: 'Lorraine Hedley-Cross',
    organization: 'Northern Territories Environmental Assessment Board',
    notes:
      "Review officer who flagged deficiencies in a mine remediation plan. The board's public report was edited before release. She has the unredacted version.",
    emails: ['l.hedley@nteab.example'],
    phones: ['+1 363 555 4851'],
    links: [],
  },
  {
    name: 'Marco Pietrangelo',
    organization: 'Consolidated Industrial Workers — Local 222',
    notes:
      'President of the Harbourne plant local. Source on illegal subcontracting arrangements and safety violations after a recent line conversion. Keeps meticulous records. Will meet in person only.',
    emails: ['m.pietrangelo@ciw222.example'],
    phones: ['+1 265 555 4968', '+1 265 555 5011'],
    links: [{ type: 'facebook', url: 'https://facebook.com/ciw222local' }],
  },
];
