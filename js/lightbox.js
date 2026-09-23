/**
 * lightbox.js — Image Lightbox
 *
 * HOW IT WORKS:
 * - Any <img> inside an element with class "lightbox-zone" becomes clickable.
 * - On click: a full-screen overlay appears with the image enlarged, plus a
 *   short line of text describing the image (the "full-screen description").
 *   This is DIFFERENT from a permanent on-page image caption (the small
 *   italic line you might place under an image in the page itself, using
 *   .img-caption or .vu-img-caption) — that caption is always visible.
 *   The full-screen description only appears inside this overlay.
 * - The cursor changes to a magnifying glass on hover over those images.
 * - Press Escape or click the X button or the backdrop to close.
 *
 * PERFORMANCE:
 * - The overlay HTML is created once on first use, not on page load.
 * - Uses event delegation (one listener on the document) not per-image listeners.
 * - Images are shown at natural size via CSS — no re-encoding or canvas.
 *
 * SIZING: #lb-img is one shared <img>, reused for every lightbox-zone
 * image on the page — only its src (and alt/description) change on
 * each open, no JS sizing needed. It used to need one: width:100% +
 * height:auto + max-height ran into a real browser bug for portrait-
 * enough images at wide-enough viewports (both constraints binding at
 * once, resolved independently instead of jointly, producing a box
 * shaped nothing like its content). Fixed at the CSS level instead —
 * see the comment on #lb-img in casestudy-extra.css — by switching to
 * max-width instead of a forced width:100%, the same pattern
 * Archive.html's own separate overlay already used successfully. No JS
 * workaround needed once the CSS itself does the right thing.
 *
 * TO USE ON A PAGE:
 * 1. Add <script src="js/lightbox.js" defer></script> to the page <head>
 * 2. Wrap your images in a container with class="lightbox-zone"
 * 3. Optionally add data-fullscreen-description="..." to an <img> for the
 *    text shown in the full-screen overlay. If omitted, the alt text is used.
 */

(function () {
    let overlay = null; // created lazily on first use

    function buildOverlay() {
        if (overlay) return; // only build once

        overlay = document.createElement('div');
        overlay.id = 'lb-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Image viewer');
        overlay.innerHTML = `
            <button id="lb-close" aria-label="Close image">&#x2715;</button>
            <div id="lb-img-wrap">
                <img id="lb-img" src="" alt="">
                <p id="lb-fullscreen-description"></p>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeLightbox();
        });
        document.getElementById('lb-close').addEventListener('click', closeLightbox);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeLightbox();
        });
    }

    function openLightbox(src, alt, description) {
        buildOverlay(); // no-op if already built

        const img = document.getElementById('lb-img');
        const desc = document.getElementById('lb-fullscreen-description');

        img.src = src;
        img.alt = alt;
        desc.textContent = description || alt || 'Add data-fullscreen-description="..." to the img element';

        overlay.classList.add('lb-open');
        document.body.classList.add('lb-body-lock'); // prevent background scroll
        document.getElementById('lb-close').focus();
    }

    function closeLightbox() {
        if (!overlay) return;
        overlay.classList.remove('lb-open');
        document.body.classList.remove('lb-body-lock');
    }

    // One delegated click listener on the whole document.
    // Checks if the clicked element is an <img> inside a .lightbox-zone.
    document.addEventListener('click', function (e) {
        if (e.target.tagName === 'IMG' && e.target.closest('.lightbox-zone')) {
            const img = e.target;
            openLightbox(
                img.src,
                img.alt,
                img.dataset.fullscreenDescription || img.alt
            );
        }
    });
})();
