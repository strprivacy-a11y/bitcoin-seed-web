import { createQrSvg } from "./lib/qr-svg.js";
import { deriveBip84Addresses } from "./lib/bip84.js";

const wordCountSelect = document.querySelector("#word-count");
const generateButton = document.querySelector("#generate-btn");
const copyButton = document.querySelector("#copy-btn");
const clearButton = document.querySelector("#clear-btn");
const convertButton = document.querySelector("#convert-btn");
const entropyHexInput = document.querySelector("#entropy-hex");
const phraseGrid = document.querySelector("#phrase-grid");
const qrCodeNode = document.querySelector("#qr-code");
const entropyDetailsNode = document.querySelector("#entropy-details");
const derivedAddressesNode = document.querySelector("#derived-addresses");
const statusNode = document.querySelector("#status");
const runtimeBadge = document.querySelector("#runtime-badge");
const installButton = document.querySelector("#install-btn");
const installStatusNode = document.querySelector("#install-status");
const lookupBalancesButton = document.querySelector("#lookup-balances-btn");

let wordlist = [];
let currentPhrase = [];
let currentDetails = null;
let currentAddresses = [];
let currentBalances = new Map();
let deferredInstallPrompt = null;

const entropyByWordCount = {
  12: 128,
  15: 160,
  18: 192,
  21: 224,
  24: 256,
};

async function loadWordlist() {
  const response = await fetch("./english.txt", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load wordlist: ${response.status}`);
  }

  const words = (await response.text())
    .split("\n")
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length !== 2048) {
    throw new Error(`Expected 2048 words but received ${words.length}`);
  }

  return words;
}

function bytesToBinary(bytes) {
  return Array.from(bytes, (byte) => byte.toString(2).padStart(8, "0")).join("");
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function parseEntropyHex(value) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    throw new Error("Enter entropy_hex before converting.");
  }

  if (!/^[0-9a-f]+$/.test(normalized)) {
    throw new Error("entropy_hex must contain only 0-9 and a-f.");
  }

  if (normalized.length % 2 !== 0) {
    throw new Error("entropy_hex must have an even number of characters.");
  }

  const bytes = normalized.length / 2;
  const bits = bytes * 8;

  if (![128, 160, 192, 224, 256].includes(bits)) {
    throw new Error("entropy_hex must be 128, 160, 192, 224, or 256 bits.");
  }

  return new Uint8Array(
    normalized.match(/.{2}/g).map((pair) => Number.parseInt(pair, 16)),
  );
}

async function buildMnemonicFromEntropy(entropyBytes) {
  const entropyBits = entropyBytes.length * 8;
  const checksumBytes = await sha256(entropyBytes);
  const checksumLength = entropyBits / 32;
  const entropyBinary = bytesToBinary(entropyBytes);
  const checksumBinary = bytesToBinary(checksumBytes).slice(0, checksumLength);
  const fullBinary = `${entropyBinary}${checksumBinary}`;
  const entropyHex = Array.from(entropyBytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  const words = [];

  for (let index = 0; index < fullBinary.length; index += 11) {
    const chunk = fullBinary.slice(index, index + 11);
    const wordIndex = Number.parseInt(chunk, 2);
    words.push(wordlist[wordIndex]);
  }

  return {
    words,
    details: {
      entropyBits,
      entropyBytes: entropyBytes.length,
      entropyHex,
      checksumBits: checksumBinary,
      checksumLength,
      fullBinaryLength: fullBinary.length,
      phraseLength: words.length,
      qrPayloadChars: words.join(" ").length,
    },
  };
}

async function generateMnemonic(wordCount) {
  const entropyBits = entropyByWordCount[wordCount];
  const entropyBytes = new Uint8Array(entropyBits / 8);
  crypto.getRandomValues(entropyBytes);
  return buildMnemonicFromEntropy(entropyBytes);
}

function renderPhrase(words) {
  phraseGrid.replaceChildren(
    ...words.map((word, index) => {
      const item = document.createElement("li");
      item.className = "phrase-item";

      const itemIndex = document.createElement("span");
      itemIndex.className = "phrase-index";
      itemIndex.textContent = String(index + 1).padStart(2, "0");

      const itemWord = document.createElement("span");
      itemWord.className = "phrase-word";
      itemWord.textContent = word;

      item.append(itemIndex, itemWord);
      return item;
    }),
  );
}

function renderQrCode(words) {
  const phrase = words.join(" ");
  qrCodeNode.classList.remove("empty");
  qrCodeNode.innerHTML = createQrSvg(phrase);
}

function renderEntropyDetails(details) {
  const rows = [
    ["entropy_bits", String(details.entropyBits)],
    ["entropy_bytes", String(details.entropyBytes)],
    ["entropy_hex", details.entropyHex],
    ["checksum_bits", details.checksumBits],
    ["checksum_length", String(details.checksumLength)],
    ["binary_length", String(details.fullBinaryLength)],
    ["phrase_words", String(details.phraseLength)],
    ["qr_payload_chars", String(details.qrPayloadChars)],
  ];

  entropyDetailsNode.replaceChildren(
    ...rows.map(([label, value]) => {
      const wrapper = document.createElement("div");
      wrapper.className = "detail-row";

      const term = document.createElement("dt");
      term.textContent = label;

      const description = document.createElement("dd");
      description.textContent = value;

      wrapper.append(term, description);
      return wrapper;
    }),
  );
}

function clearQrCode() {
  qrCodeNode.classList.add("empty");
  qrCodeNode.innerHTML = '<p class="empty-copy">qr will appear after generation</p>';
}

function clearEntropyDetails() {
  entropyDetailsNode.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = "detail-row";

  const term = document.createElement("dt");
  term.textContent = "status";

  const description = document.createElement("dd");
  description.textContent = "no phrase generated yet";

  wrapper.append(term, description);
  entropyDetailsNode.append(wrapper);
}

function clearPhrase() {
  currentPhrase = [];
  currentDetails = null;
  currentAddresses = [];
  currentBalances = new Map();
  phraseGrid.replaceChildren();
  clearQrCode();
  clearEntropyDetails();
  clearDerivedAddresses();
  copyButton.disabled = true;
  clearButton.disabled = true;
  lookupBalancesButton.disabled = true;
  statusNode.textContent = "Phrase cleared from this browser session.";
}

async function applyMnemonicResult(result) {
  currentPhrase = result.words;
  currentDetails = result.details;
  renderPhrase(currentPhrase);
  renderQrCode(currentPhrase);
  renderEntropyDetails(currentDetails);
  currentAddresses = await deriveBip84Addresses(currentPhrase);
  currentBalances = new Map();
  renderDerivedAddresses(currentAddresses, currentBalances);
  copyButton.disabled = false;
  clearButton.disabled = false;
  lookupBalancesButton.disabled = false;
}

function formatSats(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatBtcFromSats(value) {
  return `${(value / 100000000).toFixed(8)} BTC`;
}

function renderDerivedAddresses(addresses, balances = new Map()) {
  derivedAddressesNode.replaceChildren(
    ...addresses.map(({ path, address }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "detail-row";

      const term = document.createElement("dt");
      term.textContent = path;

      const description = document.createElement("dd");
      description.className = "address-value";

      const addressLine = document.createElement("span");
      addressLine.textContent = address;
      description.append(addressLine);

      const balance = balances.get(address);
      if (balance) {
        const balanceLine = document.createElement("span");
        balanceLine.className = "address-balance";
        balanceLine.textContent =
          `${formatBtcFromSats(balance.totalSats)} (${formatSats(balance.totalSats)} sats)` +
          ` | confirmed=${formatBtcFromSats(balance.confirmedSats)}` +
          ` | mempool=${formatBtcFromSats(balance.mempoolSats)}` +
          ` | tx_count=${balance.txCount}`;
        description.append(balanceLine);
      }

      wrapper.append(term, description);
      return wrapper;
    }),
  );
}

function clearDerivedAddresses() {
  derivedAddressesNode.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = "detail-row";

  const term = document.createElement("dt");
  term.textContent = "status";

  const description = document.createElement("dd");
  description.textContent = "no addresses derived yet";

  wrapper.append(term, description);
  derivedAddressesNode.append(wrapper);
}

async function fetchAddressBalance(address) {
  const response = await fetch(
    `https://mempool.space/api/address/${encodeURIComponent(address)}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Balance lookup failed for ${address}: ${response.status}`);
  }

  const payload = await response.json();
  const confirmedSats =
    payload.chain_stats.funded_txo_sum - payload.chain_stats.spent_txo_sum;
  const mempoolSats =
    payload.mempool_stats.funded_txo_sum - payload.mempool_stats.spent_txo_sum;

  return {
    confirmedSats,
    mempoolSats,
    totalSats: confirmedSats + mempoolSats,
    txCount: payload.chain_stats.tx_count + payload.mempool_stats.tx_count,
  };
}

async function onLookupBalances() {
  if (!currentAddresses.length) {
    return;
  }

  try {
    lookupBalancesButton.disabled = true;
    generateButton.disabled = true;
    convertButton.disabled = true;
    statusNode.textContent =
      "Looking up balances from mempool.space for the derived BIP84 addresses...";

    const results = await Promise.allSettled(
      currentAddresses.map(async ({ address }) => [address, await fetchAddressBalance(address)]),
    );

    const balances = new Map();
    let failedLookups = 0;

    for (const result of results) {
      if (result.status === "fulfilled") {
        const [address, balance] = result.value;
        balances.set(address, balance);
      } else {
        failedLookups += 1;
      }
    }

    currentBalances = balances;
    renderDerivedAddresses(currentAddresses, currentBalances);

    statusNode.textContent =
      failedLookups === 0
        ? "Balances loaded from mempool.space for the derived BIP84 addresses."
        : `Balances loaded with ${failedLookups} lookup failure${failedLookups === 1 ? "" : "s"}.`;
  } catch (error) {
    statusNode.textContent =
      error instanceof Error ? error.message : "Balance lookup failed.";
  } finally {
    generateButton.disabled = false;
    convertButton.disabled = false;
    lookupBalancesButton.disabled = currentAddresses.length === 0;
  }
}

async function onGenerate() {
  try {
    generateButton.disabled = true;
    convertButton.disabled = true;
    statusNode.textContent = "Generating entropy, checksum, and QR locally...";

    const result = await generateMnemonic(Number(wordCountSelect.value));
    entropyHexInput.value = result.details.entropyHex;
    await applyMnemonicResult(result);
    statusNode.textContent =
      "Mnemonic, QR, and BIP84 addresses generated locally. Nothing was sent to a server.";
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    generateButton.disabled = false;
    convertButton.disabled = false;
  }
}

async function onCopy() {
  if (!currentPhrase.length) {
    return;
  }

  try {
    await navigator.clipboard.writeText(currentPhrase.join(" "));
    statusNode.textContent =
      "Mnemonic copied to clipboard. Clear it when you are done.";
  } catch (error) {
    statusNode.textContent =
      error instanceof Error ? error.message : "Clipboard write failed.";
  }
}

async function onConvertEntropy() {
  try {
    generateButton.disabled = true;
    convertButton.disabled = true;
    statusNode.textContent = "Deriving mnemonic from provided entropy_hex locally...";

    const entropyBytes = parseEntropyHex(entropyHexInput.value);
    const result = await buildMnemonicFromEntropy(entropyBytes);
    wordCountSelect.value = String(result.words.length);
    entropyHexInput.value = result.details.entropyHex;
    await applyMnemonicResult(result);
    statusNode.textContent =
      "Mnemonic, QR, and BIP84 addresses derived locally from entropy_hex. Nothing was sent to a server.";
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    generateButton.disabled = false;
    convertButton.disabled = false;
  }
}

function setRuntimeBadge() {
  runtimeBadge.textContent =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "runtime=local"
      : "runtime=public";
}

function isInstalledApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function setInstallState({ supported = true, available = false, message }) {
  installButton.hidden = !available;
  installButton.disabled = !available;

  if (!supported) {
    installStatusNode.textContent = message ?? "install prompt is not supported in this browser.";
    return;
  }

  if (isInstalledApp()) {
    installStatusNode.textContent = message ?? "app is already installed on this device.";
    return;
  }

  installStatusNode.textContent =
    message ??
    (available
      ? "install_app is ready for this browser session."
      : "open this site in a supported browser to install it as an app.");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    setInstallState({
      supported: false,
      message: "service workers are unavailable, so app install is disabled here.",
    });
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    setInstallState({
      supported: false,
      message:
        error instanceof Error
          ? `service worker registration failed: ${error.message}`
          : "service worker registration failed.",
    });
  }
}

async function onInstallApp() {
  if (!deferredInstallPrompt) {
    setInstallState({
      message: "install prompt is not ready yet. reload after the page finishes loading.",
    });
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;

  if (choice.outcome === "accepted") {
    installButton.hidden = true;
    installButton.disabled = true;
    installStatusNode.textContent = "install accepted. this app should now appear on your device.";
    return;
  }

  setInstallState({
    message: "install prompt dismissed. you can trigger it again if the browser offers it later.",
  });
}

generateButton.addEventListener("click", onGenerate);
copyButton.addEventListener("click", onCopy);
clearButton.addEventListener("click", clearPhrase);
convertButton.addEventListener("click", onConvertEntropy);
installButton.addEventListener("click", onInstallApp);
lookupBalancesButton.addEventListener("click", onLookupBalances);
entropyHexInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    onConvertEntropy();
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  setInstallState({ available: true });
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  setInstallState({ message: "app installed successfully." });
});

setRuntimeBadge();
clearQrCode();
clearEntropyDetails();
clearDerivedAddresses();
setInstallState({
  message: isInstalledApp()
    ? "app is already installed on this device."
    : "waiting for browser install availability...",
});
registerServiceWorker();

loadWordlist()
  .then((words) => {
    wordlist = words;
    statusNode.textContent = "Ready. Select word count and generate locally.";
  })
  .catch((error) => {
    statusNode.textContent = error instanceof Error ? error.message : String(error);
    generateButton.disabled = true;
  });
