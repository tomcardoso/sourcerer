import type Database from 'better-sqlite3-multiple-ciphers';

// All timestamps in UNIX seconds
const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;
function secs(daysBack: number): number { return NOW - daysBack * DAY; }

function cid(n: number): string {
  const s = String(n).padStart(4, '0');
  return `dev-cont-${s}-0000-0000-${String(n).padStart(12, '0')}`;
}
function mid(n: number): string {
  const s = String(n).padStart(4, '0');
  return `dev-memb-${s}-0000-0000-${String(n).padStart(12, '0')}`;
}

const PROJ = {
  p1: 'dev-proj-0001-0000-0000-000000000001',
  p2: 'dev-proj-0002-0000-0000-000000000002',
  p3: 'dev-proj-0003-0000-0000-000000000003',
  p4: 'dev-proj-0004-0000-0000-000000000004',
  p5: 'dev-proj-0005-0000-0000-000000000005',
};

// Staleness distribution based on contact number mod 10
// r=0,5 → never contacted
// r=1   → very stale (120d)
// r=6   → stale (100d)
// r=2   → approaching (75d)
// r=7   → warm (45d)
// r=3,8 → fresh (15d)
// r=4,9 → very fresh (5d)
function firstOutreachDays(n: number): number | null {
  const r = n % 10;
  if (r === 0 || r === 5) return null;
  if (r === 1) return 130; if (r === 6) return 110;
  if (r === 2) return 80;  if (r === 7) return 50;
  if (r === 3 || r === 8) return 20;
  return 8;
}
function lastContactDays(n: number): number | null {
  const r = n % 10;
  if (r === 0 || r === 5) return null;
  if (r === 1) return 120; if (r === 6) return 100;
  if (r === 2) return 75;  if (r === 7) return 45;
  if (r === 3 || r === 8) return 15;
  return 5;
}
function contactStatus(n: number): string {
  const r = n % 10;
  if (r === 0 || r === 5) return 'Not yet contacted';
  if (r === 1) return 'Ghosted';
  if (r === 6) return 'Outreach attempted, no response';
  if (r === 2) return 'Declined, door left open';
  if (r === 7) return 'Agreed, not yet scheduled';
  if (r === 3) return 'Interviewed off-record';
  if (r === 8) return 'Interviewed on-record';
  if (r === 4) return 'Referred to communications';
  return 'Declined';
}
function contactPriority(n: number): string {
  const p = ['High', 'Critical', 'High', 'Medium', 'Medium', 'Low', 'High', 'Medium', 'Low', 'Monitor-only'];
  return p[n % 10];
}
function logBody(n: number): string | null {
  const r = n % 10;
  if (r === 0 || r === 5) return null;
  if (r === 1) return 'Third follow-up sent — no response to any outreach.';
  if (r === 6) return 'Initial outreach sent via email.';
  if (r === 2) return 'Declined to comment at this time but left the door open for later.';
  if (r === 7) return 'Agreed to speak in principle. Waiting on scheduling.';
  if (r === 3) return 'Background call completed. Willing to continue on background.';
  if (r === 8) return 'On-record interview completed.';
  if (r === 4) return 'Referred outreach to their communications team.';
  return 'Declined to comment.';
}

const P1_THEMES = ['Financial transfers / shell companies', 'DoD procurement', 'Revolving door / lobbying', 'Congressional oversight', 'Expert comment', 'Rival / monitoring'];
const P2_THEMES = ['Contract irregularities', 'Political connections', 'Budget analysis', 'Community impact', 'Legal context', 'Rival / monitoring'];
const P3_THEMES = ['Executive accountability', 'Billing practices', 'Patient advocacy', 'Regulatory compliance', 'Whistleblower', 'Expert analysis'];
const P4_THEMES = ['Emergency response failures', 'Climate context', 'Infrastructure / evacuation', 'Community impact', 'Federal oversight', 'Insurance / liability'];
const P5_THEMES = ['PAC finances', 'Political influence', 'Community oversight', 'Officer testimony', 'Legal analysis', 'Academic / expert'];

function theme(n: number, themes: string[]): string { return themes[n % themes.length]; }

interface BulkContact {
  num: number;
  name: string;
  org: string | null;
  email: string;
  phone?: string;
  linkedin?: string;
  twitter?: string;
  notes?: string;
}

// ── Pentagon Slush Fund additional contacts (10–45) ─────────────────────────
const P1_CONTACTS: BulkContact[] = [
  { num: 10, name: 'Gen. Harold Briggs (ret.)', org: 'Potomac Defense Research Institute', email: 'hbriggs@pdri.org', linkedin: 'https://linkedin.com/in/haroldbrigs-gen', notes: 'Former JSOC commander, now leads a defense-aligned think tank. Has gone on record about procurement reform. Knows the Halcyon principals personally — handled carefully.' },
  { num: 11, name: 'Patricia Lowe', org: 'U.S. Senate — Armed Services Committee', email: 'patricia_lowe@armed-services.senate.gov', phone: '+1 202 555 0133' },
  { num: 12, name: 'Victor Crane', org: 'Apex Consulting Partners', email: 'vcrane@apexconsulting.com', linkedin: 'https://linkedin.com/in/victorcrane-dc' },
  { num: 13, name: 'Dennis Kwon', org: 'Halcyon Defense Group', email: 'dkwon@halcyondefense.com', notes: 'Mid-level finance analyst. Former colleague of Elena Vasquez. Has not responded but his name appears on two of the internal wire summaries she provided.' },
  { num: 14, name: 'Helena Marsh', org: 'Office of Sen. Whitmore', email: 'helena.marsh@whitmore.senate.gov', phone: '+1 202 555 0177' },
  { num: 15, name: 'Tobias Engel', org: 'Project on Government Oversight', email: 'tengel@pogo.org', twitter: 'https://x.com/tobiasengelpogo' },
  { num: 16, name: 'Susan Tran', org: 'Morrison & Foerster LLP', email: 'stran@mofo.com', linkedin: 'https://linkedin.com/in/susantran-mofo' },
  { num: 17, name: 'Lt. Col. Dana Pruitt (ret.)', org: null, email: 'danapruitt.ret@gmail.com', phone: '+1 703 555 0284', notes: 'Former DoD contracting officer. Ran the office that oversaw procurement in Webb\'s division. Left the DoD in 2021. Cooperative — referred to us by a Senate staffer.' },
  { num: 18, name: 'Rick Bellamy', org: 'Halcyon Defense Group', email: 'rbellamy@halcyondefense.com', linkedin: 'https://linkedin.com/in/rickbellamy-cfo' },
  { num: 19, name: 'Hugh Barros', org: 'Congressional Budget Office', email: 'hbarros@cbo.gov' },
  { num: 20, name: 'Dr. Thomas Kessler', org: 'Harvard Kennedy School', email: 't.kessler@hks.harvard.edu', twitter: 'https://x.com/drkessler_hks', linkedin: 'https://linkedin.com/in/thomaskessler-hks' },
  { num: 21, name: 'Mireille Fontaine', org: 'CREW — Citizens for Responsibility and Ethics in Washington', email: 'mfontaine@citizensforethics.org', twitter: 'https://x.com/mireillecrew' },
  { num: 22, name: 'Adam Solis', org: 'Delaware Division of Corporations', email: 'adam.solis@delaware.gov' },
  { num: 23, name: 'Jane Ng', org: 'U.S. House — Armed Services Committee', email: 'jane.ng@hasc.house.gov' },
  { num: 24, name: 'Walter Schiff', org: 'Halcyon Defense Group', email: 'wschiff@halcyondefense.com', linkedin: 'https://linkedin.com/in/walterschiff-esq' },
  { num: 25, name: 'Dr. Carla Brennan', org: 'RAND Corporation', email: 'cbrennan@rand.org', twitter: 'https://x.com/carlabrennan_rand' },
  { num: 26, name: 'Yusuf Okafor', org: 'DoD Office of Inspector General', email: 'y.okafor@dodig.mil' },
  { num: 27, name: 'Cynthia Adler', org: 'Meridian Strategic Services LLC', email: 'cadler@meridianstrategic.com', notes: 'Listed as signatory on three of the Meridian bank accounts. Incorporation records show her as registered agent in Delaware. Has not responded to email or certified mail.' },
  { num: 28, name: 'Pamela Stokes', org: 'U.S. Senate — Appropriations Committee', email: 'pamela_stokes@appropriations.senate.gov', phone: '+1 202 555 0308' },
  { num: 29, name: 'Kofi Mensah', org: 'Transparency International — U.S.', email: 'k.mensah@transparency.org', twitter: 'https://x.com/kofimensah_ti' },
  { num: 30, name: 'Bridget Hayward', org: 'The Washington Post', email: 'bhayward@washpost.com', twitter: 'https://x.com/bridgethayward' },
  { num: 31, name: 'Gary Fenton', org: 'Booz Allen Hamilton', email: 'g.fenton@bah.com', linkedin: 'https://linkedin.com/in/garyfenton-bah' },
  { num: 32, name: 'Miriam Salas', org: 'National Security Archive', email: 'm.salas@nsarchive.org' },
  { num: 33, name: 'Clark Hudson', org: 'National Defense Industrial Association', email: 'chudson@ndia.org', linkedin: 'https://linkedin.com/in/clarkhudson-ndia' },
  { num: 34, name: 'Phyllis Baxter', org: 'Halcyon Defense Group', email: 'pbaxter@halcyondefense.com', notes: 'Executive assistant to the CEO. Has been with Halcyon since 2016. Elena described her as having access to the executive calendar — possible witness to meetings with Webb.' },
  { num: 35, name: 'Owen Darby', org: 'The Intercept', email: 'odarby@theintercept.com', twitter: 'https://x.com/owendarby' },
  { num: 36, name: 'Prof. Isaac Yamamoto', org: 'Stanford Law — National Security Program', email: 'iyamamoto@law.stanford.edu', linkedin: 'https://linkedin.com/in/isaacyamamoto-law' },
  { num: 37, name: 'Rosemary Quinn', org: 'DoD Office of General Counsel', email: 'r.quinn@osd.mil' },
  { num: 38, name: 'Douglas McPhail', org: 'DLA Piper LLP', email: 'douglas.mcphail@dlapiper.com', linkedin: 'https://linkedin.com/in/douglasmcphail-atty' },
  { num: 39, name: 'Brittany Sosa', org: 'U.S. Senate — Judiciary Committee', email: 'bsosa@judiciary.senate.gov' },
  { num: 40, name: 'Nathaniel Osgood', org: 'DOJ — National Security Division', email: 'n.osgood@usdoj.gov' },
  { num: 41, name: 'Beatrice Kwan', org: 'Center for Strategic and Budgetary Assessments', email: 'bkwan@csbaonline.org', twitter: 'https://x.com/beatricekwan_csba' },
  { num: 42, name: 'Ahmed Al-Rashid', org: 'Defense News', email: 'aalrashid@defensenews.com', twitter: 'https://x.com/ahmedalrashid_dn' },
  { num: 43, name: 'Constance Vance', org: 'Meridian Strategic Services LLC', email: 'cvance@meridianstrategic.com' },
  { num: 44, name: 'Harold Fielding', org: 'Cayman National Corporation', email: 'hfielding@caymannational.ky' },
  { num: 45, name: 'Dr. Margaret Park', org: 'Johns Hopkins SAIS', email: 'm.park@sais.jhu.edu', twitter: 'https://x.com/drmargaretpark' },
];

// ── City Hall Contracts additional contacts (46–80) ─────────────────────────
const P2_CONTACTS: BulkContact[] = [
  { num: 46, name: 'Mayor Victor Alderman', org: 'City of Millhaven', email: 'mayor@millhaven.gov', notes: 'The subject. All requests for comment routed through his comms director. Press office responds with non-committal two-line statements. Do not contact personally.' },
  { num: 47, name: 'Deputy Mayor Christine Park', org: 'City of Millhaven', email: 'cpark@millhaven.gov', phone: '+1 555 201 0001' },
  { num: 48, name: 'Gerald Torres', org: 'Millhaven — Dept. of Public Works', email: 'gtorres@millhaven.gov', notes: 'Mid-level project manager in Public Works. Signed off on the facilities assessment deliverable from Fisk & Calloway. Sandra mentioned him as someone who knew the contract was unusual.' },
  { num: 49, name: 'Linda Beaumont', org: 'Millhaven City Council — District 2', email: 'lbeaumont.council@millhaven.gov', phone: '+1 555 201 0414', twitter: 'https://x.com/lindabeaumont_d2' },
  { num: 50, name: 'Bobby Kwame', org: 'Fisk & Calloway Development LLC', email: 'bkwame@fiskcalloway.com' },
  { num: 51, name: 'Nelson Hart', org: 'First Millhaven Bank', email: 'nhart@firstmillhaven.com', linkedin: 'https://linkedin.com/in/nelsonhart-banking' },
  { num: 52, name: 'Priscilla Cole', org: 'Millhaven Ethics Commission', email: 'pcole@millhaven-ethics.gov' },
  { num: 53, name: 'Antoine Marcus', org: 'Millhaven Contractors Association', email: 'amarcus@millhaven-contractors.org', linkedin: 'https://linkedin.com/in/antoinemarcus-mca' },
  { num: 54, name: 'Sharon Reeves', org: 'City of Millhaven — IT Department', email: 'sreeves@millhaven.gov' },
  { num: 55, name: 'Edwin Lau', org: 'Millhaven Sun-Herald', email: 'elau@millhavensunherald.com', twitter: 'https://x.com/edwinlau_msh' },
  { num: 56, name: 'Vanessa Drummond', org: 'ACLU of Millhaven', email: 'vdrummond@aclu-millhaven.org', twitter: 'https://x.com/vanessadrummond_aclu' },
  { num: 57, name: 'Bruce Halloway', org: 'Sterling Property Group', email: 'bhalloway@sterlingproperty.com', linkedin: 'https://linkedin.com/in/brucehalloway-dev', notes: 'His firm submitted a competing bid on the Parks & Rec contract and lost — to Fisk & Calloway. Has been publicly quiet but Sandra says he was furious when it happened. May talk.' },
  { num: 58, name: 'Marilyn Frost', org: 'Millhaven — Parks & Recreation', email: 'mfrost@millhaven.gov' },
  { num: 59, name: 'Oscar Reyes', org: 'Millhaven Teachers Association', email: 'oreyes@millhaven-teachers.org' },
  { num: 60, name: 'Gwen Patterson', org: 'Millhaven Budget Oversight Board', email: 'gpatterson@millhaven-bob.gov', phone: '+1 555 201 0623' },
  { num: 61, name: 'Renata Kowalski', org: "State Attorney General's Office", email: 'rkowalski@state-ag.gov' },
  { num: 62, name: 'Charles Morrow', org: 'Former Millhaven Planning Commissioner', email: 'charlesm.ex@gmail.com', notes: 'Resigned from the Planning Commission 14 months ago citing "irreconcilable differences with the administration." Has not spoken publicly. Reached out but no response yet.' },
  { num: 63, name: 'Estelle Fisk', org: 'Fisk & Calloway Development LLC', email: 'estelle@fiskcalloway.com', linkedin: 'https://linkedin.com/in/estellefisk' },
  { num: 64, name: 'Terrence Booker', org: 'Millhaven City Council — District 7', email: 'tbooker.council@millhaven.gov', twitter: 'https://x.com/terrencebooker_d7' },
  { num: 65, name: 'Abigail Chen', org: 'Millhaven Housing Authority', email: 'achen@millhaven-housing.gov' },
  { num: 66, name: 'Frank Delgado', org: 'Former Deputy Mayor, City of Millhaven', email: 'fdelgado.personal@gmail.com', phone: '+1 555 334 0891' },
  { num: 67, name: 'Ingrid Sorensen', org: "State Comptroller's Office", email: 'i.sorensen@state-comptroller.gov' },
  { num: 68, name: 'Nora Bloom', org: 'Millhaven Community Land Trust', email: 'nbloom@millhaven-clt.org', twitter: 'https://x.com/norabloom_clt' },
  { num: 69, name: 'Russell Okoro', org: 'Construction Workers Union Local 441', email: 'rokoro@local441.org', phone: '+1 555 201 4410' },
  { num: 70, name: 'Theresa Huang', org: 'Millhaven City Council — District 1', email: 'thuang.council@millhaven.gov', twitter: 'https://x.com/theresahuang_d1', linkedin: 'https://linkedin.com/in/theresahuang-council' },
  { num: 71, name: 'Byron Steele', org: 'Alderman for Mayor PAC', email: 'bsteele@aldermanformayor.org' },
  { num: 72, name: 'Malcolm Pratt', org: 'Pratt Commercial Real Estate', email: 'mpratt@prattcre.com', linkedin: 'https://linkedin.com/in/malcolmpratt-cre' },
  { num: 73, name: 'Donna Voss', org: 'State Dept. of Transportation', email: 'd.voss@state-dot.gov' },
  { num: 74, name: 'Peter Finch', org: 'Millhaven Office of Inspector General', email: 'pfinch@millhaven-oig.gov', phone: '+1 555 201 0744' },
  { num: 75, name: 'Hazel Sims', org: 'Former Millhaven Budget Director', email: 'hazelsims.ex@proton.me', notes: 'Resigned 2 years ago. Left under circumstances that were never explained publicly. A source from city hall says she was pushed out after raising concerns about procurement oversight. Cautious but may be willing to speak.' },
  { num: 76, name: 'Yolanda Cruz', org: 'Community Voices Millhaven', email: 'ycruz@communityvoicesmh.org', twitter: 'https://x.com/yolandacruz_cvm' },
  { num: 77, name: 'Kim Nakamura', org: 'Eastside Housing Initiative', email: 'knakamura@eastsidehousing.org', linkedin: 'https://linkedin.com/in/kimnakamura-housing' },
  { num: 78, name: 'Roger Taft', org: 'Millhaven Chamber of Commerce', email: 'rtaft@millhaven-chamber.org' },
  { num: 79, name: 'Alice Bauer', org: 'State Building Code Commission', email: 'a.bauer@state-bcc.gov' },
  { num: 80, name: 'Simon Keane', org: 'Keane Real Estate Law', email: 'skeane@keanerelaw.com', linkedin: 'https://linkedin.com/in/simonkeane-relaw' },
];

// ── Hospital Billing Scandal contacts (81–120) ───────────────────────────────
const P3_CONTACTS: BulkContact[] = [
  { num: 81, name: 'Dr. Warren Pryce', org: 'Cascade Health Systems', email: 'wpryce@cascadehealth.com', linkedin: 'https://linkedin.com/in/warrenpryce-ceo', notes: 'CEO since 2019. Oversaw rollout of the "Revenue Integrity Program" that billing coders say is where the upcoding began. Has given two on-the-record statements denying wrongdoing. All further comment routed through in-house counsel.' },
  { num: 82, name: 'Linda Zhao', org: 'Cascade Health Systems', email: 'lzhao@cascadehealth.com', linkedin: 'https://linkedin.com/in/lindazhao-cfo' },
  { num: 83, name: 'Mark Trevino', org: 'Cascade Health Systems', email: 'mtrevino@cascadehealth.com', notes: 'VP of Revenue Cycle. Introduced the billing software update in Q2 2022 that Shirley Okonkwo says is the source of the systematic upcoding. Has denied all allegations through the Cascade communications team.' },
  { num: 84, name: 'Shirley Okonkwo', org: 'Formerly: Cascade Health Systems', email: 'shirley.okonkwo.private@proton.me', phone: '+1 415 555 0284', notes: 'Left Cascade 8 months ago after raising billing concerns internally and being reassigned. Has documentary evidence: screenshots of the internal coding guide that instructed coders to apply higher-severity codes. Willing to go on record. Needs source protection memo reviewed by her attorney.' },
  { num: 85, name: 'Dr. Brett Callahan', org: 'Cascade Health Systems — Internal Medicine', email: 'bcallahan@cascadehealth.com' },
  { num: 86, name: 'Pamela Kim', org: 'State Dept. of Health', email: 'p.kim@state-doh.gov', phone: '+1 916 555 0186' },
  { num: 87, name: 'Dr. Felix Moreau', org: 'HealthCare Billing Analytics', email: 'fmoreau@hcbanalytics.com', twitter: 'https://x.com/drfelixmoreau', notes: 'Independent billing auditor. Has reviewed 400+ hospital billing datasets in 15 years. Will go on record. Available to review Cascade data and explain the patterns to a lay audience.' },
  { num: 88, name: 'Regina Watts', org: "Patients' Rights Advocate", email: 'rwatts@patientsrights.org', twitter: 'https://x.com/reginawatts_pra' },
  { num: 89, name: 'Theodore Banks', org: 'Anthem Blue Cross — Provider Relations', email: 't.banks@anthem.com' },
  { num: 90, name: 'Craig Stern', org: 'Cascade Health Systems — Board of Directors', email: 'cstern@cascadehealth-board.com', linkedin: 'https://linkedin.com/in/craigstern-board' },
  { num: 91, name: 'Angela Morales', org: null, email: 'angela.morales.mhv@gmail.com', phone: '+1 555 201 0912', notes: 'Was billed $34,000 for a two-day observation stay that Medicare should have covered at a fraction of the cost. Has documentation. Willing to go on record. Single mother, works nights — call in the afternoon.' },
  { num: 92, name: 'Samuel Osei', org: 'State Insurance Commissioner', email: 's.osei@state-ins.gov' },
  { num: 93, name: 'Dr. Roger Haines', org: 'Formerly: Cascade Health Systems', email: 'rhaines.ex@gmail.com', phone: '+1 415 555 0934', notes: 'Former chief of surgery. Resigned 6 months ago. Submitted a formal internal complaint about billing practices that was dismissed. Now in private practice. Cooperative — reached out to us first through a mutual contact.' },
  { num: 94, name: 'Justin Lee', org: 'CMS — Centers for Medicare & Medicaid Services', email: 'j.lee@cms.hhs.gov' },
  { num: 95, name: 'Dr. Natasha Patel', org: 'Johns Hopkins Bloomberg School of Public Health', email: 'n.patel@jhu.edu', twitter: 'https://x.com/drnpatel_jhu' },
  { num: 96, name: 'Laura Whitfield', org: 'State Legislature — Health Committee', email: 'l.whitfield@statelegis.gov', twitter: 'https://x.com/laurawhitfield_health' },
  { num: 97, name: 'Cathy Ruiz', org: 'Formerly: Cascade Health Systems', email: 'cathyruiz.ex@gmail.com', notes: 'Former HR director. Left under pressure 10 months ago. Says she was asked to alter onboarding records for the Revenue Cycle team and refused. Has copies of the email exchange.' },
  { num: 98, name: 'Rev. Jerome Battle', org: 'Community Health Alliance', email: 'jbattle@communityhealth-alliance.org', phone: '+1 555 201 0983' },
  { num: 99, name: 'Stephanie Yuen', org: 'ProPublica — Health Desk', email: 'syuen@propublica.org', twitter: 'https://x.com/stephanieyuen_pp' },
  { num: 100, name: 'Daniel Moss', org: 'Cascade Health Systems — Legal', email: 'dmoss@cascadehealth.com', linkedin: 'https://linkedin.com/in/danielmoss-ghc' },
  { num: 101, name: 'Dr. Adrienne Blake', org: 'American Hospital Association', email: 'ablake@aha.org', twitter: 'https://x.com/dradblake_aha' },
  { num: 102, name: 'Victor Sousa', org: 'State Medicaid Office', email: 'v.sousa@state-medicaid.gov' },
  { num: 103, name: 'Pauline Diaz', org: 'Diaz Patient Litigation Group', email: 'pdiaz@diazpatientlaw.com', linkedin: 'https://linkedin.com/in/paulinediaz-law' },
  { num: 104, name: 'Greta Larson', org: 'Cascade Health Systems', email: 'glarson@cascadehealth.com' },
  { num: 105, name: 'Karl Benson', org: 'Benson Healthcare Audit Group', email: 'kbenson@bensonhag.com', phone: '+1 212 555 1050', notes: 'Certified professional coder and independent billing auditor. Has reviewed Cascade billing data from a sample obtained via FOIA. Found upcoding rate 3x the industry average. Will testify as an expert. Very credible — no financial relationship with any competitor.' },
  { num: 106, name: 'Tricia Monroe', org: 'Cascade Health Systems', email: 'tmonroe@cascadehealth.com' },
  { num: 107, name: 'Alejandro Vega', org: 'Hospital Employees Union Local 250', email: 'avega@heu250.org', phone: '+1 415 555 1070' },
  { num: 108, name: 'Dr. Sylvia Chen', org: 'Formerly: Cascade Health Systems', email: 'sylvia.chen.md@gmail.com', notes: 'Resigned in protest after being pressured to sign off on billing codes she considered clinically unsupported. Now at a community clinic. Quiet but has documentary evidence she is willing to share.' },
  { num: 109, name: 'Patrick Halsey', org: 'State AG — Medicaid Fraud Unit', email: 'p.halsey@state-ag.gov' },
  { num: 110, name: 'Dolores Martin', org: 'Formerly: Cascade Health Systems', email: 'dolores.martin.pvt@proton.me', phone: '+1 415 555 1101', notes: 'Former billing supervisor. Managed the team Shirley Okonkwo worked on. Left Cascade the same month as the Revenue Integrity Program rollout. Says she was told her team\'s productivity was "insufficient" — believes it was because they were coding honestly. Key corroborating witness.' },
  { num: 111, name: 'Mabel Ross', org: 'State Board of Medical Examiners', email: 'm.ross@state-bme.gov' },
  { num: 112, name: 'Dr. Iman Siddiqui', org: 'UCSF — Dept. of Health Policy', email: 'i.siddiqui@ucsf.edu', twitter: 'https://x.com/drimansiddiqui' },
  { num: 113, name: 'George Nakamura', org: 'Cascade Health Systems — Board of Directors', email: 'gnakamura@cascadehealth-board.com', linkedin: 'https://linkedin.com/in/georgenakamura-board' },
  { num: 114, name: 'Dr. Nina Hoffman', org: 'Cascade Health Systems', email: 'nhoffman@cascadehealth.com', linkedin: 'https://linkedin.com/in/ninahoffman-cmo' },
  { num: 115, name: 'Beverly Tran', org: 'HCA Healthcare — Market Analysis', email: 'b.tran@hcahealthcare.com' },
  { num: 116, name: 'Marcus Owens', org: 'Leerink Partners', email: 'm.owens@leerinkpartners.com', linkedin: 'https://linkedin.com/in/marcusowens-healthcare' },
  { num: 117, name: 'Leon Park', org: 'Healthcare Bluebook', email: 'lpark@healthcarebluebook.com', twitter: 'https://x.com/leonpark_hcbb' },
  { num: 118, name: 'Fred Huang', org: 'Cascade Health Systems — IT', email: 'fhuang@cascadehealth.com' },
  { num: 119, name: 'Dolores Quinn', org: 'AARP California', email: 'dquinn@aarp.org', phone: '+1 916 555 1190' },
  { num: 120, name: 'Dr. Yolanda Park', org: 'Kaiser Permanente — Research', email: 'y.park@kp.org', twitter: 'https://x.com/dryolandapark' },
];

// ── Wildfire Response Investigation contacts (121–160) ──────────────────────
const P4_CONTACTS: BulkContact[] = [
  { num: 121, name: 'Chief Rob Sandoval', org: 'Cal Fire — Northern Region', email: 'rsandoval@calfire.ca.gov', phone: '+1 916 555 1210', notes: 'Key cooperative source inside Cal Fire. Has been critical internally of the CAL OES coordination failures. Will speak on background. Very cautious about going on record — still employed. Treat as confidential.' },
  { num: 122, name: 'Lt. Maria Espinoza', org: 'Cal Fire — Unit 14', email: 'mespinoza@calfire.ca.gov', phone: '+1 530 555 1220' },
  { num: 123, name: 'Mike Holloway', org: 'CAL OES', email: 'mholloway@caloes.ca.gov', notes: 'State Emergency Services Director. Has given two press statements defending the response timeline. All subsequent requests routed to the CAL OES communications team, who have not responded in 6 weeks.' },
  { num: 124, name: 'Dr. Sam Yee', org: 'UC Davis — Climate Institute', email: 's.yee@ucdavis.edu', twitter: 'https://x.com/drsamyee_ucd', linkedin: 'https://linkedin.com/in/samuelyee-climate' },
  { num: 125, name: 'Bart Nishimura', org: 'FEMA — Region 9', email: 'b.nishimura@fema.dhs.gov', phone: '+1 510 555 1250' },
  { num: 126, name: 'Graciela Rios', org: null, email: 'graciela.rios.pineridge@gmail.com', phone: '+1 661 555 1261', notes: 'Lost her home and a barn full of livestock in the Pine Ridge fire. Has photos and a detailed account of when she received the evacuation order vs. when she could actually leave. On record. Compelling witness — speaks plainly about what happened.' },
  { num: 127, name: 'Dr. Frederick Abram', org: 'Stanford — Climate Change Research', email: 'fabram@stanford.edu', twitter: 'https://x.com/fredabram_stanford' },
  { num: 128, name: 'Carole Drummond', org: 'Sierra Club California', email: 'cdrummond@sierraclub.org', twitter: 'https://x.com/caroledrummond_sc' },
  { num: 129, name: 'Andy Walsh', org: 'Allstate Insurance — Claims Division', email: 'awalsh@allstate.com', linkedin: 'https://linkedin.com/in/andywalsh-insurance' },
  { num: 130, name: 'Phil Tran', org: 'Rebuilding Together California', email: 'ptran@rebuildingtogether-ca.org' },
  { num: 131, name: 'Marian Nguyen', org: 'Pine Ridge Community Coalition', email: 'mnguyen@pineridgecoalition.org', phone: '+1 661 555 1310', twitter: 'https://x.com/mariannguyen_prc' },
  { num: 132, name: 'Assemblymember Bill Ferraro', org: 'California State Assembly — District 34', email: 'ferraro@assembly.ca.gov', twitter: 'https://x.com/assemblybillferraro' },
  { num: 133, name: 'Dr. Laura Kim', org: 'NOAA — National Weather Service', email: 'l.kim@noaa.gov' },
  { num: 134, name: 'Hector Ruiz', org: 'U.S. Forest Service — Pacific Southwest Region', email: 'h.ruiz@fs.usda.gov', phone: '+1 707 555 1340' },
  { num: 135, name: 'Thomas Okafor', org: 'Pacific Gas & Electric', email: 't.okafor@pge.com', linkedin: 'https://linkedin.com/in/thomasokafor-pge', notes: 'PG&E transmission division VP. The company\'s equipment is in the probable ignition zone. Legal team has confirmed they will not comment while investigations are ongoing. All requests to be routed through their media relations line.' },
  { num: 136, name: 'Norma Castillo', org: 'Cal Fire — Fire Prevention Division', email: 'ncastillo@calfire.ca.gov' },
  { num: 137, name: 'Sarah Bloom', org: 'Insurance Information Institute', email: 'sbloom@iii.org', twitter: 'https://x.com/sarahbloom_iii' },
  { num: 138, name: 'Wes Yamamoto', org: 'CAL OES — Emergency Preparedness', email: 'wyamamoto@caloes.ca.gov' },
  { num: 139, name: 'Dana Steele', org: 'Kern County Fire Safe Council', email: 'dsteele@kerncountyfiresafe.org', phone: '+1 661 555 1390' },
  { num: 140, name: 'Joaquin Reyes', org: 'Pine Ridge Unified School District', email: 'jreyes@prusd.edu' },
  { num: 141, name: 'Dr. Ike Martin', org: 'NIH — National Institute of Environmental Health Sciences', email: 'i.martin@niehs.nih.gov' },
  { num: 142, name: 'Jack Chen', org: 'CalTrans — District 9', email: 'j.chen@dot.ca.gov', notes: 'Responsible for maintenance on Route 58, the primary evacuation corridor. Internal CalTrans documents show road widening was scheduled for 2020 and repeatedly deferred. Has not responded to requests.' },
  { num: 143, name: 'Rosa Medina', org: null, email: 'rosamedina.pineridge@gmail.com', phone: '+1 661 555 1430', notes: 'Second-generation rancher in Pine Ridge. Lost 140 acres and a house. Speaks Spanish first — bring an interpreter or call in English (she\'s comfortable). On record. Very detailed account of the notification failures.' },
  { num: 144, name: 'Pete Garza', org: 'State Water Resources Control Board', email: 'p.garza@waterboards.ca.gov' },
  { num: 145, name: 'Kim Holbrook', org: 'Los Angeles Times', email: 'kholbrook@latimes.com', twitter: 'https://x.com/kimholbrook_lat' },
  { num: 146, name: 'Steve Abbott', org: 'Abbott Infrastructure Group', email: 'sabbott@abbottinfra.com', linkedin: 'https://linkedin.com/in/steveabbott-infra' },
  { num: 147, name: 'Dr. Miranda Walsh', org: 'Cal Poly — Climate Research Center', email: 'm.walsh@calpoly.edu', twitter: 'https://x.com/drmirandawalsh' },
  { num: 148, name: 'Clara Fuentes', org: 'California Native Plant Society', email: 'cfuentes@cnps.org' },
  { num: 149, name: 'Chief Moses Parks', org: 'Pine Ridge Fire District', email: 'mparks@pineridgefire.org', phone: '+1 661 555 1490' },
  { num: 150, name: 'Cynthia Bell', org: 'California Dept. of Housing & Community Development', email: 'c.bell@hcd.ca.gov' },
  { num: 151, name: 'Prof. David Kimura', org: 'UC Berkeley — Emergency Management Program', email: 'd.kimura@berkeley.edu', twitter: 'https://x.com/davidkimura_uc' },
  { num: 152, name: 'Ted Gallagher', org: 'National Interagency Fire Center', email: 't.gallagher@nifc.gov' },
  { num: 153, name: 'Sen. Donna Lee', org: 'California State Senate — Natural Resources Committee', email: 'donnalee@senate.ca.gov', twitter: 'https://x.com/sendonnalee' },
  { num: 154, name: 'Phil Broder', org: 'CAL OES — Internal Review', email: 'pbroder@caloes.ca.gov', notes: 'Lower-level CAL OES staffer who reached out anonymously after our first story. Says there is an internal AAR (After Action Review) that was suppressed by Holloway\'s office. Has not agreed to go further. Handle with care.' },
  { num: 155, name: 'Roberto Vargas', org: 'Alianza Indígena Rural', email: 'rvargas@alianzarural.org', phone: '+1 661 555 1550', twitter: 'https://x.com/robertovargas_air' },
  { num: 156, name: 'Dr. Patricia Wu', org: 'UCSF — School of Medicine', email: 'p.wu@ucsf.edu' },
  { num: 157, name: 'Rachel Tanner', org: "Office of the Governor — Emergency Affairs", email: 'rtanner@gov.ca.gov' },
  { num: 158, name: 'Sheriff Len Gorham', org: 'Kern County Sheriff', email: 'lgorham@kernsheriff.org', phone: '+1 661 555 1580' },
  { num: 159, name: 'Amy Torres', org: 'Pacific Gas & Electric — Media Relations', email: 'a.torres@pge.com' },
  { num: 160, name: 'Clara Obi', org: 'State Emergency Services Auditor', email: 'c.obi@auditor.ca.gov' },
];

// ── Police Union Dark Money contacts (161–200) ───────────────────────────────
const P5_CONTACTS: BulkContact[] = [
  { num: 161, name: 'Rick Donovan', org: 'Metropolitan Police Officers Association PAC', email: 'rdonovan@mpoa-pac.org', linkedin: 'https://linkedin.com/in/rickdonovan-mpoa', notes: 'PAC treasurer. Campaign finance filings show $1.4M in PAC spending over 3 election cycles with 60% going to just 4 city council members. Has not responded to requests. His attorney (Todd Brennan) sent a cease-and-desist after our FOIA request was filed.' },
  { num: 162, name: 'Chief Lynn Torres', org: 'Millhaven Police Department', email: 'ltorres@millhaven-pd.gov', phone: '+1 555 201 1620' },
  { num: 163, name: 'Larry Owens', org: 'Owens Political Strategy', email: 'lowens@owenspolitical.com', linkedin: 'https://linkedin.com/in/larryowens-political' },
  { num: 164, name: 'Councilwoman Diana Flores', org: 'Millhaven City Council — District 3', email: 'dflores.council@millhaven.gov', twitter: 'https://x.com/dianaflores_d3', notes: 'Received $87,000 in PAC donations across two election cycles. Has publicly supported MPOA positions on use-of-force policy and the oversight board budget. Has not commented on the connection between donations and votes.' },
  { num: 165, name: 'Rev. Marcus Hope', org: 'Coalition for Police Accountability', email: 'mhope@cpa-millhaven.org', phone: '+1 555 201 1650', twitter: 'https://x.com/marchushope_cpa', notes: 'Leads the main police accountability coalition. Has tracked PAC spending for 5 years and is willing to go on record about the correlation with council votes. Very credible, media-savvy.' },
  { num: 166, name: 'Francine Garfield', org: 'Formerly: Millhaven Police Department', email: 'francine.garfield.ex@gmail.com', phone: '+1 555 334 1661' },
  { num: 167, name: 'Dr. Jamila Scott', org: 'Howard University — Criminal Justice Research', email: 'j.scott@howard.edu', twitter: 'https://x.com/drjamilascott' },
  { num: 168, name: 'Victor Reyes', org: 'Campaign Finance Law Group', email: 'vreyes@cflg.com', linkedin: 'https://linkedin.com/in/victorreyes-cfl', notes: 'Expert on municipal PAC law. Has reviewed the MPOA PAC filings and says the in-kind contribution reporting appears to violate state disclosure requirements. Will go on record as an expert. Also useful for the City Hall contracts story.' },
  { num: 169, name: 'Officer Tony Paoli', org: 'Millhaven Police Department', email: 'tpaoli.personal@gmail.com', phone: '+1 555 334 1690', notes: 'MPOA shop steward. Reached out through a mutual contact. Skeptical of how PAC money is being spent — says rank-and-file officers don\'t benefit. Speaking in a personal capacity, not as a union rep. Needs to stay off record for now.' },
  { num: 170, name: 'Bobby Anand', org: 'Millhaven Citizens Oversight Board', email: 'banand@millhaven-cob.gov', phone: '+1 555 201 1700' },
  { num: 171, name: 'Yvonne Kessler', org: 'State Campaign Finance Commission', email: 'y.kessler@state-cfc.gov' },
  { num: 172, name: 'Marcus Osei', org: 'Black Lives Matter — Millhaven Chapter', email: 'mosei@blm-millhaven.org', twitter: 'https://x.com/marcosei_blm' },
  { num: 173, name: 'Donna Barlow', org: 'Formerly: MPOA', email: 'donna.barlow.ex@proton.me', phone: '+1 555 334 1730', notes: 'Former MPOA executive director. Left after a documented dispute with the current leadership over PAC governance. Has records of internal discussions about which council members to target. Cautious — needs to consult with a lawyer before speaking further.' },
  { num: 174, name: 'Alex Nguyen', org: "Millhaven DA's Office", email: 'anguyen@millhaven-da.gov' },
  { num: 175, name: 'Prof. Rachel Cohen', org: 'Stanford Law — Criminal Justice Center', email: 'rcohen@law.stanford.edu', twitter: 'https://x.com/rachelcohen_sjc' },
  { num: 176, name: 'Officer Desmond Williams', org: 'Millhaven Police Department', email: 'des.williams.private@proton.me', phone: '+1 555 334 1760', notes: 'Has been documenting internal pressure on officers to donate to MPOA PAC fundraisers. Says officers who don\'t contribute face scheduling disadvantages. Needs serious source protection — still employed. Use Signal only.' },
  { num: 177, name: 'Agent John Taber', org: 'FBI — Public Corruption Unit', email: 'j.taber@fbi.gov' },
  { num: 178, name: 'Councilmember Cody Webb', org: 'Millhaven City Council — District 5', email: 'cwebb.council@millhaven.gov', twitter: 'https://x.com/codywebb_d5' },
  { num: 179, name: 'Chief Pat Rooney (ret.)', org: 'Formerly: Millhaven Police Department', email: 'patrooney.ex@gmail.com', phone: '+1 555 334 1790' },
  { num: 180, name: 'Angela Strom', org: 'Millhaven NAACP — Legal Defense', email: 'astrom@naacp-millhaven.org', phone: '+1 555 201 1800', twitter: 'https://x.com/angelastrom_naacp' },
  { num: 181, name: 'Todd Brennan', org: 'Brennan & Associates', email: 'tbrennan@brennanlaw.com', linkedin: 'https://linkedin.com/in/toddbrennan-law' },
  { num: 182, name: 'Maya Chen', org: 'The Intercept', email: 'mchen@theintercept.com', twitter: 'https://x.com/mayachen_intercept' },
  { num: 183, name: 'Kevin Walsh', org: 'Follow the Money — Campaign Finance Tracker', email: 'kwalsh@followthemoney.org', twitter: 'https://x.com/kevinwalsh_ftm', notes: 'Runs the municipal campaign finance watchdog database. Has already flagged MPOA PAC patterns in their public database. Can provide analysis and is willing to be quoted. Also has data relevant to the City Hall story.' },
  { num: 184, name: 'Brenda Samuels', org: 'City of Millhaven — Comptroller', email: 'bsamuels@millhaven.gov' },
  { num: 185, name: 'Lt. Rosa Garcia', org: 'Millhaven Police Department', email: 'r.garcia.personal@gmail.com', phone: '+1 555 334 1850' },
  { num: 186, name: 'Terri Johnson', org: 'State DOJ — Civil Rights Division', email: 't.johnson@state-doj.gov' },
  { num: 187, name: 'Dr. Malik Green', org: 'Northwestern — Political Science', email: 'm.green@northwestern.edu', twitter: 'https://x.com/drmalikgreen' },
  { num: 188, name: 'Det. Shannon Torres (ret.)', org: 'Formerly: Millhaven Police Department', email: 'shannon.torres.ret@gmail.com', phone: '+1 555 334 1880', notes: 'Retired after 18 years. Says the culture of PAC participation was treated as mandatory even if technically voluntary. Will speak on record. Very specific about which supervisors enforced the social pressure to donate.' },
  { num: 189, name: 'Bill Conway', org: 'Conway Automotive Group', email: 'bconway@conwayauto.com', linkedin: 'https://linkedin.com/in/billconway-auto' },
  { num: 190, name: 'Lorenzo Depp', org: 'Youth Justice Coalition — Millhaven', email: 'ldepp@yjc-millhaven.org', twitter: 'https://x.com/lorenzodepp_yjc' },
  { num: 191, name: 'Sandra Reeve', org: 'Millhaven Independent Police Monitor', email: 'sreeve@millhaven-ipm.gov', phone: '+1 555 201 1910' },
  { num: 192, name: 'Dr. Amara Diallo', org: 'Columbia University — Criminology', email: 'a.diallo@columbia.edu', twitter: 'https://x.com/dramaradiallo' },
  { num: 193, name: 'Jim Caldwell', org: "Millhaven Mayor's Office", email: 'jcaldwell@millhaven.gov' },
  { num: 194, name: 'Owen Park', org: 'Park Labor Law Group', email: 'opark@parklabor.com', linkedin: 'https://linkedin.com/in/owenpark-laborlaw' },
  { num: 195, name: 'Capt. Steve Marsh', org: 'Millhaven Police Department — Internal Affairs', email: 'smarsh@millhaven-pd.gov' },
  { num: 196, name: 'Ingrid Lau', org: 'State Campaign Finance Board — Records', email: 'i.lau@state-cfb.gov' },
  { num: 197, name: 'Thomas Kimura', org: 'Millhaven Police Reform Alliance', email: 'tkimura@mhpolicereform.org', twitter: 'https://x.com/thomaskimura_mpra' },
  { num: 198, name: 'Priya Ramirez', org: 'City of Millhaven — Finance Dept.', email: 'pramirez@millhaven.gov' },
  { num: 199, name: 'Hon. Douglas Bell (ret.)', org: 'Formerly: U.S. District Court', email: 'douglasbell.ret@gmail.com', phone: '+1 555 334 1990' },
  { num: 200, name: 'Miriam Osei', org: 'Millhaven Youth Council', email: 'mosei.youth@millhaven.gov', twitter: 'https://x.com/miriamosei_myc' },
];

const ALL_BULK = [...P1_CONTACTS, ...P2_CONTACTS, ...P3_CONTACTS, ...P4_CONTACTS, ...P5_CONTACTS];

function projForContact(num: number): string {
  if (num <= 45) return PROJ.p1;
  if (num <= 80) return PROJ.p2;
  if (num <= 120) return PROJ.p3;
  if (num <= 160) return PROJ.p4;
  return PROJ.p5;
}
function themesForProj(projId: string): string[] {
  if (projId === PROJ.p1) return P1_THEMES;
  if (projId === PROJ.p2) return P2_THEMES;
  if (projId === PROJ.p3) return P3_THEMES;
  if (projId === PROJ.p4) return P4_THEMES;
  return P5_THEMES;
}

export function seedDevData(db: Database.Database, reporterEmail: string, reporterName: string): void {
  const existing = db.prepare('SELECT COUNT(*) as n FROM contacts WHERE id LIKE ?').get('dev-cont-%') as { n: number };
  if (existing.n > 0) return;

  const insertProject = db.prepare(`
    INSERT INTO projects (id, name, description, is_shared, shared_pending_writes, created_at)
    VALUES (?, ?, ?, 0, 0, ?)
  `);
  const insertContact = db.prepare(`
    INSERT INTO contacts (id, name, organization, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertEmail = db.prepare(`INSERT INTO contact_emails (id, contact_id, email, sort_order) VALUES (?, ?, ?, ?)`);
  const insertPhone = db.prepare(`INSERT INTO contact_phones (id, contact_id, phone, sort_order) VALUES (?, ?, ?, ?)`);
  const insertLink = db.prepare(`INSERT INTO contact_links (id, contact_id, type, url, sort_order) VALUES (?, ?, ?, ?, ?)`);
  const insertMembership = db.prepare(`
    INSERT INTO project_memberships
      (id, contact_id, project_id, reporter_email, reporter_name, priority, status, theme,
       first_outreach_at, outreach_interval_days, outreach_reminders_disabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLog = db.prepare(`
    INSERT INTO interaction_log_entries (id, membership_id, reporter_email, reporter_name, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertScratchpad = db.prepare(`
    INSERT INTO message_scratchpad_drafts (id, contact_id, project_id, label, body, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    // ── Projects ─────────────────────────────────────────────────────────────
    insertProject.run(PROJ.p1, 'Pentagon Slush Fund',
      'Investigating off-books payments from Halcyon Defense Group to senior DoD procurement officials via shell companies in Delaware and the Cayman Islands.',
      secs(90));
    insertProject.run(PROJ.p2, 'City Hall Contracts',
      "Probe into no-bid contracts awarded to Mayor Alderman's former business partner. Three city departments implicated.",
      secs(60));
    insertProject.run(PROJ.p3, 'Cascade Billing Scandal',
      'Regional hospital chain systematically upcoded Medicare and insurance claims between 2022–2024. Estimated overbilling exceeds $40M. Internal whistleblowers have documentary evidence.',
      secs(45));
    insertProject.run(PROJ.p4, 'Wildfire Response Investigation',
      'Probe into CAL OES and CalTrans failures during the Pine Ridge wildfire: delayed evacuation orders, deferred road maintenance on the primary evacuation route, and a suppressed after-action review.',
      secs(30));
    insertProject.run(PROJ.p5, 'Police Union Dark Money',
      "Investigation into the Metropolitan Police Officers Association PAC's spending patterns: $1.4M across three election cycles concentrated on four city council members who then voted on use-of-force policy and oversight budgets.",
      secs(20));

    // ── Existing key contacts (1–9) — kept with full detail ──────────────────
    // 1. Elena Vasquez
    insertContact.run(cid(1), 'Elena Vasquez', 'Formerly: Halcyon Defense Group',
      'Primary whistleblower. Left Halcyon in 2022 after refusing to sign off on quarterly filings. Has copies of internal wire transfer approvals. Prefers Signal over email. Do not contact at her home address — estranged from husband who is still a Halcyon employee.',
      secs(44), secs(5));
    insertEmail.run('dev-email-c1-1', cid(1), 'e.vasquez.private@proton.me', 0);
    insertPhone.run('dev-phone-c1-1', cid(1), '+1 703 555 0142', 0);
    insertLink.run('dev-link-c1-li', cid(1), 'linkedin', 'https://linkedin.com/in/elenavasquez-cfo', 0);

    // 2. Marcus Webb
    insertContact.run(cid(2), 'Marcus Webb', 'U.S. Department of Defense',
      "Senior procurement officer, GS-15. Named in three of the wire transfers. Declined comment through DoD press office. Personal lawyer is Catherine Park at Boies Schiller. Do not approach at home.",
      secs(40), secs(12));
    insertEmail.run('dev-email-c2-1', cid(2), 'marcus.webb@osd.mil', 0);
    insertLink.run('dev-link-c2-li', cid(2), 'linkedin', 'https://linkedin.com/in/marcuswebb-dod', 0);

    // 3. Dr. Priya Nair
    insertContact.run(cid(3), 'Dr. Priya Nair', 'Georgetown University — Center for Security Studies',
      "Go-to expert on off-books defense contracting. Very responsive. Will go on record. Ask about her 2019 paper on shell company layering in procurement fraud — directly relevant to what Elena described.",
      secs(38), secs(8));
    insertEmail.run('dev-email-c3-1', cid(3), 'p.nair@georgetown.edu', 0);
    insertEmail.run('dev-email-c3-2', cid(3), 'priya.nair.research@gmail.com', 1);
    insertPhone.run('dev-phone-c3-1', cid(3), '+1 202 555 0198', 0);
    insertLink.run('dev-link-c3-x', cid(3), 'x', 'https://x.com/drpriyanair', 0);
    insertLink.run('dev-link-c3-li', cid(3), 'linkedin', 'https://linkedin.com/in/drpriyanair', 1);

    // 4. James Holroyd
    insertContact.run(cid(4), 'James Holroyd', 'Halcyon Defense Group',
      "VP Gov't Relations since 2019. Formerly at the Pentagon as a civilian advisor (2014–2018). The revolving-door angle. Responded once to say he'd \"look into it\" — nothing since.",
      secs(35), secs(18));
    insertEmail.run('dev-email-c4-1', cid(4), 'jholroyd@halcyondefense.com', 0);
    insertLink.run('dev-link-c4-li', cid(4), 'linkedin', 'https://linkedin.com/in/jamesholroyd', 0);
    insertLink.run('dev-link-c4-x', cid(4), 'x', 'https://x.com/jholroyd_dc', 1);

    // 5. Sandra Obi
    insertContact.run(cid(5), 'Sandra Obi', 'City of Millhaven — Office of Budget & Management',
      "Mid-level budget analyst who flagged anomalies in the Parks & Rec contract line internally and was told to drop it. Willing to talk, nervous about job security. Met in person at the coffee shop on Archer St. Bring nothing with a Millhaven logo.",
      secs(18), secs(3));
    insertEmail.run('dev-email-c5-1', cid(5), 'sandra.obi@millhaven.gov', 0);
    insertEmail.run('dev-email-c5-2', cid(5), 'sandraobiwork@gmail.com', 1);
    insertPhone.run('dev-phone-c5-1', cid(5), '+1 555 201 4477', 0);

    // 6. Tom Fisk
    insertContact.run(cid(6), 'Tom Fisk', 'Fisk & Calloway Development LLC',
      "Recipient of the no-bid contracts in question. Alderman's college roommate and former business partner until 2018 (on paper). Public records show three Fisk LLC invoices totaling $2.1M paid in 14 months. Has not responded to any outreach.",
      secs(17), secs(17));
    insertEmail.run('dev-email-c6-1', cid(6), 'tom@fiskcalloway.com', 0);
    insertPhone.run('dev-phone-c6-1', cid(6), '+1 555 334 9021', 0);
    insertLink.run('dev-link-c6-li', cid(6), 'linkedin', 'https://linkedin.com/in/tomfisk-developer', 0);
    insertLink.run('dev-link-c6-ig', cid(6), 'instagram', 'https://instagram.com/tomfiskbuilds', 1);

    // 7. Claudette Renard
    insertContact.run(cid(7), 'Claudette Renard', 'Millhaven City Council — District 4',
      "Minority-caucus member. Has been publicly critical of the Mayor's procurement process. Reached out to us first via a mutual contact. Will speak on background but not on record yet.",
      secs(15), secs(6));
    insertEmail.run('dev-email-c7-1', cid(7), 'councilmember.renard@millhaven.gov', 0);
    insertEmail.run('dev-email-c7-2', cid(7), 'crenard.district4@gmail.com', 1);
    insertPhone.run('dev-phone-c7-1', cid(7), '+1 555 407 8832', 0);
    insertLink.run('dev-link-c7-x', cid(7), 'x', 'https://x.com/claudetterenard', 0);
    insertLink.run('dev-link-c7-fb', cid(7), 'facebook', 'https://facebook.com/renarddistrict4', 1);

    // 8. Ray Dempsey (cross-project: P1 + P2 + P3)
    insertContact.run(cid(8), 'Ray Dempsey', 'Dempsey Forensic Consulting',
      'CPA and certified fraud examiner. Has testified in 12 federal cases. Used for the 2022 hospital billing story — meticulous. Available on background or on record. Charges $400/hr. Worth it.',
      secs(43), secs(9));
    insertEmail.run('dev-email-c8-1', cid(8), 'ray@dempseyforensic.com', 0);
    insertPhone.run('dev-phone-c8-1', cid(8), '+1 212 555 0067', 0);
    insertLink.run('dev-link-c8-li', cid(8), 'linkedin', 'https://linkedin.com/in/raydempsey-cpa', 0);

    // 9. Alicia Chung
    insertContact.run(cid(9), 'Alicia Chung', 'The Millhaven Ledger',
      "Rival reporter on the City Hall story. Focused on Parks & Rec angle; we're on infrastructure contracts. May be worth coordinating on FOIA requests. Proceed cautiously.",
      secs(10), secs(10));
    insertEmail.run('dev-email-c9-1', cid(9), 'achung@millhavenledger.com', 0);
    insertLink.run('dev-link-c9-x', cid(9), 'x', 'https://x.com/alichiachung', 0);

    // ── Bulk contacts (10–200) ────────────────────────────────────────────────
    for (const c of ALL_BULK) {
      insertContact.run(cid(c.num), c.name, c.org ?? null, c.notes ?? null, secs(60), secs(30));
      insertEmail.run(`dev-email-c${c.num}-1`, cid(c.num), c.email, 0);
      if (c.phone) insertPhone.run(`dev-phone-c${c.num}-1`, cid(c.num), c.phone, 0);
      if (c.linkedin) insertLink.run(`dev-link-c${c.num}-li`, cid(c.num), 'linkedin', c.linkedin, 0);
      if (c.twitter) insertLink.run(`dev-link-c${c.num}-x`, cid(c.num), 'x', c.twitter, c.linkedin ? 1 : 0);
    }

    // ── Memberships: existing 9 contacts ────────────────────────────────────
    // Elena → P1
    insertMembership.run(mid(1), cid(1), PROJ.p1, reporterEmail, reporterName,
      'Critical', 'Interviewed on-record', 'Financial transfers / shell companies',
      secs(41), null, 0, secs(44), secs(5));
    // Marcus → P1
    insertMembership.run(mid(2), cid(2), PROJ.p1, reporterEmail, reporterName,
      'High', 'Referred to communications', 'DoD procurement',
      secs(38), null, 0, secs(40), secs(12));
    // Dr. Nair → P1
    insertMembership.run(mid(3), cid(3), PROJ.p1, reporterEmail, reporterName,
      'Medium', 'Agreed, not yet scheduled', 'Expert comment',
      secs(36), null, 0, secs(38), secs(8));
    // James Holroyd → P1
    insertMembership.run(mid(4), cid(4), PROJ.p1, reporterEmail, reporterName,
      'High', 'Outreach attempted, no response', 'Revolving door / lobbying',
      secs(33), null, 0, secs(35), secs(18));
    // Sandra → P2
    insertMembership.run(mid(5), cid(5), PROJ.p2, reporterEmail, reporterName,
      'Critical', 'Interviewed off-record', 'Budget analysis',
      secs(16), null, 0, secs(18), secs(3));
    // Tom Fisk → P2
    insertMembership.run(mid(6), cid(6), PROJ.p2, reporterEmail, reporterName,
      'High', 'Outreach attempted, no response', 'Contract irregularities',
      null, null, 0, secs(17), secs(17));
    // Claudette → P2
    insertMembership.run(mid(7), cid(7), PROJ.p2, reporterEmail, reporterName,
      'High', 'Interviewed off-record', 'Political connections',
      secs(13), null, 0, secs(15), secs(6));
    // Ray → P1
    insertMembership.run(mid(8), cid(8), PROJ.p1, reporterEmail, reporterName,
      'Medium', 'Agreed, not yet scheduled', 'Financial analysis',
      secs(40), null, 0, secs(43), secs(9));
    // Ray → P2
    insertMembership.run(mid(9), cid(8), PROJ.p2, reporterEmail, reporterName,
      'Medium', 'Not yet contacted', 'Financial analysis',
      null, null, 0, secs(15), secs(15));
    // Alicia → P2
    insertMembership.run(mid(10), cid(9), PROJ.p2, reporterEmail, reporterName,
      'Low', 'Not yet contacted', 'Rival / monitoring',
      null, null, 0, secs(10), secs(10));
    // Ray → P3 (cross-project expert)
    insertMembership.run(mid(11), cid(8), PROJ.p3, reporterEmail, reporterName,
      'Medium', 'Not yet contacted', 'Financial analysis',
      null, null, 0, secs(10), secs(10));

    // ── Memberships: bulk contacts ───────────────────────────────────────────
    let mNum = 12;
    for (const c of ALL_BULK) {
      const projId = projForContact(c.num);
      const themes = themesForProj(projId);
      const fo = firstOutreachDays(c.num);
      const lc = lastContactDays(c.num);
      const status = contactStatus(c.num);
      const priority = contactPriority(c.num);
      const t = themes[c.num % themes.length];

      insertMembership.run(
        mid(mNum), cid(c.num), projId,
        reporterEmail, reporterName,
        priority, status, t,
        fo !== null ? secs(fo) : null,
        null, 0,
        secs(60), secs(30),
      );

      const body = logBody(c.num);
      if (body !== null && lc !== null) {
        insertLog.run(
          `dev-log-bulk-${mNum}`, mid(mNum),
          reporterEmail, reporterName,
          body, secs(lc),
        );
      }

      mNum++;
    }

    // Cross-project: Victor Reyes (#168) also in P2
    insertMembership.run(
      mid(mNum), cid(168), PROJ.p2,
      reporterEmail, reporterName,
      'Medium', 'Agreed, not yet scheduled', 'Legal context',
      secs(12), null, 0, secs(15), secs(10),
    );
    insertLog.run(`dev-log-bulk-${mNum}`, mid(mNum), reporterEmail, reporterName,
      'Flagged that PAC disclosure issues in the City Hall story may also violate state contribution limits. Agreed to review filings.', secs(10));
    mNum++;

    // Cross-project: Kevin Walsh (#183) also in P2
    insertMembership.run(
      mid(mNum), cid(183), PROJ.p2,
      reporterEmail, reporterName,
      'Low', 'Not yet contacted', 'Financial context',
      null, null, 0, secs(10), secs(10),
    );
    mNum++;

    // ── Interaction log entries: existing key contacts ───────────────────────
    insertLog.run('dev-log-0001', mid(1), reporterEmail, reporterName,
      'Initial contact via Signal after tip from mutual source at Senate Armed Services Committee. She confirmed she has internal Halcyon documents. Very cautious — took 20 minutes to establish ground rules.',
      secs(41));
    insertLog.run('dev-log-0002', mid(1), reporterEmail, reporterName,
      'Two-hour in-person meeting at the Dulles Marriott. She showed me three pages of wire transfer approvals dated Q3 2021. Halcyon listed the recipient as "Meridian Strategic Services LLC" — incorporated in Delaware 10 days before the first transfer.',
      secs(30));
    insertLog.run('dev-log-0003', mid(1), reporterEmail, reporterName,
      "She agreed to go on record after I described how we'd frame the story. Sending the legal team's source protection memo for her lawyer to review.",
      secs(12));
    insertLog.run('dev-log-0004', mid(1), reporterEmail, reporterName,
      'Her lawyer (Nathan Cho at EFF) reviewed the memo and signed off. On-record interview scheduled for next Tuesday. She\'s bringing a USB with the documents.',
      secs(5));

    insertLog.run('dev-log-0005', mid(2), reporterEmail, reporterName,
      'Sent written questions via DoD press office. Generic acknowledgment received 48 hours later.',
      secs(38));
    insertLog.run('dev-log-0006', mid(2), reporterEmail, reporterName,
      'Follow-up after 10 days. DoD press office said Webb is "not the appropriate spokesperson" and directed us to the Office of the Under Secretary for Acquisition.',
      secs(28));

    insertLog.run('dev-log-0007', mid(3), reporterEmail, reporterName,
      'Cold outreach by email referencing her 2019 paper. Responded within an hour — very enthusiastic. Says she\'s been watching the Halcyon contracts for 18 months.',
      secs(36));
    insertLog.run('dev-log-0008', mid(3), reporterEmail, reporterName,
      'Background call. She pointed to SEC registration gaps in Meridian. Will go on record once we\'re closer to publication.',
      secs(22));

    insertLog.run('dev-log-0009', mid(5), reporterEmail, reporterName,
      'First meeting off-site. Described a budget line in Parks & Rec FY23 that jumped $800k with no supporting documentation.',
      secs(16));
    insertLog.run('dev-log-0010', mid(5), reporterEmail, reporterName,
      'Second meeting. She brought a photo of the contract header on her personal phone. Fisk & Calloway LLC listed as contractor. Scope of work: "facilities assessment and strategic planning." No RFP attached.',
      secs(9));
    insertLog.run('dev-log-0011', mid(5), reporterEmail, reporterName,
      'She says her supervisor asked why she requested contract files from procurement. Someone tipped them off. Told her to pause — we\'ll get what we need via FOIA.',
      secs(3));

    insertLog.run('dev-log-0012', mid(7), reporterEmail, reporterName,
      'Her chief of staff Tomas Reyes made the initial outreach. Met at her district office after hours. She\'s been tracking the contracts independently and already has the FOIA calendar.',
      secs(13));
    insertLog.run('dev-log-0013', mid(7), reporterEmail, reporterName,
      'She sent over a spreadsheet of all no-bid contracts over $250k since 2020. Fisk & Calloway appears six times totaling $3.8M — more than our earlier estimate.',
      secs(6));

    insertLog.run('dev-log-0014', mid(8), reporterEmail, reporterName,
      'Sent public incorporation docs for Meridian and the three Delaware shell addresses. He said he can trace beneficial ownership chain once we have bank routing numbers.',
      secs(40));
    insertLog.run('dev-log-0015', mid(8), reporterEmail, reporterName,
      'Ray called back — the Cayman address on the Halcyon docs matches a known nominee-director service. Sending engagement letter.',
      secs(32));

    // ── Scratchpad drafts ────────────────────────────────────────────────────
    insertScratchpad.run('dev-scratch-0001', cid(2), PROJ.p1,
      'Right of reply — DoD press office',
      `Mr. Webb,\n\nWe are preparing an article on procurement contracts between Halcyon Defense Group and the Department of Defense between 2020 and 2023. Documents in our possession raise questions about payments routed through Meridian Strategic Services LLC.\n\n1. Were you involved in approving contracts with Halcyon between 2020 and 2023?\n2. Do you have a personal or financial relationship with any officer of Meridian Strategic Services LLC?\n3. Is there any context you would like us to include?\n\nWe will need a response by [DATE].\n\n—`,
      secs(25), secs(20));

    insertScratchpad.run('dev-scratch-0002', cid(6), PROJ.p2,
      'Initial outreach — Tom Fisk',
      `Mr. Fisk,\n\nI'm a reporter at [OUTLET] working on a story about city contracting. Public records show Fisk & Calloway Development LLC was awarded several no-bid contracts by the City of Millhaven between 2021 and 2023 totaling more than $2 million.\n\nI'd welcome the chance to speak with you before we publish.\n\n—`,
      secs(17), secs(17));

    insertScratchpad.run('dev-scratch-0003', cid(81), PROJ.p3,
      'Right of reply — Cascade CEO',
      `Dr. Pryce,\n\nWe are preparing an article on billing practices at Cascade Health Systems between 2022 and 2024. We have reviewed billing data and spoken with current and former employees. We would like to offer you the opportunity to respond before publication.\n\nSpecifically:\n1. Was Cascade's Revenue Integrity Program designed to increase the severity of diagnosis codes applied to Medicare claims?\n2. Were any employees disciplined or reassigned for raising concerns about the program?\n\nWe will need a response by [DATE].\n\n—`,
      secs(8), secs(5));
  })();
}
