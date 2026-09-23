/**
 * cursor.js — Custom cursor follower
 *
 * Three states:
 * 1. Default: small green outlined circle, follows cursor with slight lag
 * 2. Over a generic hoverable (links, buttons): slightly smaller filled circle
 * 3. Over a .project-card / .vu-project-card / .etc-item / any
 *    [data-cursor-label] element: morphs into a rounded-rectangle pill
 *    showing custom text (e.g. "view project", "Coming soon",
 *    "click to see more"), dropping straight down from the pointer.
 *
 * Plus a special case: the homepage callout chips (.callout-chip) show
 * their OWN hover label directly on themselves (see .callout-chip-hint
 * in casestudy-extra.css) rather than using this cursor pill, so the
 * ring is hidden completely while over one of those — otherwise the
 * generic hoverable dot would sit on top of/compete with that label.
 *
 * CONTRAST: states 1–2 are brand green by default. Over a background
 * dark enough that green would lose contrast (the green nav bar,
 * footer, a hover button that turns green), or directly on top of
 * brand-green label text, the ring switches to white instead (the
 * "cursor-on-dark" class in casestudy-extra.css). Rather than
 * hardcoding a list of selectors for "things that are green", this is
 * decided by actually reading the computed background/text color of
 * whatever's under the pointer each time the hover target changes
 * (see needsWhiteCursor below) — a plain relative-luminance check
 * against the nearest opaque background, plus a direct match against
 * the site's own --primary-color for text. That's cheap (getComputedStyle,
 * not layout) and only runs on real hover-target changes, not per frame.
 * The pill/card state never needs this — it's a deliberate, opaque
 * green box with white text regardless of what's underneath it.
 *
 * The real OS cursor is never hidden — fully accessible, doesn't interfere
 * with keyboard navigation or screen readers. On .etc-item, the OS cursor
 * is already set to a zoom-in (magnifying glass) glyph via CSS, so this
 * pill just adds a "click to see more" label alongside it — the icon
 * itself is untouched.
 *
 * PERFORMANCE:
 * - mousemove only tracks position (cheap, passive listener). State
 *   (which of the modes we're in) is tracked separately via
 *   mouseover/mouseout event delegation, not by hit-testing on every
 *   mousemove — calling document.elementFromPoint() on every mousemove
 *   forces a synchronous layout recalculation each time, and mousemove
 *   can fire 100+ times a second, so that was the source of the jank.
 *   mouseover/mouseout only fire when the hovered element actually
 *   changes, so this does the same job at a fraction of the cost.
 * - The root font size (used to convert the pill's rem-based padding/
 *   min-width to px) is read once at startup, not on every hover.
 * - ring.offsetWidth/offsetHeight (needed each frame to keep the dot
 *   centered and the pill positioned) force a synchronous layout read
 *   if called blindly every frame, 60 times a second, forever. Since
 *   the ring's size only actually changes for the ~300ms around a
 *   hover-state change, it's measured freshly only during that short
 *   window (see measureUntil below) and a cached value is reused the
 *   rest of the time — i.e. almost all frames, since most of a visit
 *   is spent with the pointer not actively switching hover states.
 * - The one rAF loop does a handful of arithmetic ops and a couple of
 *   style writes per frame; everything else is event-driven. rAF
 *   itself already pauses automatically whenever the tab isn't
 *   visible, so there's nothing running in a background tab.
 *
 * WIDTH: browsers cannot smoothly CSS-transition to/from `width: auto`,
 * which is what made the old dot → pill growth snap instead of animate
 * no matter how the transition/easing was tuned. Every state (28px
 * default dot, 9px hoverable dot, and the pill) now sets an explicit
 * pixel width via ring.style.width, so the declared CSS transition
 * always has two real numbers to interpolate between. The pill's own
 * target width is measured off-screen (see measurePillWidth) from the
 * label text, so it still comfortably fits any label length.
 *
 * LABEL VISIBILITY: the text is only readable once the pill is mostly
 * grown, not as soon as it starts forming. label.style.opacity is set
 * directly from cursor.js every frame as a function of pillProgress
 * (see LABEL_REVEAL_START below) instead of via a CSS transition tied
 * to the class toggle — that keeps it precisely in sync with the same
 * progress value driving the pill's size/position, rather than two
 * independent timers that can drift apart.
 *
 * POSITIONING: the dot states stay centered on the pointer. The pill
 * drops straight down from the pointer instead of reading off to a
 * side — no left/right overflow to reason about. pillProgress (0→1)
 * eases toward its target every frame and blends between the
 * centered-dot position and the pill's anchored position.
 *
 * VIEWPORT WALL-CLAMP: rather than flipping the pill to a different
 * anchor point when it would run past a viewport edge (which read as
 * a jarring hop), its position is simply clamped so it always renders
 * fully inside the viewport — sliding to sit flush against an edge as
 * the pointer approaches it, instead of jumping to sit somewhere else.
 */

(function () {
    if (window.matchMedia('(hover: none)').matches) return; // skip touch devices

    const ring = document.createElement('div');
    ring.id = 'cursor-ring';
    ring.innerHTML = '<span id="cursor-label">view project</span>';
    // Invisible until the very first real mousemove — see the
    // FIRST-PAINT note further down for why this matters.
    ring.style.opacity = '0';
    document.body.appendChild(ring);

    const label = ring.querySelector('#cursor-label');

    // Off-screen probe used to measure how wide the pill needs to be
    // for a given label, without ever touching the visible ring's own
    // width mid-measurement (see WIDTH note above).
    const measurer = document.createElement('span');
    measurer.style.cssText = 'position:fixed; left:-9999px; top:-9999px; visibility:hidden; white-space:nowrap; ' +
        'font-family:"abc-diatype-round", sans-serif; font-size:0.96rem; font-weight:400; letter-spacing:0.01em;';
    document.body.appendChild(measurer);

    // Read once — the site never changes its root font size at
    // runtime, so there's no need to re-read this on every hover.
    const ROOT_PX = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const PILL_PADDING_PX = 1.3 * ROOT_PX * 2; // matches #cursor-ring.cursor-on-card's 0 1.3rem padding
    const PILL_MIN_WIDTH_PX = 8.5 * ROOT_PX;   // floor so short labels still read as a proper pill

    function measurePillWidth(text) {
        measurer.textContent = text;
        return Math.max(PILL_MIN_WIDTH_PX, measurer.offsetWidth + PILL_PADDING_PX);
    }

    // ── Dark-surface / green-text detection (see CONTRAST note above) ──
    const PRIMARY_GREEN = { r: 22, g: 135, b: 79 }; // matches --primary-color (#16874F)

    function parseRGB(str) {
        const m = str && str.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map(parseFloat);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }

    function relativeLuminance(c) {
        return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    }

    function colorsClose(a, b, tolerance) {
        return Math.abs(a.r - b.r) < tolerance && Math.abs(a.g - b.g) < tolerance && Math.abs(a.b - b.b) < tolerance;
    }

    function needsWhiteCursor(el) {
        // Walk up from the hovered element to the nearest opaque
        // background and check whether it's dark enough that the
        // brand-green ring would lose contrast against it.
        let node = el;
        while (node && node !== document.documentElement) {
            const bg = parseRGB(getComputedStyle(node).backgroundColor);
            if (bg && bg.a > 0.5) {
                return relativeLuminance(bg) < 0.5;
            }
            node = node.parentElement;
        }
        return false;
    }

    function needsWhiteForText(el) {
        // Also catches hovering directly over brand-green label text
        // sitting on an otherwise light background (tags, links, case-
        // study labels) — the background walk above wouldn't flag
        // these, since the text itself has no background of its own.
        const textColor = parseRGB(getComputedStyle(el).color);
        return !!(textColor && colorsClose(textColor, PRIMARY_GREEN, 24));
    }

    // .project-card is the original card style (still used by the "Up
    // next" section on case-study pages). .vu-project-card is the
    // card style used on the homepage and Works page. .etc-item is the
    // visual-design grid on the Etc. page — it keeps its native
    // zoom-in (magnifying glass) OS cursor; this pill just adds a
    // "click to see more" label next to it. Any element with a
    // [data-cursor-label] attribute also gets the pill treatment,
    // using its own attribute as the text.
    const CARD_SELECTOR = '.project-card, .vu-project-card';
    const ZOOM_SELECTOR = '.etc-item';
    const PILL_SELECTOR = CARD_SELECTOR + ', ' + ZOOM_SELECTOR + ', [data-cursor-label]';
    // Elements that show their own on-element label — the cursor ring
    // hides completely over these (see file header note above).
    const SUPPRESS_SELECTOR = '.callout-chip';
    const HOVER_SELECTOR = PILL_SELECTOR + ', ' + SUPPRESS_SELECTOR + ', a, button, input, textarea, select, [role="button"]';

    const DOT_WIDTH = 28;
    const HOVER_DOT_WIDTH = 9;
    // Gap (px) between the pointer and the top of the pill, and how
    // far from a viewport edge the pill stops before touching it —
    // see POSITIONING and VIEWPORT WALL-CLAMP notes above.
    const PILL_GAP_Y = 20;
    const EDGE_MARGIN = 10;
    // How long after a hover-state change to keep re-measuring the
    // ring's actual size each frame (covers the ~0.3s CSS size
    // transition plus a little margin) — see PERFORMANCE note above.
    const MEASURE_WINDOW_MS = 360;
    // The label only starts fading in once pillProgress passes this
    // point (and is fully visible by 1) — see LABEL VISIBILITY above.
    const LABEL_REVEAL_START = 0.7;

    let mouseX = -100, mouseY = -100;
    let ringX = -100, ringY = -100;
    // FIRST-PAINT BUG THIS GUARDS AGAINST: reloading (or opening) a
    // page while the real OS cursor is already resting over something
    // fires a genuine 'mouseover' for it — browsers do this on a fresh
    // document even without any pixel of mouse movement — but *not* a
    // 'mousemove', since the pointer hasn't actually moved. Relying on
    // 'mousemove' alone to ever set mouseX/mouseY meant that until the
    // person's mouse physically moved, those stayed at their -100,-100
    // placeholder — so a mouseover arriving first (pointer already on
    // a card on load) would flip on the "view project" pill with no
    // real coordinate to place it at, and the viewport wall-clamp (see
    // VIEWPORT WALL-CLAMP above) would pin that very negative,
    // off-screen position to sit right at the top-left corner instead:
    // a fully-formed, readable pill parked in the wrong corner.
    // The actual fix is that mouseover carries the same real
    // e.clientX/e.clientY a mousemove would — nothing about a genuine
    // coordinate requires the event to specifically be 'mousemove' —
    // so whichever of the two fires first now establishes position
    // equally (see the top of the mouseover handler below). That also
    // means the pill correctly appears immediately when the page loads
    // with the pointer already resting on a card, instead of needing a
    // nudge first. hasMouseMoved still guards the one-time snap so the
    // ring's first appearance lands exactly under the pointer rather
    // than lerping in from the -100,-100 placeholder, and pageshow's
    // bfcache-restore handler (further below) still resets it so a
    // restored page goes through this exact same first-paint path
    // again instead of showing whatever was frozen from before.
    let hasMouseMoved = false;

    // 0 = fully dot/hoverable state, 1 = fully pill state. Eases toward
    // whichever the current hover state targets, driving the blend
    // between centered and pill-anchored positioning, and the label's
    // reveal, every frame.
    let pillProgress = 0;
    const PILL_EASE = 0.15;

    // Cached ring size + the window during which it's worth
    // re-measuring — see PERFORMANCE note above.
    let cachedW = DOT_WIDTH, cachedH = DOT_WIDTH;
    let measureUntil = 0;

    function scheduleRemeasure() {
        measureUntil = performance.now() + MEASURE_WINDOW_MS;
    }

    // Shared by the mousemove and mouseover listeners below — either
    // can be the first real signal of where the pointer actually is
    // (see FIRST-PAINT above), and both should establish position the
    // same way when that happens.
    function establishPosition(clientX, clientY) {
        hasMouseMoved = true;
        mouseX = clientX;
        mouseY = clientY;
        // Snap straight to the real position instead of lerping in
        // from the old -100,-100 placeholder, so the ring's first
        // appearance is exactly under the pointer, not sliding in
        // from the corner.
        ringX = mouseX;
        ringY = mouseY;
    }

    document.addEventListener('mousemove', function (e) {
        if (!hasMouseMoved) {
            establishPosition(e.clientX, e.clientY);
            if (!ring.classList.contains('cursor-suppressed')) {
                ring.style.opacity = '1';
            }
        } else {
            mouseX = e.clientX;
            mouseY = e.clientY;
        }
    }, { passive: true });

    document.addEventListener('mouseover', function (e) {
        if (!hasMouseMoved) establishPosition(e.clientX, e.clientY);

        const suppressEl = e.target.closest(SUPPRESS_SELECTOR);
        if (suppressEl) {
            ring.classList.remove('cursor-on-card', 'cursor-on-hoverable', 'cursor-on-dark');
            ring.classList.add('cursor-suppressed');
            ring.style.opacity = '0';
            return;
        }
        ring.classList.remove('cursor-suppressed');
        // hasMouseMoved is unconditionally true by this point — either
        // it already was, or establishPosition just set it above — so
        // a real coordinate is always available here now.
        ring.style.opacity = '1';

        const pillEl  = e.target.closest(PILL_SELECTOR);
        const hoverEl = pillEl ? null : e.target.closest('a, button, input, textarea, select, [role="button"]');

        ring.classList.toggle('cursor-on-card', !!pillEl);
        ring.classList.toggle('cursor-on-hoverable', !!hoverEl);
        // Pill state keeps its own always-green look — only worth
        // checking contrast for the plain dot states.
        ring.classList.toggle('cursor-on-dark', !pillEl && (needsWhiteCursor(e.target) || needsWhiteForText(e.target)));

        if (pillEl) {
            let text;
            if (pillEl.matches(ZOOM_SELECTOR)) {
                // Etc. page grid items — keep the magnifying-glass OS
                // cursor (unaffected by this pill) and just add the
                // supporting label.
                text = 'click to see more';
            } else if (pillEl.hasAttribute('data-cursor-label')) {
                text = pillEl.getAttribute('data-cursor-label');
            } else {
                // "Coming soon" cards aren't clickable yet — swap the label so
                // hovering them doesn't imply the same "go read this" action as
                // a real, finished project card.
                const isSoon = pillEl.classList.contains('project-card-soon') || pillEl.classList.contains('vu-project-card-soon');
                text = isSoon ? 'Coming soon' : 'view project';
            }
            label.textContent = text;
            ring.style.width = measurePillWidth(text) + 'px';
        } else {
            ring.style.width = (hoverEl ? HOVER_DOT_WIDTH : DOT_WIDTH) + 'px';
        }
        scheduleRemeasure();
    }, { passive: true });

    document.addEventListener('mouseout', function (e) {
        // Only clear state once the pointer has actually left the
        // hoverable/pill/suppress element itself — e.relatedTarget is
        // where the pointer is going; if it's still inside the same
        // element (e.g. moving between an icon and its parent link),
        // leave state as is.
        const leftEl = e.target.closest(HOVER_SELECTOR);
        if (!leftEl) return;
        const related = e.relatedTarget;
        if (related && leftEl.contains(related)) return;

        ring.classList.remove('cursor-on-card', 'cursor-on-hoverable', 'cursor-suppressed', 'cursor-on-dark');
        ring.style.opacity = '1';
        ring.style.width = DOT_WIDTH + 'px';
        scheduleRemeasure();
    }, { passive: true });

    window.addEventListener('resize', scheduleRemeasure, { passive: true });

    function animate() {
        const factor = 0.16;
        ringX += (mouseX - ringX) * factor;
        ringY += (mouseY - ringY) * factor;

        // Ease the pill/dot blend toward its current target instead of
        // snapping the instant the class toggles.
        const pillTarget = ring.classList.contains('cursor-on-card') ? 1 : 0;
        pillProgress += (pillTarget - pillProgress) * PILL_EASE;
        if (Math.abs(pillTarget - pillProgress) < 0.001) pillProgress = pillTarget;

        // Only forces a layout read while a size transition is
        // actually plausibly in flight — see PERFORMANCE note above.
        if (performance.now() < measureUntil) {
            cachedW = ring.offsetWidth;
            cachedH = ring.offsetHeight;
        }
        const w = cachedW, h = cachedH;

        const centeredX = ringX - w / 2;
        const centeredY = ringY - h / 2;

        // Pill anchor: straight down from the pointer, then wall-clamped
        // so it always renders fully inside the viewport.
        let anchoredX = ringX - w / 2;
        let anchoredY = ringY + PILL_GAP_Y;
        anchoredX = Math.min(Math.max(anchoredX, EDGE_MARGIN), window.innerWidth - w - EDGE_MARGIN);
        anchoredY = Math.min(Math.max(anchoredY, EDGE_MARGIN), window.innerHeight - h - EDGE_MARGIN);

        const x = centeredX + (anchoredX - centeredX) * pillProgress;
        const y = centeredY + (anchoredY - centeredY) * pillProgress;

        ring.style.transform = `translate(${x}px, ${y}px)`;

        // See LABEL VISIBILITY note above — tied to the same
        // pillProgress driving size/position, not a separate timer.
        const reveal = Math.max(0, Math.min(1, (pillProgress - LABEL_REVEAL_START) / (1 - LABEL_REVEAL_START)));
        label.style.opacity = reveal;

        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    document.addEventListener('mouseleave', function () { ring.style.opacity = '0'; }, { passive: true });
    document.addEventListener('mouseenter', function () {
        if (!ring.classList.contains('cursor-suppressed')) ring.style.opacity = '1';
    }, { passive: true });

    // BACK/FORWARD-CACHE RESTORE BUG: clicking a card navigates to a
    // new document, but browsers commonly keep the page you left
    // frozen in memory (bfcache) rather than destroying it, so that
    // hitting Back restores it instantly instead of re-running the
    // page from scratch. "Restoring" means this whole script's state
    // resumes exactly as frozen — mid-hover, ring.style.opacity:'1',
    // 'cursor-on-card' still applied, width still the wide pill —
    // since freezing/restoring isn't a real page load, nothing here
    // reruns and nothing resets on its own. Bfcache restore also
    // doesn't fire a mousemove just because the page became visible
    // again, so left alone this frozen "view project" pill would sit
    // fully visible at its old position (over where the card used to
    // be) until the real mouse next physically moves — then jump to
    // catch up, which is the exact bug this fixes.
    // 'pageshow' fires on every page display, including this one;
    // event.persisted is true only for a bfcache restore specifically
    // (a normal fresh load re-runs this whole file from the top
    // instead, with every variable back at its initial value, so it
    // doesn't need this — hasMouseMoved already starts false and the
    // ring already starts hidden, see FIRST-PAINT above).
    // The reset itself is the same one mouseout already uses for
    // "left a hoverable" (opacity aside), plus rearming hasMouseMoved
    // so the FIRST-PAINT guard's own logic — already written to bring
    // the ring back cleanly rather than sliding or jumping in — is
    // what actually reveals it again, snapped straight to wherever
    // the pointer genuinely is on the next real mousemove.
    window.addEventListener('pageshow', function (e) {
        if (!e.persisted) return;
        hasMouseMoved = false;
        ring.classList.remove('cursor-on-card', 'cursor-on-hoverable', 'cursor-suppressed', 'cursor-on-dark');
        ring.style.opacity = '0';
        ring.style.width = DOT_WIDTH + 'px';
        pillProgress = 0;
        cachedW = DOT_WIDTH;
        cachedH = DOT_WIDTH;
    });
})();
