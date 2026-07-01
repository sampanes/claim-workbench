import { helpTopics, packetTotal, syntheticPacket } from "@claim-workbench/core";
import "./styles.css";

const total = packetTotal(syntheticPacket);
const steps = ["import", "normalize", "validate", "generate", "assist", "verify", "approve"];

document.querySelector("#root").innerHTML = `
  <main class="desktop-shell">
    <section class="window" aria-label="Claim Workbench prototype">
      <header class="titlebar"><div class="traffic" aria-hidden="true"><span></span><span></span><span></span></div><div class="titlecopy"><strong>Claim Workbench</strong><span>Local synthetic run</span></div><button class="pill">Observe mode</button></header>
      <div class="toolbar"><div><span class="eyebrow">Packet</span><strong>${syntheticPacket.id}</strong></div><div><span class="eyebrow">Destination</span><strong>${syntheticPacket.destination}</strong></div><div><span class="eyebrow">Next safe action</span><strong>Validate packet</strong></div></div>
      <div class="content-grid">
        <aside class="sidebar"><h2>Workflow</h2><ol>${steps.map((s,i)=>`<li class="${i===0?'active':''}">${s}</li>`).join("")}</ol><h3>Available actions</h3><button>Validate packet</button><button>Show packet facts</button><button class="secondary">Mark manual</button></aside>
        <section class="browser-card"><div class="browser-chrome"><span></span>synthetic-eap.local/claim/new</div><div class="portal-preview"><p class="eyebrow">Visible destination workspace</p><h1>Prepare synthetic claim</h1><p>No browser mutations are available until deterministic validation passes.</p><div class="row"><span>Client</span><strong>${syntheticPacket.clientDisplayName}</strong></div><div class="row"><span>Service rows</span><strong>${syntheticPacket.serviceLines.length}</strong></div><div class="row"><span>Total</span><strong>${total.currency} ${total.amount}</strong></div></div></section>
        <aside class="inspector"><h2>Packet summary</h2>${syntheticPacket.serviceLines.map(line=>`<article><strong>${line.serviceDate}</strong><span>${line.code}</span><span>${line.amount.currency} ${line.amount.amount}</span></article>`).join("")}<h2>Contextual help</h2><div class="help"><strong>${helpTopics[0].title}</strong><p>${helpTopics[0].summary}</p><small>Topic: ${helpTopics[0].id}</small></div></aside>
      </div><footer class="status">Ready • synthetic data only • approval required before irreversible actions</footer>
    </section>
  </main>`;
