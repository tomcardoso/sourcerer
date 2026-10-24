// Builds the Sourcerer website into dist/: the landing page (src/index.html) and one page for each
// file in ../docs, rendered from the same Markdown that GitHub shows. docs/ stays the single source:
// this script only adds the site's layout, navigation, search and theme around it.
//
//   npm run build    write dist/
//   npm run dev      build, then serve dist/ on http://localhost:4321
//
// The app screenshots are docs/images/app-*.png, taken by `npm run screenshots` at the repo root;
// the Pages workflow takes them again before every deploy, so the site never falls behind the app.
// The download buttons name the latest release's files. In CI the script reads them from the
// GitHub API (GITHUB_TOKEN raises the rate limit); offline it falls back to package.json's
// version and the release page.

import { Marked } from 'marked';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DOCS = join(ROOT, 'docs');
const SRC = join(HERE, 'src');
const DIST = join(HERE, 'dist');
const FONTS = join(ROOT, 'src', 'renderer', 'src', 'assets', 'fonts');

export const SITE_URL = 'https://tomcardoso.github.io/sourcerer/';
const REPO = 'https://github.com/tomcardoso/sourcerer';
const CHROME = 'https://chromewebstore.google.com/detail/sourcerer/pipgdnekoknjbghnmhilapocpchdcadm';
const FIREFOX = 'https://addons.mozilla.org/en-CA/firefox/addon/sourcerer-for-journalists/';

// The docs, in reading order. `file` is the Markdown in docs/; the page is the same name in .html
// (the app's Help menu links to guide.html and extension.html, so those names must not change).
// `aliases` keep the section links of the old hand-written pages working.
const PAGES = [
  {
    file: 'guide.md', nav: 'User guide', blurb: 'Every feature, from first launch to shared projects.',
    aliases: { contacts: 'your-contacts', 'import-export': 'import--export', extension: 'browser-extension' },
  },
  {
    file: 'extension.md', nav: 'Browser extension', blurb: 'Capture pages, save selected text and add contacts from your browser.',
    aliases: { connecting: 'connecting-to-the-app', screenshot: 'saving-a-screenshot', 'save-selection': 'saving-selected-text-to-a-contact', 'new-contact': 'adding-a-new-contact', 'right-click': 'right-click-menu' },
  },
  {
    file: 'security.md', nav: 'Security', blurb: 'How Sourcerer protects your data, and what it does not protect against.',
    aliases: { encryption: 'encryption-model', password: 'your-master-password', 'what-is-not': 'what-is-not-protected', network: 'network-traffic', 'http-server': 'local-http-server', 'source-code': 'open-source' },
  },
];

const html = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pageOf = (p) => p.file.replace('.md', '.html');

// ── Release ────────────────────────────────────────────────────────────────────────────────

async function release() {
  const fallbackVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const latest = `${REPO}/releases/latest`;
  const out = { version: fallbackVersion, page: latest, files: {} };
  try {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'sourcerer-site' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const url = 'https://api.github.com/repos/tomcardoso/sourcerer/releases/latest';
    let res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 && headers.Authorization) {
      delete headers.Authorization;
      res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    }
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const r = await res.json();
    out.version = r.tag_name.replace(/^v/, '');
    out.page = r.html_url;
    for (const a of r.assets) {
      if (/arm64\.dmg$/.test(a.name)) out.files.mac = { url: a.browser_download_url, name: a.name };
      else if (/Setup.*\.exe$/.test(a.name)) out.files.windows = { url: a.browser_download_url, name: a.name };
      else if (/\.AppImage$/.test(a.name)) out.files.linux = { url: a.browser_download_url, name: a.name };
    }
  } catch (e) {
    console.warn(`Release lookup failed (${e.message}); using ${fallbackVersion} and the release page.`);
  }
  const guess = {
    mac: `Sourcerer-${out.version}-arm64.dmg`,
    windows: `Sourcerer.Setup.${out.version}.exe`,
    linux: `Sourcerer-${out.version}.AppImage`,
  };
  for (const k of ['mac', 'windows', 'linux']) out.files[k] ??= { url: latest, name: guess[k] };
  return out;
}

// ── Markdown ───────────────────────────────────────────────────────────────────────────────

// GitHub's heading anchors, so a link that works on github.com works here too.
function slugger() {
  const seen = new Map();
  return (text) => {
    const s = text.toLowerCase().trim().replace(/[^\p{L}\p{N}\- _]/gu, '').replace(/ /g, '-');
    const n = seen.get(s) ?? 0;
    seen.set(s, n + 1);
    return n ? `${s}-${n}` : s;
  };
}

function plain(tokens) {
  return (tokens ?? []).map((t) => (t.tokens ? plain(t.tokens) : t.type === 'html' ? '' : t.text ?? '')).join('');
}

// A PNG's own size, so each screenshot reserves its space before it loads.
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const EXT_ICON = '<svg class="ext-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/></svg>';

function renderDoc(md, aliases = {}) {
  const slug = slugger();
  const toc = [];
  const byTarget = Object.fromEntries(Object.entries(aliases).map(([from, to]) => [to, from]));
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = plain(tokens);
        const id = slug(text);
        const inner = this.parser.parseInline(tokens);
        if (depth === 2 || depth === 3) toc.push({ depth, id, text });
        if (depth === 1) return `<h1>${inner}</h1>\n`;
        const alias = byTarget[id] ? `<span class="alias" id="${byTarget[id]}"></span>` : '';
        return `${alias}<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${inner}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        let url = href;
        const external = /^[a-z]+:/i.test(href);
        if (!external && !href.startsWith('#')) url = href.replace(/\.md(?=#|$)/, '.html');
        const t = title ? ` title="${html(title)}"` : '';
        if (external && !href.startsWith('mailto:')) return `<a href="${html(url)}"${t} class="ext">${inner}${EXT_ICON}</a>`;
        return `<a href="${html(url)}"${t}>${inner}</a>`;
      },
      image({ href, text }) {
        const alt = html(text);
        if (!href.startsWith('images/')) return `<img src="${html(href)}" alt="${alt}" loading="lazy">`;
        const src = join(DOCS, href);
        const { w, h } = existsSync(src) ? pngSize(src) : { w: 0, h: 0 };
        const size = w ? ` width="${w / 2}" height="${h / 2}"` : '';
        const darkHref = href.replace(/\.png$/, '-dark.png');
        const dark = existsSync(join(DOCS, darkHref))
          ? `<img class="only-dark" src="${darkHref}" alt="${alt}"${size} loading="lazy" decoding="async">`
          : '';
        return `<span class="shot zoomable${dark ? ' has-dark' : ''}"><img class="only-light" src="${href}" alt="${alt}"${size} loading="lazy" decoding="async">${dark}</span>`;
      },
      blockquote({ tokens }) {
        const body = this.parser.parse(tokens);
        const lead = /^<p><strong>([^<]+)<\/strong>/.exec(body)?.[1] ?? '';
        const kind = /cannot be|can't be|not synced/i.test(lead) ? 'warn' : 'note';
        return `<aside class="callout callout-${kind}">${body}</aside>\n`;
      },
    },
  });
  let out = marked.parse(md);
  out = out.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  return { body: out, toc };
}

// Plain text of each section, for search.
function searchEntries(md, page, title) {
  const slug = slugger();
  const entries = [];
  let cur = { id: '', heading: title, text: [] };
  const flush = () => {
    const text = cur.text.join(' ').replace(/\s+/g, ' ').trim();
    if (text || cur.id) entries.push({ p: title, h: cur.heading, u: `${page}${cur.id ? '#' + cur.id : ''}`, x: text.slice(0, 900) });
  };
  let fenced = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const m = !fenced && /^(#{1,6}) (.+)$/.exec(line);
    if (m) {
      const text = m[2].replace(/[`*_]/g, '');
      if (m[1].length === 1) { cur.heading = text; continue; }
      flush();
      cur = { id: slug(text), heading: text, text: [] };
    } else {
      cur.text.push(line.replace(/<[^>]+>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[|*`#>_]/g, ' '));
    }
  }
  flush();
  return entries;
}

// ── Layout ─────────────────────────────────────────────────────────────────────────────────

const ICONS = {
  github: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
  search: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m13.2 13.2 3.8 3.8" stroke="currentColor" stroke-width="1.6"/></svg>',
  sun: '<svg class="i-sun" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 1.8v2.1M10 16.1v2.1M1.8 10h2.1M16.1 10h2.1M4.2 4.2l1.5 1.5M14.3 14.3l1.5 1.5M4.2 15.8l1.5-1.5M14.3 5.7l1.5-1.5" stroke="currentColor" stroke-width="1.5"/></svg>',
  moon: '<svg class="i-moon" viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 12.3A6.8 6.8 0 0 1 7.7 3.5a6.8 6.8 0 1 0 8.8 8.8Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  menu: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" stroke-width="1.6"/></svg>',
};

// The app's wordmark (src/renderer/src/components/WordmarkLogo.tsx): Spectral with the amber
// four-point star. Drawn as text and an inline star so the site's own Spectral renders it.
const STAR = '<svg class="wordmark-star" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 0 10.8 7.2 18 9 10.8 10.8 9 18 7.2 10.8 0 9 7.2 7.2Z"/></svg>';
const wordmark = () => `<span class="wordmark"><span class="wordmark-text">Sourcerer</span>${STAR}</span>`;

function head({ title, description, path, extraHead = '' }) {
  const url = SITE_URL + (path === 'index.html' ? '' : path);
  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${html(title)}</title>
<meta name="description" content="${html(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Sourcerer">
<meta property="og:title" content="${html(title)}">
<meta property="og:description" content="${html(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE_URL}images/app-contact.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#faf9f5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1b1812" media="(prefers-color-scheme: dark)">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preload" href="fonts/Spectral-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/JetBrainsMono-Medium.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/fonts.css">
<link rel="stylesheet" href="assets/site.css">
<script>document.documentElement.classList.add('js');try{var t=localStorage.getItem('src-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
${extraHead}</head>`;
}

function header(active) {
  const link = (href, label, key) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="site-header-inner">
    <a class="brand" href="./" aria-label="Sourcerer home">${wordmark()}</a>
    <nav class="site-nav" aria-label="Main">
      ${link('./#tour', 'Tour', 'tour')}
      ${link('guide.html', 'Guide', 'guide.md')}
      ${link('extension.html', 'Extension', 'extension.md')}
      ${link('security.html', 'Security', 'security.md')}
      ${link('./#download', 'Download', 'download')}
    </nav>
    <div class="site-tools">
      <button class="tool search-open" type="button" aria-label="Search the docs">${ICONS.search}<span class="search-label">Search</span><kbd class="kbd-hint">⌘K</kbd></button>
      <button class="tool theme-toggle" type="button" aria-label="Switch between light and dark">${ICONS.sun}${ICONS.moon}</button>
      <a class="tool" href="${REPO}" aria-label="Sourcerer on GitHub">${ICONS.github}</a>
      <button class="tool menu-toggle" type="button" aria-label="Menu" aria-expanded="false">${ICONS.menu}</button>
    </div>
  </div>
</header>`;
}

function footer(rel) {
  return `<footer class="site-footer">
  <div class="site-footer-inner">
    <div class="footer-brand">
      ${wordmark()}
      <p>Encrypted source management for journalists and researchers. Free and open source, under the AGPL-3.0 licence.</p>
      <p class="footer-small">Version ${html(rel.version)}. This site sets no cookies and runs no analytics. Every name in its screenshots is fictional.</p>
    </div>
    <div class="footer-cols">
      <div><h2>Documentation</h2>${PAGES.map((p) => `<a href="${pageOf(p)}">${p.nav}</a>`).join('')}</div>
      <div><h2>Extension</h2><a href="${CHROME}">Chrome Web Store</a><a href="${FIREFOX}">Firefox Add-ons</a></div>
      <div><h2>Project</h2><a href="${REPO}">Source code</a><a href="${REPO}/releases">Releases</a><a href="${REPO}/issues">Report a problem</a><a href="https://github.com/sponsors/tomcardoso">Sponsor</a></div>
    </div>
  </div>
</footer>
<div class="search-dialog" hidden>
  <div class="search-scrim" data-close></div>
  <div class="search-panel" role="dialog" aria-modal="true" aria-label="Search the docs">
    <div class="search-field">${ICONS.search}<input type="search" placeholder="Search the docs…" aria-label="Search the docs" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div>
    <ul class="search-results" role="listbox"></ul>
    <p class="search-empty" hidden>No matches. Try fewer or different words.</p>
  </div>
</div>
<div class="lightbox" hidden><img alt=""><button type="button" class="lightbox-close" aria-label="Close">×</button></div>
<script src="assets/site.js" defer></script>`;
}

function docPage(page, rendered, index, rel) {
  const h1 = /<h1>(.*?)<\/h1>/.exec(rendered.body)?.[1] ?? page.nav;
  const title = h1.replace(/<[^>]+>/g, '');
  const out = pageOf(page);
  const nav = PAGES.map((p) => {
    const current = p === page;
    const sub = current
      ? `<ul class="doc-nav-sub">${rendered.toc.filter((t) => t.depth === 2).map((t) => `<li><a href="#${t.id}">${html(t.text)}</a></li>`).join('')}</ul>`
      : '';
    return `<li${current ? ' class="current"' : ''}><a href="${pageOf(p)}"${current ? ' aria-current="page"' : ''}>${p.nav}</a>${sub}</li>`;
  }).join('');
  const toc = rendered.toc.length
    ? `<nav class="doc-toc" aria-label="On this page"><h2>On this page</h2><ul>${rendered.toc.map((t) => `<li class="d${t.depth}"><a href="#${t.id}">${html(t.text)}</a></li>`).join('')}</ul></nav>`
    : '';
  const prev = PAGES[index - 1];
  const next = PAGES[index + 1];
  const pager = `<nav class="pager" aria-label="Previous and next">
    ${prev ? `<a class="pager-prev" href="${pageOf(prev)}"><span>Previous</span>${prev.nav}</a>` : '<span></span>'}
    ${next ? `<a class="pager-next" href="${pageOf(next)}"><span>Next</span>${next.nav}</a>` : '<span></span>'}
  </nav>`;
  return `${head({ title: `${title} · Sourcerer`, description: page.blurb, path: out })}
<body class="doc">
${header(page.file)}
<div class="doc-layout">
  <aside class="doc-nav" aria-label="Documentation">
    <p class="doc-nav-title">Documentation</p>
    <ol>${nav}</ol>
    <a class="doc-nav-download" href="./#download">Download Sourcerer ${html(rel.version)}</a>
  </aside>
  <main id="main" class="doc-main">
    <p class="doc-kicker">Documentation · ${index + 1} of ${PAGES.length}</p>
    <article class="prose">${rendered.body}</article>
    ${pager}
    <p class="doc-edit"><a href="${REPO}/blob/main/docs/${page.file}">Edit this page on GitHub</a></p>
  </main>
  ${toc}
</div>
${footer(rel)}
</body>
</html>
`;
}

// ── Assets ─────────────────────────────────────────────────────────────────────────────────

// The app's own typefaces, self-hosted from the app's source: nothing is fetched from a third
// party when someone reads the site.
function fonts() {
  mkdirSync(join(DIST, 'fonts'), { recursive: true });
  const faces = [
    ['Spectral', 400, 'Spectral-Regular'], ['Spectral', 600, 'Spectral-SemiBold'], ['Spectral', 700, 'Spectral-Bold'],
    ['JetBrains Mono', 400, 'JetBrainsMono-Regular'], ['JetBrains Mono', 500, 'JetBrainsMono-Medium'], ['JetBrains Mono', 600, 'JetBrainsMono-SemiBold'],
  ];
  let css = '';
  for (const [family, weight, file] of faces) {
    cpSync(join(FONTS, `${file}.woff2`), join(DIST, 'fonts', `${file}.woff2`));
    css += `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; font-display: swap; src: url('../fonts/${file}.woff2') format('woff2'); }\n`;
  }
  writeFileSync(join(DIST, 'assets', 'fonts.css'), css);
}

// ── Build ──────────────────────────────────────────────────────────────────────────────────

const rel = await release();
rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'assets'), { recursive: true });
cpSync(join(SRC, 'assets'), join(DIST, 'assets'), { recursive: true });
cpSync(join(ROOT, 'build', 'icon.svg'), join(DIST, 'favicon.svg'));
cpSync(join(DOCS, 'images'), join(DIST, 'images'), { recursive: true });
fonts();

const search = [];
PAGES.forEach((page, i) => {
  const md = readFileSync(join(DOCS, page.file), 'utf8');
  const rendered = renderDoc(md, page.aliases);
  writeFileSync(join(DIST, pageOf(page)), docPage(page, rendered, i, rel));
  search.push(...searchEntries(md, pageOf(page), /^# (.+)$/m.exec(md)[1]));
});
const unlisted = readdirSync(DOCS).filter((f) => f.endsWith('.md') && !PAGES.some((p) => p.file === f));
if (unlisted.length) throw new Error(`docs/ has pages the site does not list: ${unlisted.join(', ')}. Add them to PAGES in site/build.mjs.`);
writeFileSync(join(DIST, 'search.json'), JSON.stringify(search));

// Every screenshot the landing page names must exist, in both themes.
const index = readFileSync(join(SRC, 'index.html'), 'utf8');
for (const [, img] of index.matchAll(/src="(images\/[^"]+)"/g)) {
  if (!existsSync(join(DOCS, img))) throw new Error(`src/index.html shows ${img}, which docs/ does not have. Run \`npm run screenshots\` at the repo root.`);
}

// The landing page: src/index.html with the release and the shared header and footer filled in.
const vars = {
  HEAD: head({
    title: 'Sourcerer: encrypted source management for journalists',
    description: 'A free desktop app for journalists and researchers that keeps contacts, outreach and source relationships encrypted on your own computer.',
    path: 'index.html',
    extraHead: '<link rel="stylesheet" href="assets/home.css">\n',
  }),
  HEADER: header('home'),
  FOOTER: footer(rel) + '\n<script src="assets/home.js" defer></script>',
  VERSION: html(rel.version),
  RELEASE_PAGE: rel.page,
  MAC: rel.files.mac.url,
  MAC_FILE: html(rel.files.mac.name),
  WINDOWS: rel.files.windows.url,
  WINDOWS_FILE: html(rel.files.windows.name),
  LINUX: rel.files.linux.url,
  LINUX_FILE: html(rel.files.linux.name),
  CHROME,
  FIREFOX,
  REPO,
};
writeFileSync(join(DIST, 'index.html'), index.replace(/{{(\w+)}}/g, (_, k) => {
  if (!(k in vars)) throw new Error(`src/index.html uses {{${k}}}, which build.mjs does not set`);
  return vars[k];
}));

writeFileSync(join(DIST, '404.html'), `${head({ title: 'Page not found · Sourcerer', description: 'This page does not exist.', path: '404.html' })}
<body class="doc">
${header('')}
<main id="main" class="not-found">
  <p class="doc-kicker">404</p>
  <h1>Page not found.</h1>
  <p>There's no page at this address. Try the <a href="guide.html">user guide</a>, or search the docs.</p>
</main>
${footer(rel)}
</body>
</html>
`);
writeFileSync(join(DIST, '.nojekyll'), '');
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', ...PAGES.map(pageOf)].map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);
console.log(`Built ${PAGES.length + 1} pages into ${DIST} (Sourcerer ${rel.version}).`);
