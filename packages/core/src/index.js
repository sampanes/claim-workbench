export const helpTopics = [
  {
    id: "state.imported",
    title: "Packet imported",
    summary: "The packet has been created from synthetic source data and is ready for deterministic validation.",
    explanation: [
      "Review the packet identity, destination, and service-line total before opening a destination workflow.",
      "Validation findings decide whether the next action is available."
    ],
    allowedActions: ["validate_packet", "mark_manual"],
    neverSuggest: ["submit", "ignore_hard_stop"]
  },
  {
    id: "finding.missing_required_field",
    title: "Required information is missing",
    summary: "A workflow-required field is absent and must be resolved before reversible automation can continue.",
    explanation: [
      "Enter a reviewed value, apply a recipe-defined not-required condition, or send the packet to manual handling.",
      "Do not infer required billing values from unrelated context."
    ],
    allowedActions: ["resolve_missing_field", "mark_manual"],
    neverSuggest: ["invent_value", "submit"]
  },
  {
    id: "action.compare_totals",
    title: "Compare totals",
    summary: "Compare the packet total with destination evidence before approval.",
    explanation: [
      "Confirm the number of service rows and each decimal amount.",
      "A mismatch is a hard stop until corrected or handled manually."
    ],
    allowedActions: ["show_service_rows", "mark_manual"],
    neverSuggest: ["submit_on_mismatch"]
  }
];

export const syntheticPacket = {
  schemaVersion: "0.1",
  id: "packet_synthetic_001",
  clientDisplayName: "Taylor Example",
  destination: "Synthetic EAP Portal",
  workflowState: "Imported",
  serviceLines: [
    {
      id: "service_1",
      serviceDate: "2026-06-03",
      code: "SYN-90834",
      description: "Synthetic individual session",
      amount: { amount: "125.00", currency: "USD" }
    },
    {
      id: "service_2",
      serviceDate: "2026-06-10",
      code: "SYN-90834",
      description: "Synthetic individual session",
      amount: { amount: "125.00", currency: "USD" }
    }
  ],
  findings: []
};

export function packetTotal(packet) {
  const cents = packet.serviceLines.reduce((sum, line) => sum + decimalToCents(line.amount.amount), 0);
  return { amount: centsToDecimal(cents), currency: packet.serviceLines[0]?.amount.currency ?? "USD" };
}

export function renderHelpTopic(topic) {
  return [topic.title, topic.summary, ...topic.explanation.map((line) => `- ${line}`)].join("\n");
}

function decimalToCents(value) {
  if (!/^\d+\.\d{2}$/.test(value)) throw new Error(`Invalid decimal money value: ${value}`);
  const [dollars, cents] = value.split(".");
  return Number(dollars) * 100 + Number(cents);
}

function centsToDecimal(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
