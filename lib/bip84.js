const HARDENED_OFFSET = 0x80000000;
const CURVE_ORDER = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
);
const FIELD_PRIME = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F",
);
const BASE_POINT = {
  x: BigInt(
    "55066263022277343669578718895168534326250603453777594175500187360389116729240",
  ),
  y: BigInt(
    "32670510020758816978083085130507043184471273380659243275938904335757337482424",
  ),
};

function normalize(value) {
  const result = value % FIELD_PRIME;
  return result >= 0n ? result : result + FIELD_PRIME;
}

function modPow(base, exponent, modulus) {
  let result = 1n;
  let factor = base % modulus;
  let power = exponent;

  while (power > 0n) {
    if (power & 1n) {
      result = (result * factor) % modulus;
    }

    factor = (factor * factor) % modulus;
    power >>= 1n;
  }

  return result;
}

function invert(value, modulus) {
  let a = ((value % modulus) + modulus) % modulus;
  let b = modulus;
  let x = 1n;
  let y = 0n;

  while (b !== 0n) {
    const quotient = a / b;
    [a, b] = [b, a % b];
    [x, y] = [y, x - quotient * y];
  }

  if (a !== 1n) {
    throw new Error("Modular inverse does not exist.");
  }

  return ((x % modulus) + modulus) % modulus;
}

function pointDouble(point) {
  if (point === null || point.y === 0n) {
    return null;
  }

  const slope = normalize(
    ((3n * point.x * point.x) * invert(2n * point.y, FIELD_PRIME)) % FIELD_PRIME,
  );
  const x = normalize(slope * slope - 2n * point.x);
  const y = normalize(slope * (point.x - x) - point.y);
  return { x, y };
}

function pointAdd(left, right) {
  if (left === null) {
    return right;
  }

  if (right === null) {
    return left;
  }

  if (left.x === right.x) {
    if (normalize(left.y + right.y) === 0n) {
      return null;
    }

    return pointDouble(left);
  }

  const slope = normalize(
    ((right.y - left.y) * invert(right.x - left.x, FIELD_PRIME)) % FIELD_PRIME,
  );
  const x = normalize(slope * slope - left.x - right.x);
  const y = normalize(slope * (left.x - x) - left.y);
  return { x, y };
}

function scalarMultiply(scalar, point = BASE_POINT) {
  let result = null;
  let addend = point;
  let factor = scalar % CURVE_ORDER;

  while (factor > 0n) {
    if (factor & 1n) {
      result = pointAdd(result, addend);
    }

    addend = pointDouble(addend);
    factor >>= 1n;
  }

  if (result === null) {
    throw new Error("Invalid scalar produced point at infinity.");
  }

  return result;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bigIntToBytes(value, length = 32) {
  const hex = value.toString(16).padStart(length * 2, "0");
  const bytes = new Uint8Array(length);

  for (let index = 0; index < length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

function bytesToBigInt(bytes) {
  return BigInt(`0x${bytesToHex(bytes)}`);
}

function concatBytes(...arrays) {
  const totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}

function numberToUint32(value) {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function textBytes(value) {
  return new TextEncoder().encode(value);
}

async function pbkdf2Sha512(passwordBytes, saltBytes, iterations, length) {
  const key = await crypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, [
    "deriveBits",
  ]);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-512",
      salt: saltBytes,
      iterations,
    },
    key,
    length * 8,
  );

  return new Uint8Array(derivedBits);
}

async function hmacSha512(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );

  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function ripemd160(message) {
  const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
  const paddedLength = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const bitLength = BigInt(bytes.length) * 8n;
  for (let index = 0; index < 8; index += 1) {
    padded[padded.length - 8 + index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
  }

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const zl = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15,
    3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11,
    5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7,
    12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
  ];
  const zr = [
    5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5,
    10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10,
    0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10,
    4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
  ];
  const sl = [
    11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7,
    15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6,
    5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15,
    5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
  ];
  const sr = [
    8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8,
    9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14,
    13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5,
    12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
  ];

  const f = (round, x, y, z) => {
    if (round === 0) return x ^ y ^ z;
    if (round === 1) return (x & y) | (~x & z);
    if (round === 2) return (x | ~y) ^ z;
    if (round === 3) return (x & z) | (y & ~z);
    return x ^ (y | ~z);
  };

  const kLeft = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
  const kRight = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];
  const rotateLeft = (value, bits) => ((value << bits) | (value >>> (32 - bits))) >>> 0;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(16);

    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] =
        padded[base] |
        (padded[base + 1] << 8) |
        (padded[base + 2] << 16) |
        (padded[base + 3] << 24);
    }

    let al = h0;
    let bl = h1;
    let cl = h2;
    let dl = h3;
    let el = h4;
    let ar = h0;
    let br = h1;
    let cr = h2;
    let dr = h3;
    let er = h4;

    for (let step = 0; step < 80; step += 1) {
      const round = Math.floor(step / 16);
      const tl =
        (rotateLeft((al + f(round, bl, cl, dl) + words[zl[step]] + kLeft[round]) >>> 0, sl[step]) +
          el) >>>
        0;
      al = el;
      el = dl;
      dl = rotateLeft(cl, 10);
      cl = bl;
      bl = tl;

      const rr = Math.floor(step / 16);
      const tr =
        (rotateLeft(
          (ar + f(4 - rr, br, cr, dr) + words[zr[step]] + kRight[rr]) >>> 0,
          sr[step],
        ) +
          er) >>>
        0;
      ar = er;
      er = dr;
      dr = rotateLeft(cr, 10);
      cr = br;
      br = tr;
    }

    const temp = (h1 + cl + dr) >>> 0;
    h1 = (h2 + dl + er) >>> 0;
    h2 = (h3 + el + ar) >>> 0;
    h3 = (h4 + al + br) >>> 0;
    h4 = (h0 + bl + cr) >>> 0;
    h0 = temp;
  }

  const out = new Uint8Array(20);
  const state = [h0, h1, h2, h3, h4];

  for (let index = 0; index < state.length; index += 1) {
    const value = state[index];
    out[index * 4] = value & 0xff;
    out[index * 4 + 1] = (value >>> 8) & 0xff;
    out[index * 4 + 2] = (value >>> 16) & 0xff;
    out[index * 4 + 3] = (value >>> 24) & 0xff;
  }

  return out;
}

async function hash160(bytes) {
  return ripemd160(await sha256(bytes));
}

function getCompressedPublicKey(privateKeyBytes) {
  const point = scalarMultiply(bytesToBigInt(privateKeyBytes));
  const prefix = point.y & 1n ? 0x03 : 0x02;
  return concatBytes(Uint8Array.of(prefix), bigIntToBytes(point.x, 32));
}

async function deriveMasterNode(seedBytes) {
  const digest = await hmacSha512(textBytes("Bitcoin seed"), seedBytes);
  return {
    privateKey: digest.slice(0, 32),
    chainCode: digest.slice(32),
  };
}

async function deriveChildPrivate(node, index) {
  const hardened = index >= HARDENED_OFFSET;
  const data = hardened
    ? concatBytes(Uint8Array.of(0), node.privateKey, numberToUint32(index))
    : concatBytes(getCompressedPublicKey(node.privateKey), numberToUint32(index));
  const digest = await hmacSha512(node.chainCode, data);
  const tweak = bytesToBigInt(digest.slice(0, 32));

  if (tweak >= CURVE_ORDER) {
    throw new Error("Invalid derived tweak.");
  }

  const childKeyValue = (tweak + bytesToBigInt(node.privateKey)) % CURVE_ORDER;

  if (childKeyValue === 0n) {
    throw new Error("Invalid derived child key.");
  }

  return {
    privateKey: bigIntToBytes(childKeyValue, 32),
    chainCode: digest.slice(32),
  };
}

function convertBits(values, fromBits, toBits, pad = true) {
  let accumulator = 0;
  let bits = 0;
  const output = [];
  const maxValue = (1 << toBits) - 1;
  const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;

  for (const value of values) {
    if (value < 0 || value >> fromBits !== 0) {
      throw new Error("Invalid value while converting bits.");
    }

    accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
    bits += fromBits;

    while (bits >= toBits) {
      bits -= toBits;
      output.push((accumulator >> bits) & maxValue);
    }
  }

  if (pad) {
    if (bits > 0) {
      output.push((accumulator << (toBits - bits)) & maxValue);
    }
  } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue) !== 0) {
    throw new Error("Invalid padding while converting bits.");
  }

  return output;
}

function bech32Polymod(values) {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;

  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;

    for (let index = 0; index < generators.length; index += 1) {
      if ((top >>> index) & 1) {
        checksum ^= generators[index];
      }
    }
  }

  return checksum;
}

function bech32HrpExpand(hrp) {
  const values = [];

  for (const char of hrp) {
    values.push(char.charCodeAt(0) >> 5);
  }

  values.push(0);

  for (const char of hrp) {
    values.push(char.charCodeAt(0) & 31);
  }

  return values;
}

function bech32CreateChecksum(hrp, data) {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(values) ^ 1;
  const checksum = [];

  for (let index = 0; index < 6; index += 1) {
    checksum.push((polymod >> (5 * (5 - index))) & 31);
  }

  return checksum;
}

function encodeSegwitAddress(hrp, witnessVersion, witnessProgram) {
  const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const data = [witnessVersion, ...convertBits(witnessProgram, 8, 5, true)];
  const checksum = bech32CreateChecksum(hrp, data);
  return `${hrp}1${[...data, ...checksum].map((value) => alphabet[value]).join("")}`;
}

async function derivePath(root, segments) {
  let node = root;

  for (const segment of segments) {
    node = await deriveChildPrivate(node, segment);
  }

  return node;
}

export async function deriveBip84Addresses(words, count = 5) {
  const mnemonic = words.join(" ");
  const seed = await pbkdf2Sha512(
    textBytes(mnemonic.normalize("NFKD")),
    textBytes("mnemonic"),
    2048,
    64,
  );
  const master = await deriveMasterNode(seed);
  const account = await derivePath(master, [
    84 + HARDENED_OFFSET,
    HARDENED_OFFSET,
    HARDENED_OFFSET,
    0,
  ]);
  const addresses = [];

  for (let index = 0; index < count; index += 1) {
    const child = await deriveChildPrivate(account, index);
    const publicKey = getCompressedPublicKey(child.privateKey);
    const witnessProgram = await hash160(publicKey);
    addresses.push({
      index,
      path: `m/84'/0'/0'/0/${index}`,
      address: encodeSegwitAddress("bc", 0, witnessProgram),
    });
  }

  return addresses;
}
