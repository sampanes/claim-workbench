// Minimal strict CSV reader (RFC 4180 subset): quoted fields, escaped
// quotes, embedded separators and newlines, CRLF or LF endings, optional
// UTF-8 byte-order mark. Structural problems throw CsvError; row-level
// interpretation belongs to the source adapter.

export class CsvError extends Error {
  constructor(message, line) {
    super(line ? `${message} (line ${line})` : message);
    this.name = "CsvError";
    this.line = line;
  }
}

export function parseCsv(text) {
  if (typeof text !== "string") throw new CsvError("CSV input must be a string");
  let input = text;
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);

  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  let line = 1;

  const pushField = () => { record.push(field); field = ""; };
  const pushRecord = () => { pushField(); records.push(record); record = []; };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field.length > 0) throw new CsvError("Unexpected quote inside an unquoted field", line);
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      if (field.endsWith("\r")) field = field.slice(0, -1);
      pushRecord();
      line += 1;
    } else {
      field += char;
    }
  }
  if (inQuotes) throw new CsvError("Unterminated quoted field", line);
  if (field.length > 0 || record.length > 0) {
    if (field.endsWith("\r")) field = field.slice(0, -1);
    pushRecord();
  }

  // Drop fully empty trailing records (a final newline is not a row).
  while (records.length > 0 && records.at(-1).length === 1 && records.at(-1)[0] === "") {
    records.pop();
  }

  if (records.length === 0) return { header: [], rows: [] };
  const [header, ...dataRecords] = records;
  const rows = dataRecords.map((cells, index) => ({
    // Row numbers are 1-based positions in the file including the header,
    // so they match what an operator sees in a spreadsheet.
    rowNumber: index + 2,
    cells
  }));
  return { header: header.map((name) => name.trim()), rows };
}
