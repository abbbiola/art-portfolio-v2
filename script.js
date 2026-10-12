"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const categories = ["paintings", "drawings"];

let archive = {
  artworks: { paintings: [], drawings: [] },
  writing: []
};

let archiveLoaded = false;
let writingFilter = "all";
let drawingSection = "finished";
let lastWritingButton = null;
let writingOpenedFromIndex = false;

let viewerWorks = [];
let viewerIndex = 0;
let viewerTrigger = null;
let viewerAnimating = false;

let swipePointerId = null;
let swipeStartX = 0;
let swipeStartY = 0;
let swipeDeltaX = 0;
let swipeDragging = false;

const viewer = $("#viewer");
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

/* ---------------------------------------------------------
   ENTRY LOADER
   --------------------------------------------------------- */

if (!prefersReducedMotion.matches) {
  $("#loader").hidden = false;
  window.setTimeout(() => {
    $("#loader").hidden = true;
  }, 600);
}

/* ---------------------------------------------------------
   SMALL HELPERS
   --------------------------------------------------------- */

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function artworkMeta(work) {
  return [work.medium, work.year, work.dimensions]
    .filter(Boolean)
    .join(" · ");
}

function mediumTagsFor(work) {
  if (Array.isArray(work.mediumTags) && work.mediumTags.length) {
    return work.mediumTags.filter(Boolean);
  }

  return work.medium ? [work.medium] : [];
}

function writingYear(entry) {
  if (entry.year) return String(entry.year);

  if (entry.date) {
    const match = String(entry.date).match(/\b(19|20)\d{2}\b/);
    if (match) return match[0];
  }

  return "";
}

function writingMeta(entry) {
  return [
    entry.type === "poem" ? "poetry" : entry.type,
    writingYear(entry)
  ].filter(Boolean).join(" · ");
}

/* ---------------------------------------------------------
   IMAGES
   --------------------------------------------------------- */

function addImage(container, work, large = false) {
  const placeholder = element("span", "image-placeholder");
  placeholder.append(element("strong", "", work.title));
  placeholder.append(element("span", "", "image not yet available"));
  container.append(placeholder);

  if (!work.image) return;

  const img = document.createElement("img");
  img.alt = work.alt || [work.title, work.medium].filter(Boolean).join(", ");
  img.loading = large ? "eager" : "lazy";
  img.decoding = "async";
  img.draggable = false;

  img.addEventListener("load", () => {
    placeholder.remove();
  }, { once: true });

  img.addEventListener("error", () => {
    img.remove();
  }, { once: true });

  img.src = work.image;
  container.append(img);
}

/* ---------------------------------------------------------
   ARTWORK FILTERING
   --------------------------------------------------------- */

function worksForSection(category) {
  const works = archive.artworks[category] || [];

  if (category !== "drawings") {
    return works;
  }

  return works.filter(
    work => (work.section || "finished") === drawingSection
  );
}

function populateMediumFilter(category) {
  const section = document.getElementById(category);
  const filter = $(".medium", section);
  const previousValue = filter.value || "all";

  const tags = [
    ...new Set(
      worksForSection(category)
        .flatMap(work => mediumTagsFor(work))
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));

  filter.replaceChildren(new Option("all mediums", "all"));

  tags.forEach(tag => {
    filter.add(new Option(tag, tag));
  });

  filter.value = tags.includes(previousValue) ? previousValue : "all";
}

function selectedArtworks(category) {
  const section = document.getElementById(category);
  const medium = $(".medium", section).value;
  const sort = $(".sort", section).value;

  const works = worksForSection(category).filter(work => {
    return medium === "all" || mediumTagsFor(work).includes(medium);
  });

  return [...works].sort((a, b) => {
    if (sort === "az") {
      return a.title.localeCompare(b.title);
    }

    const difference =
      (Number(a.year) || 0) - (Number(b.year) || 0);

    return (
      (sort === "oldest" ? difference : -difference)
      || a.title.localeCompare(b.title)
    );
  });
}

/* ---------------------------------------------------------
   DRAWINGS: FINISHED WORKS / SKETCHBOOK
   --------------------------------------------------------- */

function setupDrawingTabs() {
  const section = $("#drawings");
  const controls = $(".art-controls", section);

  let tabs = $(".drawing-tabs", section);

  if (!tabs) {
    tabs = element("div", "drawing-tabs");
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Drawing collection");

    const finished = element("button", "", "finished works");
    finished.type = "button";
    finished.dataset.section = "finished";

    const sketchbook = element("button", "", "sketchbook");
    sketchbook.type = "button";
    sketchbook.dataset.section = "sketchbook";

    tabs.append(finished, sketchbook);
    controls.before(tabs);
  }

  $$("button", tabs).forEach(button => {
    const active = button.dataset.section === drawingSection;
    button.setAttribute("aria-pressed", String(active));

    button.addEventListener("click", () => {
      drawingSection = button.dataset.section;

      $$("button", tabs).forEach(item => {
        item.setAttribute(
          "aria-pressed",
          String(item.dataset.section === drawingSection)
        );
      });

      populateMediumFilter("drawings");
      renderArtworks("drawings");
    });
  });
}

/* ---------------------------------------------------------
   ARTWORK LIST
   --------------------------------------------------------- */

function renderArtworks(category) {
  const section = document.getElementById(category);
  const list = $(".art-list", section);
  const works = selectedArtworks(category);

  list.replaceChildren();

  $(".count", section).textContent =
    `${works.length} ${works.length === 1 ? "work" : "works"}`;

  if (!works.length) {
    const message =
      category === "drawings" && drawingSection === "sketchbook"
        ? "No sketchbook works added here yet."
        : "No works to show here yet.";

    list.append(element("p", "empty-state", message));
    return;
  }

  works.forEach((work, index) => {
    const article = element("article", "artwork");

    const imageButton = element("button", "art-image");
    imageButton.type = "button";
    imageButton.setAttribute("aria-label", `View ${work.title}`);
    addImage(imageButton, work);
    imageButton.append(element("span", "view-hint", "view ↗"));

    const info = element("div", "art-info");

    const heading = element("h3");
    const titleButton = element("button", "art-title", work.title);
    titleButton.type = "button";
    titleButton.setAttribute("aria-label", `View ${work.title}`);
    heading.append(titleButton);
    info.append(heading);

    const meta = artworkMeta(work);
    if (meta) {
      info.append(element("p", "metadata", meta));
    }

    if (work.description) {
      info.append(
        element("p", "art-description", work.description)
      );
    }

    [imageButton, titleButton].forEach(button => {
      button.addEventListener("click", () => {
        openViewer(works, index, button);
      });
    });

    article.append(imageButton, info);
    list.append(article);
  });
}

function setupArtworks() {
  setupDrawingTabs();

  categories.forEach(category => {
    populateMediumFilter(category);
    renderArtworks(category);
  });
}

/* ---------------------------------------------------------
   ARTWORK VIEWER
   Smooth slide-only carousel. No fading between works.
   --------------------------------------------------------- */

function wrappedViewerIndex(index) {
  const total = viewerWorks.length;
  return ((index % total) + total) % total;
}

function makeViewerSlide(work, label) {
  const slide = element("div", "viewer-slide");
  slide.dataset.slide = label;
  addImage(slide, work, true);
  return slide;
}

function renderViewerCaption() {
  const work = viewerWorks[viewerIndex];

  $("#viewer-title").textContent = work.title;

  const meta = artworkMeta(work);
  $("#viewer-meta").textContent = meta;
  $("#viewer-meta").hidden = !meta;

  const description = $("#viewer-description");
  description.textContent = work.description || "";
  description.hidden = !description.textContent.trim();
  description.scrollTop = 0;

  $("#viewer-position").textContent =
    `${viewerIndex + 1} / ${viewerWorks.length}`;

  const disabled = viewerWorks.length < 2;
  $("#viewer-prev").disabled = disabled;
  $("#viewer-next").disabled = disabled;
}

function renderViewerTrack() {
  const imageArea = $("#viewer-image");
  imageArea.replaceChildren();

  if (!viewerWorks.length) return;

  const current = viewerWorks[viewerIndex];

  if (viewerWorks.length === 1) {
    const track = element("div", "viewer-track");
    track.append(
      makeViewerSlide(current, "previous"),
      makeViewerSlide(current, "current"),
      makeViewerSlide(current, "next")
    );
    imageArea.append(track);
    return;
  }

  const previous =
    viewerWorks[wrappedViewerIndex(viewerIndex - 1)];
  const next =
    viewerWorks[wrappedViewerIndex(viewerIndex + 1)];

  const track = element("div", "viewer-track");
  track.append(
    makeViewerSlide(previous, "previous"),
    makeViewerSlide(current, "current"),
    makeViewerSlide(next, "next")
  );

  imageArea.append(track);
}

function renderViewer() {
  renderViewerTrack();
  renderViewerCaption();
}

function openViewer(works, index, trigger) {
  viewerWorks = works;
  viewerIndex = index;
  viewerTrigger = trigger;
  viewerAnimating = false;

  renderViewer();
  viewer.showModal();
  document.body.classList.add("modal-open");
  $("#viewer-close").focus();
}

function finishViewerMove(direction) {
  viewerIndex = wrappedViewerIndex(viewerIndex + direction);
  viewerAnimating = false;
  swipeDragging = false;
  swipeDeltaX = 0;

  renderViewer();
}

function moveViewer(direction) {
  if (
    !viewerWorks.length
    || viewerWorks.length < 2
    || viewerAnimating
  ) {
    return;
  }

  const track = $(".viewer-track", $("#viewer-image"));
  if (!track) return;

  viewerAnimating = true;

  track.classList.remove(
    "is-dragging",
    "snap-center",
    "slide-next",
    "slide-prev"
  );

  track.style.transform = "";

  // Force the centered state to paint before we animate away from it.
  void track.offsetWidth;

  track.classList.add(
    direction > 0 ? "slide-next" : "slide-prev"
  );

  const duration = prefersReducedMotion.matches ? 0 : 300;

  window.setTimeout(() => {
    finishViewerMove(direction);
  }, duration);
}

/* ---------- pointer swipe ---------- */

function resetSwipe(track) {
  swipePointerId = null;
  swipeStartX = 0;
  swipeStartY = 0;
  swipeDeltaX = 0;
  swipeDragging = false;

  if (!track) return;

  track.classList.remove("is-dragging", "snap-center");
  track.style.transform = "";
}

$("#viewer-image").addEventListener("pointerdown", event => {
  if (
    viewerWorks.length < 2
    || viewerAnimating
    || event.button !== 0
  ) {
    return;
  }

  swipePointerId = event.pointerId;
  swipeStartX = event.clientX;
  swipeStartY = event.clientY;
  swipeDeltaX = 0;
  swipeDragging = false;
});

$("#viewer-image").addEventListener("pointermove", event => {
  if (
    swipePointerId === null
    || event.pointerId !== swipePointerId
    || viewerAnimating
  ) {
    return;
  }

  const dx = event.clientX - swipeStartX;
  const dy = event.clientY - swipeStartY;

  if (!swipeDragging) {
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
      return;
    }

    // Let normal vertical page motion win.
    if (Math.abs(dy) > Math.abs(dx)) {
      swipePointerId = null;
      return;
    }

    swipeDragging = true;

    try {
      $("#viewer-image").setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is helpful but not required.
    }
  }

  event.preventDefault();

  swipeDeltaX = dx;

  const track = $(".viewer-track", $("#viewer-image"));
  if (!track) return;

  track.classList.add("is-dragging");

  // The track's center is -33.333333%; add the live finger movement.
  track.style.transform =
    `translate3d(calc(-33.333333% + ${dx}px), 0, 0)`;
});

function finishSwipe(event) {
  if (
    swipePointerId === null
    || event.pointerId !== swipePointerId
  ) {
    return;
  }

  const track = $(".viewer-track", $("#viewer-image"));

  if (!swipeDragging) {
    resetSwipe(track);
    return;
  }

  const imageWidth =
    $("#viewer-image").getBoundingClientRect().width;

  const threshold = Math.min(
    90,
    Math.max(48, imageWidth * 0.14)
  );

  const direction =
    swipeDeltaX <= -threshold
      ? 1
      : swipeDeltaX >= threshold
        ? -1
        : 0;

  swipePointerId = null;
  swipeDragging = false;

  if (!track) return;

  track.classList.remove("is-dragging");
  track.style.transform = "";

  if (direction) {
    // Continue from the exact finger position to the next/previous artwork.
    // This avoids the little "snap to center, then slide" glitch.
    viewerAnimating = true;

    track.classList.remove(
      "is-dragging",
      "snap-center",
      "slide-next",
      "slide-prev"
    );

    track.style.transform =
      direction > 0
        ? "translate3d(-66.666667%, 0, 0)"
        : "translate3d(0, 0, 0)";

    window.setTimeout(() => {
      finishViewerMove(direction);
    }, prefersReducedMotion.matches ? 0 : 300);
  } else {
    // A short/accidental swipe smoothly returns to center.
    track.classList.add("snap-center");
    window.setTimeout(() => {
      track.classList.remove("snap-center");
    }, prefersReducedMotion.matches ? 0 : 300);
  }
}

$("#viewer-image").addEventListener("pointerup", finishSwipe);
$("#viewer-image").addEventListener("pointercancel", event => {
  if (event.pointerId !== swipePointerId) return;
  resetSwipe($(".viewer-track", $("#viewer-image")));
});

$("#viewer-close").addEventListener("click", () => {
  viewer.close();
});

$("#viewer-prev").addEventListener("click", () => {
  moveViewer(-1);
});

$("#viewer-next").addEventListener("click", () => {
  moveViewer(1);
});

viewer.addEventListener("close", () => {
  document.body.classList.remove("modal-open");
  viewerAnimating = false;
  swipePointerId = null;
  swipeDragging = false;

  if (viewerTrigger?.isConnected) {
    viewerTrigger.focus();
  }
});

// Escape is handled by the native dialog.
// This closes only when the true dialog backdrop is clicked.
viewer.addEventListener("click", event => {
  const rect = viewer.getBoundingClientRect();

  const outside =
    event.clientX < rect.left
    || event.clientX > rect.right
    || event.clientY < rect.top
    || event.clientY > rect.bottom;

  if (event.target === viewer && outside) {
    viewer.close();
  }
});

viewer.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    moveViewer(event.key === "ArrowLeft" ? -1 : 1);
  }
});

/* ---------------------------------------------------------
   WRITING INDEX
   Titles stay titles; tiny "read more →" opens the piece.
   --------------------------------------------------------- */

function writingHash(entry) {
  return `#writing/${encodeURIComponent(entry.id)}`;
}

function renderWriting() {
  const list = $("#writing-list");
  list.replaceChildren();

  const entries = archive.writing
    .filter(entry => {
      return (
        writingFilter === "all"
        || entry.type === writingFilter
      );
    })
    .sort((a, b) => {
      return String(b.year || b.date || "")
        .localeCompare(String(a.year || a.date || ""));
    });

  if (!entries.length) {
    list.append(
      element("p", "empty-state", "No writing published here yet.")
    );
    return;
  }

  entries.forEach(entry => {
    const article = element("article", "writing-entry");
    const year = element("p", "metadata", writingYear(entry));
    const body = element("div");

    const heading = element("h3", "", entry.title);
    body.append(heading);

    if (entry.type) {
      body.append(
        element(
          "p",
          "metadata",
          entry.type === "poem" ? "poetry" : entry.type
        )
      );
    }

    if (entry.excerpt) {
      body.append(
        element("p", "writing-excerpt", entry.excerpt)
      );
    }

    const readMore = element("a", "read-more", "read more →");
    readMore.href = writingHash(entry);
    readMore.setAttribute(
      "aria-label",
      `Read more: ${entry.title}`
    );

    readMore.addEventListener("click", () => {
      lastWritingButton = readMore;
      writingOpenedFromIndex = true;
    });

    body.append(readMore);
    article.append(year, body);
    list.append(article);
  });
}

function showWritingIndex(focus = false) {
  $("#reading-view").hidden = true;
  $("#writing-index").hidden = false;
  writingOpenedFromIndex = false;

  document.title = "abiola oyefule — writing";

  if (focus) {
    if (lastWritingButton?.isConnected) {
      lastWritingButton.focus({ preventScroll: true });
    } else {
      $("#writing-title").focus({ preventScroll: true });
    }
  }
}

function openWriting(entry, focus = false) {
  $("#writing-index").hidden = true;
  $("#reading-view").hidden = false;

  $("#reading-title").textContent = entry.title;

  const meta = writingMeta(entry);
  $("#reading-meta").textContent = meta;
  $("#reading-meta").hidden = !meta;

  const content = $("#reading-content");
  content.replaceChildren();
  content.classList.toggle(
    "poem",
    entry.type === "poem"
  );

  const paragraphs = Array.isArray(entry.content)
    ? entry.content
    : String(entry.content || "")
        .split(/\r?\n\s*\r?\n/);

  paragraphs
    .filter(text => String(text).trim())
    .forEach(text => {
      content.append(element("p", "", text));
    });

  document.title = `${entry.title} — abiola oyefule`;

  if (focus) {
    $("#reading-title").focus({ preventScroll: true });
  }
}

$("#back-to-writing").addEventListener("click", () => {
  // If the piece was opened from the writing index, use the same history
  // entry the browser Back button would use. For a direct/deep link,
  // go safely to the writing index instead of leaving the site.
  if (writingOpenedFromIndex) {
    history.back();
  } else {
    location.hash = "writing";
  }
});

/* ---------------------------------------------------------
   ROUTING / BROWSER HISTORY
   --------------------------------------------------------- */

function parseRoute() {
  const raw = location.hash.slice(1);

  if (raw.startsWith("writing/")) {
    return {
      section: "writing",
      writingId: decodeURIComponent(
        raw.slice("writing/".length)
      )
    };
  }

  if ([...categories, "writing", "about"].includes(raw)) {
    return {
      section: raw,
      writingId: null
    };
  }

  return {
    section: "paintings",
    writingId: null
  };
}

function showSection(name) {
  const safeName =
    [...categories, "writing", "about"].includes(name)
      ? name
      : "paintings";

  $$(".page").forEach(section => {
    section.hidden = section.id !== safeName;
  });

  $("#intro").hidden = safeName !== "paintings";

  $$("nav a").forEach(link => {
    const sectionName = link.hash.slice(1);

    if (sectionName === safeName) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  if (safeName !== "writing") {
    document.title = `abiola oyefule — ${safeName}`;
  }
}

function routeFromHash(focus = false) {
  const route = parseRoute();

  showSection(route.section);

  if (route.section === "writing") {
    if (!route.writingId) {
      showWritingIndex(focus);
      return;
    }

    if (!archiveLoaded) {
      // Data will be routed again immediately after content.json loads.
      $("#writing-index").hidden = false;
      $("#reading-view").hidden = true;
      return;
    }

    const entry = archive.writing.find(
      item => item.id === route.writingId
    );

    if (entry) {
      openWriting(entry, focus);
    } else {
      showWritingIndex(focus);
    }
  }

  if (focus && route.section !== "writing") {
    const heading = document.getElementById(
      `${route.section}-title`
    );

    if (heading) {
      heading.focus({ preventScroll: true });
    }
  }
}

/*
  Keep the actual <a href="#..."> navigation native.
  That means the browser automatically creates history entries,
  so Back/Forward work like a normal website.
*/
$$(".site-header a").forEach(link => {
  link.addEventListener("click", event => {
    if (
      event.ctrlKey
      || event.metaKey
      || event.shiftKey
      || event.altKey
    ) {
      return;
    }

    lastWritingButton = null;

    // If the link already points to the current hash, route it manually.
    if (link.hash === location.hash) {
      event.preventDefault();
      routeFromHash(true);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  });
});

window.addEventListener("hashchange", () => {
  routeFromHash(true);
  window.scrollTo({ top: 0, behavior: "auto" });
});

/* ---------------------------------------------------------
   CONTROLS
   --------------------------------------------------------- */

categories.forEach(category => {
  const section = document.getElementById(category);

  $(".medium", section).addEventListener("change", () => {
    renderArtworks(category);
  });

  $(".sort", section).addEventListener("change", () => {
    renderArtworks(category);
  });
});

$$(".writing-filters button").forEach(button => {
  button.addEventListener("click", () => {
    writingFilter = button.dataset.type;

    $$(".writing-filters button").forEach(item => {
      item.setAttribute(
        "aria-pressed",
        String(item === button)
      );
    });

    renderWriting();
  });
});

/* ---------------------------------------------------------
   LOAD CONTENT
   --------------------------------------------------------- */

async function loadArchive() {
  $("#load-status").hidden = false;
  $("#load-message").textContent = "Loading the archive…";
  $("#retry").hidden = true;

  try {
    const response = await fetch("./content.json");

    if (!response.ok) {
      throw new Error(
        `Content request failed: ${response.status}`
      );
    }

    const data = await response.json();

    if (
      !categories.every(category =>
        Array.isArray(data.artworks?.[category])
      )
      || !Array.isArray(data.writing)
    ) {
      throw new Error("Invalid archive structure");
    }

    archive = data;
    archiveLoaded = true;

    setupArtworks();
    renderWriting();

    $("#load-status").hidden = true;

    // Important for direct links like #writing/does-she-love-me-back.
    routeFromHash(false);
  } catch (error) {
    archiveLoaded = false;

    $("#load-message").textContent =
      "The archive could not be loaded. Please try again in a moment.";

    $("#retry").hidden = false;

    console.error(
      "Could not load content.json:",
      error
    );
  }
}

$("#retry").addEventListener("click", loadArchive);

routeFromHash(false);
loadArchive();
