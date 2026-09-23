/**
 * nav.js — Shared Navigation Component
 *
 * Injects the shared nav into any page with <header id="site-header">.
 * Active page: desktop pill flips to white bg + green text (inverted).
 * No underline used for active state — the pill inversion is the indicator.
 */

// Fix "stuck" hover/focus button states after using the browser's
// back/forward buttons. Clicking a link (e.g. "More projects") gives it
// keyboard focus; some browsers restore that same focus state when the
// page is served from the back/forward cache (bfcache), so the :focus/
// :hover styling stays visibly "stuck" even though nothing is being
// interacted with anymore. Blurring the focused element whenever a page
// is restored from bfcache clears it, site-wide, for every link/button.
window.addEventListener('pageshow', function (event) {
    if (event.persisted && document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
    }
});

document.addEventListener('DOMContentLoaded', function () {
    const header = document.getElementById('site-header');
    if (!header) return;

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // Pages where "works" should be active
    const worksPages = ['Projects.html', 'goodreadsnew.html', 'speculative-listerine.html', 'speculative-listerine-condensed.html', 'goodreads-vu-style.html', 'notion-experiment-old.html', 'notion-casestudy.html','notion-experiment-condensed.html', 'brainstreams.html', 'brainstreams-condensed.html', 'iphone-onehanded.html', 'iphone-onehanded-condensed.html', 'Reachability-casestudy.html'];
    // Pages where "etc." should be active
    const etcPages = ['Archive.html'];

    function isActive(key) {
        if (key === 'works') return worksPages.includes(currentPage);
        if (key === 'etc') return etcPages.includes(currentPage);
        if (key === 'about') return currentPage === 'about.html';
        return false;
    }

    function navLink(href, key, label) {
        const active = isActive(key);
        // aria-current for accessibility; CSS uses it to apply the active style
        return `<a href="${href}"${active ? ' aria-current="page"' : ''}>${label}</a>`;
    }

    header.innerHTML = `
        <a href="index.html" class="my-brand-link">
            <div class="my-brand">
                <picture>
                    <source class="smiley-logo" media="(max-width:57.45rem)" srcset="img/small-logo.png">
                    <img class="smiley-logo" src="img/logo.png" height="336" width="336" alt="a smiley with a u shape smile">
                </picture>
                <h1>
                    <span class="logotype">SAHAR BABAEI</span>
                    <span class="short-logotype">S.B.</span>
                </h1>
            </div>
        </a>

        <div class="space-fixer-div"></div>

        <nav>
            ${navLink('Projects.html', 'works', 'Projects')}
            ${navLink('Archive.html', 'etc', 'Archive')}
            ${navLink('about.html', 'about', 'About')}
        </nav>

        <div class="space-fixer-div"></div>

        <div class="side-footer">
            <p>Design and code by yours truly.</p>
            <p>Copyright &copy; 2026, Sahar Babaei</p>
        </div>
    `;

    // Case-study pages only (detected via .vu-hero — the hero component
    // every real case study has, e.g. notion-casestudy.html,
    // Reachability-casestudy.html — rather than a hardcoded filename
    // list, so this doesn't need updating every time a case study is
    // added) get a fixed "jump to top" button. Visibility for the
    // tablet-only range (30rem–57.5rem) is handled in breakpoints.css:
    // hidden by default (mobile), shown at 30rem+, hidden again at
    // 57.5rem+ once the always-visible sidebar takes over.
    if (document.querySelector('.vu-hero')) {
        const jumpBtn = document.createElement('button');
        jumpBtn.type = 'button';
        jumpBtn.className = 'vu-jump-to-top';
        jumpBtn.setAttribute('aria-label', 'Jump to top');
        jumpBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 8H15M15 8L9.5 2.5M15 8L9.5 13.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        jumpBtn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        document.body.appendChild(jumpBtn);
    }

});
