import { importConfig, parseConfig, readSavedConfig, writeSavedConfig, type ImportMode } from "../core/config.js";
import { BUILTIN_ENGINES, getEngineCatalog, type QueryField, type SearchEngine, validateEngine } from "../core/model.js";

let config = readSavedConfig(window.localStorage);
let nextFieldNumber = 1;
let settingsRoot: HTMLElement | null = null;
let settingsStyles: Promise<void> | undefined;

function persistConfig(): void {
  writeSavedConfig(window.localStorage, config);
  document.documentElement.dataset.animations = config.preferences.animationsEnabled ? "on" : "off";
}

export async function renderSettingsPage(app: HTMLElement): Promise<void> {
  await loadSettingsStyles();
  settingsRoot = app;
  app.replaceChildren();
  const page = element("section", "settings");
  const header = element("header", "settings-header");
  const heading = element("div");
  heading.append(element("h1", "settings-title", "Settings"));
  header.append(heading, link("./", "Done", "button secondary"));
  page.append(header);

  const preferences = element("section", "panel");
  preferences.append(element("h2", "", "Preferences"), element("p", "panel-description", "Your choices stay in this browser."));
  const preferenceRow = element("div", "control-row");
  const engineLabel = element("label", "", "Default search engine");
  const defaultSelect = element("select") as HTMLSelectElement;
  getEngineCatalog(config).forEach((engine) => {
    const option = element("option", "", engine.name) as HTMLOptionElement;
    option.value = engine.id;
    option.selected = engine.id === config.preferences.defaultEngineId;
    defaultSelect.append(option);
  });
  defaultSelect.addEventListener("change", () => {
    config.preferences.defaultEngineId = defaultSelect.value;
    persistConfig();
  });
  engineLabel.append(defaultSelect);
  const animationLabel = element("label", "check-label", "Animations") as HTMLLabelElement;
  const animationToggle = element("input") as HTMLInputElement;
  animationToggle.type = "checkbox";
  animationToggle.checked = config.preferences.animationsEnabled;
  animationToggle.addEventListener("change", () => {
    config.preferences.animationsEnabled = animationToggle.checked;
    persistConfig();
  });
  animationLabel.append(animationToggle);
  preferenceRow.append(engineLabel, animationLabel);
  preferences.append(preferenceRow);
  page.append(preferences);

  const enginesPanel = element("section", "panel");
  const engineLayout = element("div", "engine-layout");
  const engineLeftColumn = element("div", "engine-layout-left");
  engineLeftColumn.append(element("h2", "", "Search engines"));
  const addButton = element("button", "button", "+ Add engine") as HTMLButtonElement;
  addButton.addEventListener("click", () => openEngineDialog());
  const builtinsToggle = element("button", "text-link builtins-toggle", `${BUILTIN_ENGINES.length} built-in engines`) as HTMLButtonElement;
  builtinsToggle.type = "button";
  builtinsToggle.setAttribute("aria-expanded", "false");
  builtinsToggle.setAttribute("aria-controls", "builtin-engine-list");
  const builtinsRegion = element("div", "builtin-list-region");
  builtinsRegion.id = "builtin-engine-list";
  builtinsRegion.setAttribute("aria-hidden", "true");
  builtinsRegion.inert = true;
  const builtinsInner = element("div", "builtin-list-inner");
  const builtinsList = element("div", "engine-list");
  BUILTIN_ENGINES.forEach((engine) => builtinsList.append(engineCard(engine)));
  builtinsInner.append(builtinsList);
  builtinsRegion.append(builtinsInner);
  builtinsToggle.addEventListener("click", () => {
    const isOpen = builtinsToggle.getAttribute("aria-expanded") !== "true";
    builtinsToggle.setAttribute("aria-expanded", String(isOpen));
    builtinsToggle.setAttribute("aria-label", `${isOpen ? "Hide" : "Show"} ${BUILTIN_ENGINES.length} built-in engines`);
    builtinsRegion.setAttribute("aria-hidden", String(!isOpen));
    builtinsRegion.inert = !isOpen;
    builtinsRegion.classList.toggle("is-open", isOpen);
  });
  engineLeftColumn.append(builtinsToggle);
  const engineActionColumn = element("div", "engine-layout-action");
  engineActionColumn.append(addButton);
  engineLayout.append(engineLeftColumn, engineActionColumn);
  enginesPanel.append(engineLayout, builtinsRegion);
  const engineList = element("div", "engine-list custom-engine-list");
  config.customEngines.forEach((engine) => engineList.append(engineCard(engine)));
  enginesPanel.append(engineList);
  page.append(enginesPanel);

  const dataPanel = element("section", "panel");
  dataPanel.append(element("h2", "", "Backup and restore"), element("p", "panel-description", "Export your engines and preferences, or import a saved configuration."));
  const dataActions = element("div", "control-row");
  const exportButton = element("button", "button secondary", "Export configuration") as HTMLButtonElement;
  exportButton.addEventListener("click", exportConfiguration);
  const importButton = element("button", "button secondary", "Import configuration") as HTMLButtonElement;
  importButton.addEventListener("click", () => openImportDialog());
  dataActions.append(exportButton, importButton);
  dataPanel.append(dataActions);
  page.append(dataPanel);
  app.append(page);
}

function loadSettingsStyles(): Promise<void> {
  if (document.querySelector('link[data-settings-styles="true"]')) return Promise.resolve();
  if (!settingsStyles) {
    settingsStyles = new Promise((resolveStyles) => {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "./settings.css";
      stylesheet.dataset.settingsStyles = "true";
      stylesheet.addEventListener("load", () => resolveStyles(), { once: true });
      stylesheet.addEventListener("error", () => resolveStyles(), { once: true });
      document.head.append(stylesheet);
    });
  }
  return settingsStyles;
}

function renderSettings(): void {
  if (settingsRoot) renderSettingsPage(settingsRoot);
}

function engineCard(engine: SearchEngine): HTMLElement {
  const card = element("article", "engine-card");
  const heading = element("div", "engine-heading");
  const info = element("div");
  const aliasLine = element("div", "engine-aliases");
  engine.aliases.forEach((alias, index) => {
    if (index) aliasLine.append(document.createTextNode(" · "));
    aliasLine.append(element("span", "bang-token", `!${alias}`));
  });
  info.append(element("h3", "engine-name", engine.name), aliasLine);
  const marker = element("span", engine.source === "builtin" ? "badge badge-builtin" : "badge", engine.source === "builtin" ? "Built in" : "Custom");
  heading.append(info, marker);
  card.append(heading, renderTemplate(engine.urlTemplate + engine.queryFields.map((field) => field.urlFragment).join("")));
  if (engine.queryFields.length) card.append(element("p", "engine-template", `${engine.queryFields.length} extra query field(s) · delimiter “${engine.delimiter}”`));
  if (engine.source === "custom") {
    const actions = element("div", "row-actions");
    const remove = element("button", "button ghost", "Delete") as HTMLButtonElement;
    remove.addEventListener("click", () => {
      if (!window.confirm(`Delete ${engine.name}?`)) return;
      config.customEngines = config.customEngines.filter((item) => item.id !== engine.id);
      if (config.preferences.defaultEngineId === engine.id) config.preferences.defaultEngineId = "builtin-g";
      persistConfig();
      renderSettings();
    });
    actions.append(remove);
    card.append(actions);
  }
  return card;
}

function openEngineDialog(): void {
  const backdrop = element("div", "dialog-backdrop");
  const dialog = element("section", "dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "engine-dialog-title");
  dialog.append(element("h2", "", "New engine"));
  dialog.querySelector("h2")?.setAttribute("id", "engine-dialog-title");
  const form = element("form", "form-grid") as HTMLFormElement;
  const name = makeTextField("Name", "GitHub Issues");
  const aliases = makeTextField("Aliases", "gh-issues");
  const urlTemplate = makeTextField("URL template", "https://example.com/search?q={query}");
  const delimiterGroup = element("div", "form-grid");
  const delimiterLabel = element("label") as HTMLLabelElement;
  delimiterLabel.append(document.createTextNode("Delimiter"));
  const delimiterSelect = element("select", "field-input") as HTMLSelectElement;
  [[" ", "Space"], ["|", "Pipe (|)"], [",", "Comma (,)"], ["custom", "Custom…"]].forEach(([value, label]) => {
    const option = element("option", "", label) as HTMLOptionElement;
    option.value = value;
    delimiterSelect.append(option);
  });
  delimiterLabel.append(delimiterSelect);
  const customDelimiter = makeTextField("Custom delimiter", "e.g. ::");
  customDelimiter.label.hidden = true;
  delimiterSelect.addEventListener("change", () => {
    customDelimiter.label.hidden = delimiterSelect.value !== "custom";
    updatePreview();
  });
  delimiterGroup.append(delimiterLabel, customDelimiter.label);
  const fields = element("div", "field-list");
  const fieldHeader = element("div", "section-header");
  fieldHeader.append(element("h3", "", "Filters"));
  const addField = element("button", "button secondary", "Add field") as HTMLButtonElement;
  addField.type = "button";
  addField.addEventListener("click", () => addFieldEditor(fields));
  fieldHeader.append(addField);
  const fieldSection = element("div");
  fieldSection.append(fieldHeader, fields);
  const previewTitle = element("div", "preview-label", "Preview");
  const preview = element("code", "preview", "https://example.com/search?q=rust");
  const error = element("p", "form-error");
  error.hidden = true;
  const actions = element("div", "form-actions");
  const cancel = element("button", "button secondary", "Cancel") as HTMLButtonElement;
  cancel.type = "button";
  cancel.addEventListener("click", () => backdrop.remove());
  const save = element("button", "button", "Save engine") as HTMLButtonElement;
  save.type = "submit";
  actions.append(cancel, save);
  form.append(name.label, aliases.label, urlTemplate.label, delimiterGroup, fieldSection, previewTitle, preview, error, actions);
  backdrop.append(dialog);
  dialog.append(form);
  document.body.append(backdrop);
  name.input.focus();

  const updatePreview = (): SearchEngine | null => {
    const delimiterValue = delimiterSelect.value === "custom" ? customDelimiter.input.value : delimiterSelect.value;
    const engine = collectDraftEngine(name.input.value, aliases.input.value, urlTemplate.input.value, delimiterValue, fields);
    if (!engine) return null;
    let sample = engine.urlTemplate.replaceAll("{query}", "rust");
    engine.queryFields.forEach((field) => { sample += field.urlFragment.replaceAll("{value}", "example"); });
    preview.textContent = sample;
    return engine;
  };
  form.addEventListener("input", updatePreview);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const engine = updatePreview();
    if (!engine) return;
    const errors = validateEngine(engine, getEngineCatalog(config));
    if (errors.length) {
      error.textContent = errors.join(" ");
      error.hidden = false;
      return;
    }
    config.customEngines.push(engine);
    persistConfig();
    backdrop.remove();
    renderSettings();
  });
}

function addFieldEditor(container: HTMLElement): void {
  const number = nextFieldNumber++;
  const row = element("div", "field-editor");
  row.dataset.fieldKey = `sub-query-${number}`;
  const label = makeTextField("Field label", `Filter ${number}`);
  const key = makeTextField("Key", `sub-query-${number}`);
  const fragment = makeTextField("URL fragment", `&filter={value}`);
  fragment.label.classList.add("wide");
  const requiredLabel = element("label", "check-label", "Required");
  const required = document.createElement("input");
  required.type = "checkbox";
  required.dataset.role = "required";
  requiredLabel.prepend(required);
  const remove = element("button", "button ghost", "Remove") as HTMLButtonElement;
  remove.type = "button";
  remove.addEventListener("click", () => row.remove());
  const actions = element("div", "row-actions");
  label.input.dataset.role = "label";
  key.input.dataset.role = "key";
  fragment.input.dataset.role = "fragment";
  actions.append(requiredLabel, remove);
  row.append(label.label, key.label, actions, fragment.label);
  container.append(row);
}

function collectDraftEngine(name: string, aliasInput: string, urlTemplate: string, delimiter: string, fieldsContainer: HTMLElement): SearchEngine | null {
  const queryFields: QueryField[] = [...fieldsContainer.querySelectorAll<HTMLElement>(".field-editor")].map((row) => {
    return {
      label: row.querySelector<HTMLInputElement>('[data-role="label"]')?.value.trim() ?? "",
      key: row.querySelector<HTMLInputElement>('[data-role="key"]')?.value.trim() ?? "",
      required: row.querySelector<HTMLInputElement>('[data-role="required"]')?.checked ?? false,
      urlFragment: row.querySelector<HTMLInputElement>('[data-role="fragment"]')?.value ?? "",
    };
  });
  const id = `custom-${crypto.randomUUID()}`;
  return {
    id,
    name: name.trim(),
    aliases: aliasInput.split(",").map((alias) => alias.trim()).filter(Boolean),
    urlTemplate: urlTemplate.trim(),
    delimiter,
    queryFields,
    source: "custom",
  };
}

function openImportDialog(): void {
  const backdrop = element("div", "dialog-backdrop");
  const dialog = element("section", "dialog");
  const title = element("h2", "", "Import configuration");
  const description = element("p", "", "Choose a Poros JSON file. The whole file is validated before settings change.");
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "application/json,.json";
  file.className = "input";
  const mode = document.createElement("select");
  mode.className = "input";
  [["merge", "Merge engines · keep current preferences"], ["replace", "Replace config · import preferences"]].forEach(([value, label]) => {
    const option = element("option", "", label) as HTMLOptionElement;
    option.value = value;
    mode.append(option);
  });
  const error = element("p", "form-error");
  error.hidden = true;
  const actions = element("div", "form-actions");
  const cancel = element("button", "button secondary", "Cancel") as HTMLButtonElement;
  cancel.addEventListener("click", () => backdrop.remove());
  const apply = element("button", "button", "Import") as HTMLButtonElement;
  apply.addEventListener("click", async () => {
    if (!file.files?.[0]) {
      error.textContent = "Choose a configuration file first.";
      error.hidden = false;
      return;
    }
    try {
      const incoming = parseConfig(JSON.parse(await file.files[0].text()) as unknown);
      const next = importConfig(config, incoming, mode.value as ImportMode);
      writeSavedConfig(window.localStorage, next);
      config = next;
      backdrop.remove();
      renderSettings();
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : "Could not import this configuration.";
      error.hidden = false;
    }
  });
  actions.append(cancel, apply);
  dialog.append(title, description, file, mode, error, actions);
  backdrop.append(dialog);
  document.body.append(backdrop);
}

function exportConfiguration(): void {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const download = document.createElement("a");
  download.href = url;
  download.download = "poros-config.json";
  download.click();
  URL.revokeObjectURL(url);
}

function renderTemplate(template: string): HTMLParagraphElement {
  const line = element("p", "engine-template");
  const placeholderPattern = /(\{query\}|\{value\})/g;
  let previousIndex = 0;
  for (const match of template.matchAll(placeholderPattern)) {
    const matchIndex = match.index ?? 0;
    line.append(document.createTextNode(template.slice(previousIndex, matchIndex)));
    const placeholder = match[0];
    if (placeholder === "{query}") {
      const queryPlaceholder = element("span", "query-token");
      queryPlaceholder.append(document.createTextNode("{"), element("span", "query-word", "query"), document.createTextNode("}"));
      line.append(queryPlaceholder);
    } else {
      line.append(element("span", "value-token", placeholder));
    }
    previousIndex = matchIndex + placeholder.length;
  }
  line.append(document.createTextNode(template.slice(previousIndex)));
  return line;
}



function makeTextField(labelText: string, placeholder: string): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = element("label") as HTMLLabelElement;
  if (labelText) label.append(document.createTextNode(labelText));
  const input = document.createElement("input");
  input.className = "field-input";
  input.placeholder = placeholder;
  input.type = "text";
  input.autocomplete = "off";
  label.append(input);
  return { label, input };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function link(href: string, label: string, className = "text-link"): HTMLAnchorElement {
  const node = element("a", className, label);
  node.href = href;
  return node;
}
