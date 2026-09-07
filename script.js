"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const categories = ["paintings", "drawings"];
let archive = { artworks: { paintings: [], drawings: [] }, writing: [] };
let writingFilter = "all";
let lastWritingButton = null;
let viewerWorks = [];
let viewerIndex = 0;
let viewerTrigger = null;
const viewer = $("#viewer");

// Brief entry-only signature. Replace .signature in index.html with your
// exported animation. Use a still frame for visitors who prefer less motion.
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  $("#loader").hidden = false;
  window.setTimeout(() => { $("#loader").hidden = true; }, 600);
}

// Content is inserted as text, so quotes, ampersands, and poem line breaks
// are preserved without treating your writing as executable HTML.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function artworkMeta(work) {
  return [work.medium, work.year, work.dimensions].filter(Boolean).join(" · ");
}

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

  // Keep a visible placeholder until the actual image loads successfully.
  img.addEventListener("load", () => {
    placeholder.remove();
  }, { once: true });

  img.addEventListener("error", () => { img.remove(); }, { once: true });

  // Relative paths work on both username.github.io and project Pages sites.
  img.src = work.image;
  container.append(img);
}

function selectedArtworks(category) {
  const section = document.getElementById(category);
  const medium = $(".medium", section).value;
  const sort = $(".sort", section).value;
  const works = archive.artworks[category].filter(
    work => medium === "all" || work.medium === medium
  );

  return works.sort((a, b) => {
    if (sort === "az") return a.title.localeCompare(b.title);
    const difference = (Number(a.year) || 0) - (Number(b.year) || 0);
    return (sort === "oldest" ? difference : -difference)
      || a.title.localeCompare(b.title);
  });
}

function renderArtworks(category) {
  const section = document.getElementById(category);
  const list = $(".art-list", section);
  const works = selectedArtworks(category);
  list.replaceChildren();

  $(".count", section).textContent =
    `${works.length} ${works.length === 1 ? "work" : "works"}`;

  if (!works.length) {
    list.append(element("p", "empty-state", "No works to show here yet."));
  }

  works.forEach((work, index) => {
    const article = element("article", "artwork");
    const imageButton = element("button", "art-image");
    imageButton.type = "button";
    imageButton.setAttribute("aria-label", `View ${work.title}`);
    addImage(imageButton, work);
    imageButton.append(element("span", "view-hint", "view ↗"));

    const info = element("div", "art-info");
    info.append(
      element("p", "art-number", String(index + 1).padStart(2, "0"))
    );

    const heading = element("h3");
    const titleButton = element("button", "art-title", work.title);
    titleButton.type = "button";
    titleButton.setAttribute("aria-label", `View ${work.title}`);
    heading.append(titleButton);
    info.append(heading);

    const meta = artworkMeta(work);
    if (meta) info.append(element("p", "metadata", meta));

    if (work.description) {
      info.append(element("p", "art-description", work.description));
    }

    for (const button of [imageButton, titleButton]) {
      button.addEventListener("click", () => openViewer(works, index, button));
    }

    article.append(imageButton, info);
    list.append(article);
  });
}

function setupArtworks() {
  categories.forEach(category => {
    const section = document.getElementById(category);
    const filter = $(".medium", section);
    filter.replaceChildren(new Option("all mediums", "all"));

    const mediums = [
      ...new Set(
        archive.artworks[category].map(work => work.medium).filter(Boolean)
      )
    ];

    mediums.sort((a, b) => a.localeCompare(b)).forEach(
      medium => filter.add(new Option(medium, medium))
    );

    renderArtworks(category);
  });
}

function openViewer(works, index, trigger) {
  viewerWorks = works;
  viewerIndex = index;
  viewerTrigger = trigger;
  renderViewer();
  viewer.showModal();
  document.body.classList.add("modal-open");
  $("#viewer-close").focus();
}

function renderViewer() {
  const work = viewerWorks[viewerIndex];
  $("#viewer-image").replaceChildren();
  addImage($("#viewer-image"), work, true);
  $("#viewer-title").textContent = work.title;
  $("#viewer-meta").textContent = artworkMeta(work);
  $("#viewer-meta").hidden = !artworkMeta(work);

  const description = $("#viewer-description");
  description.textContent = work.description || "";
  description.hidden = !description.textContent.trim();
  description.scrollTop = 0;

  $("#viewer-position").textContent =
    `${viewerIndex + 1} / ${viewerWorks.length}`;

  $("#viewer-prev").disabled = viewerWorks.length < 2;
  $("#viewer-next").disabled = viewerWorks.length < 2;
}

function moveViewer(direction) {
  if (!viewerWorks.length) return;
  viewerIndex =
    (viewerIndex + direction + viewerWorks.length) % viewerWorks.length;
  renderViewer();
}

$("#viewer-close").addEventListener("click", () => viewer.close());
$("#viewer-prev").addEventListener("click", () => moveViewer(-1));
$("#viewer-next").addEventListener("click", () => moveViewer(1));

viewer.addEventListener("close", () => {
  document.body.classList.remove("modal-open");
  if (viewerTrigger?.isConnected) viewerTrigger.focus();
});

// Escape is handled by the native dialog. Close only for a true backdrop click.
viewer.addEventListener("click", event => {
  const rect = viewer.getBoundingClientRect();

  if (
    event.target === viewer
    && (
      event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom
    )
  ) {
    viewer.close();
  }
});

viewer.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    moveViewer(event.key === "ArrowLeft" ? -1 : 1);
  }
});

function writingDate(entry) {
  if (!entry.date) return entry.year ? String(entry.year) : "";

  // Read calendar dates at noon locally to avoid timezone day shifts.
  const date = new Date(`${entry.date}T12:00:00`);

  return Number.isNaN(date.getTime())
    ? String(entry.date)
    : date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
      });
}

function writingMeta(entry) {
  return [
    entry.type === "poem" ? "poetry" : entry.type,
    writingDate(entry)
  ].filter(Boolean).join(" · ");
}

function renderWriting() {
  const list = $("#writing-list");
  list.replaceChildren();

  const entries = archive.writing
    .filter(entry => writingFilter === "all" || entry.type === writingFilter)
    .sort((a, b) =>
      String(b.date || b.year || "").localeCompare(
        String(a.date || a.year || "")
      )
    );

  if (!entries.length) {
    list.append(element("p", "empty-state", "No writing published here yet."));
  }

  entries.forEach(entry => {
    const article = element("article", "writing-entry");
    const date = element("p", "metadata", writingDate(entry));
    const body = element("div");
    const heading = element("h3");
    const button = element("button", "writing-link", entry.title);
    button.type = "button";
    button.addEventListener("click", () => openWriting(entry, button));
    heading.append(button);
    body.append(heading);

    if (entry.type) {
      body.append(
        element("p", "metadata", entry.type === "poem" ? "poetry" : entry.type)
      );
    }

    if (entry.excerpt) {
      body.append(element("p", "writing-excerpt", entry.excerpt));
    }

    article.append(date, body);
    list.append(article);
  });
}

function openWriting(entry, trigger) {
  lastWritingButton = trigger;
  $("#writing-index").hidden = true;
  $("#reading-view").hidden = false;
  $("#reading-title").textContent = entry.title;
  $("#reading-meta").textContent = writingMeta(entry);
  $("#reading-meta").hidden = !writingMeta(entry);

  const content = $("#reading-content");
  content.replaceChildren();
  content.classList.toggle("poem", entry.type === "poem");

  // content may be a string (blank lines separate paragraphs/stanzas)
  // or an array of strings (one paragraph/stanza per item).
  const paragraphs = Array.isArray(entry.content)
    ? entry.content
    : String(entry.content || "").split(/\r?\n\s*\r?\n/);

  paragraphs
    .filter(text => String(text).trim())
    .forEach(text => content.append(element("p", "", text)));

  $("#reading-title").focus();
}

$("#back-to-writing").addEventListener("click", () => {
  $("#reading-view").hidden = true;
  $("#writing-index").hidden = false;
  if (lastWritingButton?.isConnected) lastWritingButton.focus();
  else $("#writing-title").focus();
});

function showSection(name, focus = false) {
  if (![...categories, "writing", "about"].includes(name)) name = "paintings";

  $$(".page").forEach(section => {
    section.hidden = section.id !== name;
  });

  $("#intro").hidden = name !== "paintings";

  $$("nav a").forEach(link => {
    if (link.hash === `#${name}`) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (name === "writing") {
    $("#writing-index").hidden = false;
    $("#reading-view").hidden = true;
  }

  document.title = `abiola oyefule — ${name}`;

  if (focus) {
    document.getElementById(`${name}-title`).focus({ preventScroll: true });
  }
}

$$(".site-header a").forEach(link => link.addEventListener("click", event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const name = link.hash.slice(1);
  history.replaceState(null, "", `#${name}`);
  showSection(name, true);
  window.scrollTo({ top: 0, behavior: "instant" });
}));

window.addEventListener("hashchange", () =>
  showSection(location.hash.slice(1), true)
);

categories.forEach(category => {
  $$("select", document.getElementById(category)).forEach(select =>
    select.addEventListener("change", () => renderArtworks(category))
  );
});

$$(".writing-filters button").forEach(button =>
  button.addEventListener("click", () => {
    writingFilter = button.dataset.type;

    $$(".writing-filters button").forEach(item =>
      item.setAttribute("aria-pressed", String(item === button))
    );

    renderWriting();
  })
);

async function loadArchive() {
  $("#load-status").hidden = false;
  $("#load-message").textContent = "Loading the archive…";
  $("#retry").hidden = true;

  try {
    const response = await fetch("./content.json");
    if (!response.ok) {
      throw new Error(`Content request failed: ${response.status}`);
    }

    const data = await response.json();

    if (
      !categories.every(category => Array.isArray(data.artworks?.[category]))
      || !Array.isArray(data.writing)
    ) {
      throw new Error("Invalid archive structure");
    }

    archive = data;
    setupArtworks();
    renderWriting();
    $("#load-status").hidden = true;
  } catch (error) {
    $("#load-message").textContent =
      "The archive could not be loaded. Please try again in a moment.";
    $("#retry").hidden = false;
    console.error("Could not load content.json:", error);
  }
}

$("#retry").addEventListener("click", loadArchive);
showSection(location.hash.slice(1));
loadArchive();
