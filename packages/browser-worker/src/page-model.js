// Structured page model extracted from destination HTML. This is the
// worker's observation format: every driver (HTTP today, Playwright on a
// desktop) produces the same shape, so classification and evidence logic
// stay driver-independent.

function decodeEntities(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function attributesOf(tag) {
  const attributes = {};
  const pattern = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(tag)) !== null) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2]);
  }
  // Boolean attributes such as `disabled`.
  for (const bool of ["disabled", "checked", "readonly", "hidden"]) {
    if (new RegExp(`\\b${bool}\\b(?!=)`, "i").test(tag)) attributes[bool] = true;
  }
  return attributes;
}

export function parsePage({ url, html }) {
  const title = decodeEntities(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim();

  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();

  const controls = [];
  const controlPattern = /<(input|select|textarea|button)\b[^>]*>/gi;
  let controlMatch;
  while ((controlMatch = controlPattern.exec(html)) !== null) {
    const attributes = attributesOf(controlMatch[0]);
    if (!attributes.name) continue;
    controls.push({
      element: controlMatch[1].toLowerCase(),
      name: attributes.name,
      type: attributes.type ?? null,
      value: attributes.value ?? null,
      disabled: attributes.disabled === true
    });
  }

  const forms = [];
  const formPattern = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let formMatch;
  while ((formMatch = formPattern.exec(html)) !== null) {
    const attributes = attributesOf(`<form${formMatch[1]}>`);
    const fields = {};
    const innerPattern = /<(input|select|textarea|button)\b[^>]*>/gi;
    let inner;
    while ((inner = innerPattern.exec(formMatch[2])) !== null) {
      const fieldAttributes = attributesOf(inner[0]);
      if (fieldAttributes.name && fieldAttributes.disabled !== true) {
        fields[fieldAttributes.name] = fieldAttributes.value ?? "";
      }
    }
    forms.push({ action: attributes.action ?? "", method: (attributes.method ?? "get").toLowerCase(), fields });
  }

  const links = [];
  const linkPattern = /<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>/gi;
  let linkMatch;
  while ((linkMatch = linkPattern.exec(html)) !== null) {
    links.push(decodeEntities(linkMatch[1]));
  }

  return { url, title, text, controls, forms, links };
}

export function controlByName(page, name) {
  return page.controls.find((control) => control.name === name) ?? null;
}

// Observed service rows: the synthetic portal (and a realistic destination
// adapter) exposes each committed row as a hidden input named rowN with a
// "date|code|units|amount" value.
export function observedRows(page) {
  return page.controls
    .filter((control) => /^row\d+$/.test(control.name))
    .sort((a, b) => Number(a.name.slice(3)) - Number(b.name.slice(3)))
    .map((control) => {
      const [serviceDate, code, units, amount] = (control.value ?? "").split("|");
      return { rowName: control.name, serviceDate, code, units: Number(units), amount };
    });
}
