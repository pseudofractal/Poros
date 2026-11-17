"use strict";
const app = document.querySelector("#app");
if (!app)
    throw new Error("Poros app root is missing.");
let searchDependencies;
applyAnimationPreference();
const searchParams = new URLSearchParams(window.location.search);
const searchTerm = searchParams.get("query");
if (searchParams.has("settings")) {
    void import("./ui/settings.js").then(({ renderSettingsPage }) => renderSettingsPage(app));
}
else if (searchTerm?.trim()) {
    void resolveAndRedirect(searchTerm);
}
else {
    renderHome();
}
if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    window.addEventListener("load", () => {
        void navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    });
}
else if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => void registration.unregister()));
}
function applyAnimationPreference() {
    const savedConfig = window.localStorage.getItem("poros_config");
    if (!savedConfig) {
        document.documentElement.dataset.animations = "on";
        return;
    }
    try {
        const preferences = JSON.parse(savedConfig).preferences;
        document.documentElement.dataset.animations = preferences?.animationsEnabled === false ? "off" : "on";
    }
    catch {
        document.documentElement.dataset.animations = "on";
    }
}
async function resolveAndRedirect(input) {
    const [{ readSavedConfig }, { resolveSearch }] = await loadSearchDependencies();
    const config = readSavedConfig(window.localStorage);
    const result = resolveSearch(input, config);
    if (!result.ok) {
        renderError(result.error.kind === "missing-required-field"
            ? `Add a value for “${result.error.fieldLabel}” to finish this search.`
            : result.error.kind === "invalid-quoting"
                ? "Check the quotation marks in your search and try again."
                : "This search engine has an invalid destination URL.", input);
        return;
    }
    if (!navigator.onLine) {
        renderError("Poros resolved your search, but you’re offline. You can edit it here and try again when you reconnect.", input);
        return;
    }
    window.location.replace(result.url);
}
function loadSearchDependencies() {
    if (!searchDependencies) {
        searchDependencies = Promise.all([
            import("./core/config.js"),
            import("./core/resolve.js"),
        ]).catch((error) => {
            searchDependencies = undefined;
            throw error;
        });
    }
    return searchDependencies;
}
function renderHome() {
    app.replaceChildren();
    const card = element("section", "home-card");
    card.append(image("./static/logo.svg", "", "brand-mark"));
    card.append(element("h1", "home-title", "Poros"));
    const form = element("form", "search-form");
    const input = element("input");
    input.type = "search";
    input.name = "query";
    input.placeholder = "search with a bang !wiki";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Search with Poros");
    input.autofocus = true;
    input.addEventListener("input", () => {
        if (input.value.trim())
            void loadSearchDependencies().catch(() => undefined);
    });
    form.append(input);
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (input.value.trim())
            resolveAndRedirect(input.value);
    });
    card.append(form);
    const footer = element("nav", "home-footer");
    footer.append(link("?settings", "Configure Bangs"));
    card.append(footer);
    app.append(card);
    input.focus();
}
function renderError(message, initialQuery) {
    app.replaceChildren();
    const card = element("section", "error-card");
    card.append(image("./static/logo.svg", "Poros mark", "error-art"));
    card.append(element("p", "eyebrow", "A little detour"), element("h1", "", "Search paused"), element("p", "lede", message));
    const form = element("form", "search-form");
    const input = element("input");
    input.type = "search";
    input.value = initialQuery;
    input.setAttribute("aria-label", "Edit your search");
    const submit = element("button", "button", "Try again");
    submit.type = "submit";
    form.append(input, submit);
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        resolveAndRedirect(input.value);
    });
    card.append(form);
    const back = link("./", "Back to Poros", "button");
    card.append(back);
    app.append(card);
}
function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text)
        node.textContent = text;
    return node;
}
function image(src, alt, className) {
    const node = document.createElement("img");
    node.src = src;
    node.alt = alt;
    node.className = className;
    return node;
}
function link(href, label, className = "text-link") {
    const node = element("a", className, label);
    node.href = href;
    return node;
}
