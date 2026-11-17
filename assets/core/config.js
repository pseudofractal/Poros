import { BUILTIN_ENGINES, CONFIG_VERSION, DEFAULT_PREFERENCES, LEGACY_STORAGE_KEY, validateEngine, } from "./model.js";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isQueryFieldRecord(value) {
    return isRecord(value) && typeof value.key === "string" && typeof value.label === "string" &&
        typeof value.required === "boolean" && typeof value.urlFragment === "string";
}
function readEngine(value) {
    if (!isRecord(value))
        return null;
    const { id, name, aliases, urlTemplate, delimiter, queryFields, source } = value;
    if (typeof id !== "string" || typeof name !== "string" ||
        !Array.isArray(aliases) || !aliases.every((alias) => typeof alias === "string") ||
        typeof urlTemplate !== "string" || typeof delimiter !== "string" ||
        !Array.isArray(queryFields) || (source !== "builtin" && source !== "custom"))
        return null;
    const mappedFields = queryFields.map((field) => {
        if (!isQueryFieldRecord(field))
            return null;
        return {
            key: field.key,
            label: field.label,
            required: field.required,
            urlFragment: field.urlFragment,
        };
    });
    if (mappedFields.some((field) => field === null))
        return null;
    return {
        id,
        name,
        aliases: [...aliases],
        urlTemplate,
        delimiter,
        queryFields: mappedFields,
        source,
    };
}
function migrateLegacyBangs(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((row, index) => {
        if (!isRecord(row) || typeof row.name !== "string" || typeof row.url !== "string" || !Array.isArray(row.id))
            return [];
        const aliases = row.id.filter((item) => typeof item === "string");
        if (!aliases.length || !row.url.includes("{{{s}}}"))
            return [];
        const builtInAliases = new Set(BUILTIN_ENGINES.flatMap((engine) => engine.aliases.map((alias) => alias.toLocaleLowerCase("en-US"))));
        if (aliases.some((alias) => builtInAliases.has(alias.trim().toLocaleLowerCase("en-US"))))
            return [];
        return [{
                id: `custom-migrated-${index}-${aliases[0]}`,
                name: row.name,
                aliases,
                urlTemplate: row.url.replaceAll("{{{s}}}", "{query}"),
                delimiter: " ",
                queryFields: [],
                source: "custom",
            }];
    });
}
function readPreferences(value) {
    if (!isRecord(value))
        return { ...DEFAULT_PREFERENCES };
    return {
        defaultEngineId: typeof value.defaultEngineId === "string" ? value.defaultEngineId : DEFAULT_PREFERENCES.defaultEngineId,
        animationsEnabled: typeof value.animationsEnabled === "boolean" ? value.animationsEnabled : DEFAULT_PREFERENCES.animationsEnabled,
    };
}
export function parseConfig(value) {
    if (!isRecord(value))
        throw new Error("Configuration must be a JSON object.");
    const version = typeof value.version === "number" ? value.version : 0;
    if (version > CONFIG_VERSION)
        throw new Error("This configuration was created by a newer Poros version.");
    const customEngines = version === 0
        ? migrateLegacyBangs(value.customEngines ?? value.bangs)
        : Array.isArray(value.customEngines)
            ? value.customEngines.map(readEngine)
            : [];
    if (customEngines.some((engine) => engine === null))
        throw new Error("Configuration contains an invalid engine.");
    const config = {
        version: CONFIG_VERSION,
        customEngines: customEngines,
        preferences: readPreferences(value.preferences),
    };
    validateConfig(config);
    return config;
}
export function validateConfig(config) {
    const seenIds = new Set(BUILTIN_ENGINES.map((engine) => engine.id));
    const catalog = [...BUILTIN_ENGINES];
    for (const engine of config.customEngines) {
        if (engine.source !== "custom")
            throw new Error(`“${engine.name}” is not a custom engine.`);
        if (seenIds.has(engine.id))
            throw new Error(`Engine ID “${engine.id}” is already in use.`);
        const errors = validateEngine(engine, catalog);
        if (errors.length)
            throw new Error(`${engine.name}: ${errors.join(" ")}`);
        seenIds.add(engine.id);
        catalog.push(engine);
    }
    if (!catalog.some((engine) => engine.id === config.preferences.defaultEngineId)) {
        config.preferences.defaultEngineId = DEFAULT_PREFERENCES.defaultEngineId;
    }
}
export function importConfig(current, incoming, mode) {
    const nextConfig = mode === "replace"
        ? structuredClone(incoming)
        : {
            version: CONFIG_VERSION,
            customEngines: [...current.customEngines.filter((engine) => !incoming.customEngines.some((item) => item.id === engine.id)), ...incoming.customEngines],
            preferences: { ...current.preferences },
        };
    validateConfig(nextConfig);
    return nextConfig;
}
export function readSavedConfig(storage) {
    const current = storage.getItem("poros_config");
    if (current) {
        try {
            const migrated = parseConfig(JSON.parse(current));
            storage.setItem("poros_config", JSON.stringify(migrated));
            return migrated;
        }
        catch {
            return { version: CONFIG_VERSION, customEngines: [], preferences: { ...DEFAULT_PREFERENCES } };
        }
    }
    const legacy = storage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy)
        return { version: CONFIG_VERSION, customEngines: [], preferences: { ...DEFAULT_PREFERENCES } };
    try {
        const migrated = parseConfig({ version: 0, bangs: JSON.parse(legacy) });
        storage.setItem("poros_config", JSON.stringify(migrated));
        storage.removeItem(LEGACY_STORAGE_KEY);
        return migrated;
    }
    catch {
        return { version: CONFIG_VERSION, customEngines: [], preferences: { ...DEFAULT_PREFERENCES } };
    }
}
export function writeSavedConfig(storage, config) {
    validateConfig(config);
    storage.setItem("poros_config", JSON.stringify(config));
}
