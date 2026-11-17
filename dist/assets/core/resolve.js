import { getEngineCatalog, normalizeAlias } from "./model.js";
function findBang(input, catalog) {
    const words = input.split(/\s+/);
    for (let index = 0; index < words.length; index += 1) {
        const word = words[index];
        if (!word.startsWith("!") || word.length === 1)
            continue;
        const alias = normalizeAlias(word.slice(1));
        const engine = catalog.find((item) => item.aliases.some((itemAlias) => normalizeAlias(itemAlias) === alias));
        if (engine) {
            words.splice(index, 1);
            return { engine, query: words.join(" ") };
        }
    }
    return { engine: null, query: input };
}
function tokenizeFields(input, delimiter, maxSplits) {
    const fields = [];
    let field = "";
    let quoted = false;
    let justClosedQuote = false;
    let index = 0;
    while (index < input.length) {
        const char = input[index];
        if (quoted && char === "\\") {
            const next = input[index + 1];
            if (next === "\\" || next === '"') {
                field += next;
                index += 2;
                continue;
            }
            field += char;
            index += 1;
            continue;
        }
        if (char === '"') {
            quoted = !quoted;
            justClosedQuote = !quoted;
            index += 1;
            continue;
        }
        const delimiterMatches = !quoted && fields.length < maxSplits && input.startsWith(delimiter, index);
        if (delimiterMatches) {
            fields.push(field.trim());
            field = "";
            justClosedQuote = false;
            index += delimiter.length;
            if (/^\s+$/.test(delimiter))
                while (index < input.length && /\s/.test(input[index]))
                    index += 1;
            continue;
        }
        if (justClosedQuote && !quoted && !input.startsWith(delimiter, index) && !/\s/.test(char))
            return null;
        if (justClosedQuote && !quoted && /\s/.test(char)) {
            while (index < input.length && /\s/.test(input[index]))
                index += 1;
            if (index < input.length && fields.length < maxSplits && input.startsWith(delimiter, index))
                continue;
            if (index < input.length)
                return null;
            break;
        }
        field += char;
        if (!/\s/.test(char))
            justClosedQuote = false;
        index += 1;
    }
    if (quoted)
        return null;
    fields.push(field.trim());
    return fields;
}
function encodeTemplateValue(value) {
    return encodeURIComponent(value);
}
function isSkipValue(value) {
    return value.trim() === "" || value.trim().toLocaleLowerCase("en-US") === "xxx";
}
export function resolveSearch(input, config) {
    const catalog = getEngineCatalog(config);
    const bang = findBang(input.trim(), catalog);
    const engine = bang.engine ?? catalog.find((item) => item.id === config.preferences.defaultEngineId) ?? catalog[0];
    const rawFields = tokenizeFields(bang.query.trim(), engine.delimiter, engine.queryFields.length);
    if (!rawFields)
        return { ok: false, error: { kind: "invalid-quoting" } };
    const [query = "", ...additionalValues] = rawFields;
    const values = [query, ...additionalValues.map((value) => isSkipValue(value) ? "" : value)];
    for (let index = 0; index < engine.queryFields.length; index += 1) {
        const field = engine.queryFields[index];
        if (field.required && !values[index + 1]?.trim()) {
            return { ok: false, error: { kind: "missing-required-field", fieldLabel: field.label } };
        }
    }
    let destination = engine.urlTemplate.replaceAll("{query}", encodeTemplateValue(query));
    engine.queryFields.forEach((field, index) => {
        const value = values[index + 1] ?? "";
        if (value !== "")
            destination += field.urlFragment.replaceAll("{value}", encodeTemplateValue(value));
    });
    try {
        const parsedUrl = new URL(destination);
        if (parsedUrl.protocol !== "https:")
            throw new Error("Unsupported destination protocol.");
        return { ok: true, engine, url: parsedUrl.href };
    }
    catch {
        return { ok: false, error: { kind: "invalid-destination-url" } };
    }
}
