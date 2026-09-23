/**
 * video-lazy.js — Defer autoplay videos until they're actually about to
 * be seen, and pause them again once scrolled away.
 *
 * THE PROBLEM THIS FIXES: a page like Reachability-casestudy.html has
 * a dozen <video autoplay> elements. With plain autoplay, the browser
 * starts fetching and buffering *every single one* the instant the page
 * loads — including ones many screens below the fold that the visitor
 * may not scroll to for a while, or ever. All of those downloads
 * compete for the same bandwidth as the very first video the visitor
 * is actually looking at, which is exactly why that first video (and
 * everything else on the page) can feel like it takes forever to
 * start: it's sharing the connection with a dozen others no one has
 * scrolled to yet.
 *
 * THE FIX: every matching <video> has its src moved to data-src up
 * front (see markVideo below), so nothing downloads at all until an
 * IntersectionObserver reports the video is actually near the
 * viewport — at which point its real src is set and it starts
 * playing. Scrolling a video back out of view pauses it (playback
 * only, not the download) so it isn't burning CPU/battery decoding
 * frames no one can see, and picks back up instantly on scroll-back
 * with no re-buffering.
 *
 * USAGE: add class="vid-lazy" alongside the existing vid-class /
 * vid-class-noside classes (or any <video autoplay> — the selector
 * below already covers both, so no markup changes are required on
 * existing pages). Nothing else needed; this runs automatically.
 */

(function () {
    const videos = document.querySelectorAll('video[autoplay]');
    if (!videos.length) return;

    // Videos more than a couple of screens away don't need to be
    // fetched yet — this margin just starts the load a little before
    // the video scrolls into view, so playback is already underway by
    // the time it's actually visible instead of starting a beat late.
    const ROOT_MARGIN = '600px 0px';

    function markVideo(video) {
        const src = video.getAttribute('src');
        if (!src) return; // nothing to defer (e.g. the template's placeholder URL)
        video.dataset.src = src;
        video.removeAttribute('src');
        video.removeAttribute('autoplay'); // playback is now driven manually, once loaded
        video.preload = 'none';
    }

    function loadAndPlay(video) {
        if (video.dataset.src) {
            // Setting .src already triggers the browser's own media
            // resource-selection algorithm — no separate .load() call
            // needed. Calling .load() afterward (an earlier version of
            // this file did) explicitly resets the element a second
            // time, discarding whatever had already started buffering
            // and restarting from scratch — that double-reset is what
            // was showing up as the video visibly disappearing and
            // reappearing right as it scrolled into view.
            video.src = video.dataset.src;
            delete video.dataset.src;
        }
        // Autoplay policies can still reject programmatic play() in some
        // edge cases (e.g. the tab losing focus mid-load) — that's not
        // an error worth surfacing, the video just stays paused on its
        // poster frame instead.
        video.play().catch(function () {});
    }

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                loadAndPlay(entry.target);
            } else {
                entry.target.pause();
            }
        });
    }, { rootMargin: ROOT_MARGIN });

    videos.forEach(function (video) {
        markVideo(video);
        observer.observe(video);
    });
})();
