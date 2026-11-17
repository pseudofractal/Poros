export const CONFIG_VERSION = 3;
export const CONFIG_STORAGE_KEY = "poros_config";
export const LEGACY_STORAGE_KEY = "poros_bangs";
const builtinRows = [
    ["Google", ["g"], "https://www.google.com/search?q={query}"],
    ["YouTube", ["yt", "youtube"], "https://www.youtube.com/results?search_query={query}"],
    ["Wikipedia", ["w", "wiki"], "https://en.wikipedia.org/wiki/Special:Search?search={query}"],
    ["DuckDuckGo", ["ddg"], "https://duckduckgo.com/?q={query}"],
    ["Google Translate", ["gt", "translate"], "https://translate.google.com/?sl=auto&tl=en&text={query}"],
    ["ChatGPT", ["gpt"], "https://chatgpt.com/?temporary-chat=true&q={query}"],
    ["Google Scholar", ["gs", "scholar"], "https://scholar.google.com/scholar?q={query}"],
    ["arXiv", ["arxiv"], "https://arxiv.org/search/?query={query}&searchtype=all"],
    ["Semantic Scholar", ["ss", "semantic"], "https://www.semanticscholar.org/search?q={query}"],
    ["ResearchGate", ["rg"], "https://www.researchgate.net/search?q={query}"],
    ["GitHub", ["gh", "github"], "https://github.com/search?q={query}"],
    ["Stack Overflow", ["so", "stack"], "https://stackoverflow.com/search?q={query}"],
    ["MDN Web Docs", ["mdn"], "https://developer.mozilla.org/search?q={query}"],
    ["WolframAlpha", ["wa", "wolfram"], "https://www.wolframalpha.com/input/?i={query}"],
    ["Internet Archive (Wayback)", ["wb", "wayback"], "https://web.archive.org/web/*/{query}"],
    ["DeepL Translate", ["deepl", "dl"], "https://www.deepl.com/translator#auto/en/{query}"],
    ["Reddit", ["r", "reddit"], "https://www.reddit.com/search/?q={query}"],
    ["Amazon", ["a", "amz"], "https://www.amazon.com/s?k={query}"],
    ["Google Maps", ["gm", "maps"], "https://www.google.com/maps/search/{query}"],
    ["ArchWiki", ["aw", "arch"], "https://wiki.archlinux.org/index.php?search={query}"],
    ["Arch User Repository (AUR)", ["aur"], "https://aur.archlinux.org/packages?K={query}"],
    ["NixOS Wiki", ["nw", "nixwiki"], "https://wiki.nixos.org/w/index.php?search={query}"],
    ["Nix Packages", ["np", "nixpkg"], "https://search.nixos.org/packages?channel=unstable&query={query}"],
    ["Nix Options", ["no", "nixopt"], "https://search.nixos.org/options?channel=unstable&query={query}"],
    ["Gentoo Wiki", ["gw", "gentoo"], "https://wiki.gentoo.org/index.php?search={query}"],
    ["Linux Man Pages", ["man"], "https://man.archlinux.org/search?q={query}"],
    ["ProtonDB", ["pdb", "proton"], "https://www.protondb.com/search?q={query}"],
    ["Repology", ["repo", "repology"], "https://repology.org/projects/?search={query}"],
];
export const BUILTIN_ENGINES = builtinRows.map(([name, aliases, urlTemplate]) => ({
    id: `builtin-${aliases[0]}`,
    name,
    aliases: [...aliases],
    urlTemplate,
    delimiter: " ",
    queryFields: [],
    source: "builtin",
}));
export const DEFAULT_PREFERENCES = {
    defaultEngineId: "builtin-g",
    animationsEnabled: true,
};
export function createDefaultConfig() {
    return {
        version: CONFIG_VERSION,
        customEngines: [],
        preferences: { ...DEFAULT_PREFERENCES },
    };
}
export function normalizeAlias(alias) {
    return alias.trim().toLocaleLowerCase("en-US");
}
export function getEngineCatalog(config) {
    return [...BUILTIN_ENGINES, ...config.customEngines];
}
export function validateEngine(engine, existing = []) {
    const errors = [];
    if (!engine.name.trim())
        errors.push("Enter an engine name.");
    if (!engine.id.trim())
        errors.push("Engine ID is missing.");
    if (!engine.aliases.length || engine.aliases.some((alias) => !alias.trim())) {
        errors.push("Add at least one non-empty alias.");
    }
    if (engine.aliases.some((alias) => /\s|!/.test(alias.trim()))) {
        errors.push("Aliases cannot contain spaces or the ! prefix.");
    }
    const localAliases = new Set();
    for (const alias of engine.aliases) {
        const normalized = normalizeAlias(alias);
        if (localAliases.has(normalized))
            errors.push(`Alias “${alias}” is duplicated.`);
        localAliases.add(normalized);
        if (existing.some((item) => item.id !== engine.id && item.aliases.some((itemAlias) => normalizeAlias(itemAlias) === normalized))) {
            errors.push(`Alias “${alias}” is already in use.`);
        }
    }
    if (!engine.delimiter)
        errors.push("Choose a delimiter.");
    if (!engine.urlTemplate.includes("{query}"))
        errors.push("The URL template must contain {query}.");
    if (/\{(?!query\})[^{}]+\}/.test(engine.urlTemplate))
        errors.push("The URL template contains an unknown placeholder.");
    for (const field of engine.queryFields) {
        if (!/^[a-z][a-z0-9-]*$/.test(field.key))
            errors.push(`Field key “${field.key}” is invalid.`);
        if (!field.label.trim())
            errors.push(`Give “${field.key}” a label.`);
        if (!field.urlFragment.includes("{value}"))
            errors.push(`The URL fragment for “${field.label}” must contain {value}.`);
        if (/\{(?!value\})[^{}]+\}/.test(field.urlFragment))
            errors.push(`The URL fragment for “${field.label}” contains an unknown placeholder.`);
    }
    const fieldKeys = engine.queryFields.map((field) => field.key);
    if (new Set(fieldKeys).size !== fieldKeys.length)
        errors.push("Query field keys must be unique.");
    try {
        const sampleUrl = engine.queryFields.reduce((url, field) => url + field.urlFragment.replaceAll("{value}", "sample"), engine.urlTemplate.replaceAll("{query}", "sample"));
        if (new URL(sampleUrl).protocol !== "https:")
            errors.push("Search URLs must use https.");
    }
    catch {
        errors.push("The URL template does not produce a valid URL.");
    }
    return [...new Set(errors)];
}
