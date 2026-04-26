import { createQrSvg } from "./lib/qr-svg.js";

const wordCountSelect = document.querySelector("#word-count");
const generateButton = document.querySelector("#generate-btn");
const copyButton = document.querySelector("#copy-btn");
const clearButton = document.querySelector("#clear-btn");
const phraseGrid = document.querySelector("#phrase-grid");
const qrCodeNode = document.querySelector("#qr-code");
const entropyDetailsNode = document.querySelector("#entropy-details");
const statusNode = document.querySelector("#status");
const runtimeBadge = document.querySelector("#runtime-badge");

let wordlist = [];
let currentPhrase = [];
let currentDetails = null;

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

async function generateMnemonic(wordCount) {
  const entropyBits = entropyByWordCount[wordCount];
  const entropyBytes = new Uint8Array(entropyBits / 8);
  crypto.getRandomValues(entropyBytes);

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
  phraseGrid.replaceChildren();
  clearQrCode();
  clearEntropyDetails();
  copyButton.disabled = true;
  clearButton.disabled = true;
  statusNode.textContent = "Phrase cleared from this browser session.";
}

async function onGenerate() {
  try {
    generateButton.disabled = true;
    statusNode.textContent = "Generating entropy, checksum, and QR locally...";

    const result = await generateMnemonic(Number(wordCountSelect.value));
    currentPhrase = result.words;
    currentDetails = result.details;
    renderPhrase(currentPhrase);
    renderQrCode(currentPhrase);
    renderEntropyDetails(currentDetails);

    copyButton.disabled = false;
    clearButton.disabled = false;
    statusNode.textContent =
      "Mnemonic and QR generated locally. Nothing was sent to a server.";
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    generateButton.disabled = false;
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

function setRuntimeBadge() {
  runtimeBadge.textContent =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "runtime=local"
      : "runtime=public";
}

generateButton.addEventListener("click", onGenerate);
copyButton.addEventListener("click", onCopy);
clearButton.addEventListener("click", clearPhrase);

setRuntimeBadge();
clearQrCode();
clearEntropyDetails();

loadWordlist()
  .then((words) => {
    wordlist = words;
    statusNode.textContent = "Ready. Select word count and generate locally.";
  })
  .catch((error) => {
    statusNode.textContent = error instanceof Error ? error.message : String(error);
    generateButton.disabled = true;
  });
