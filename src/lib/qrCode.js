const QR_LEVEL_L = 1;
const QR_FORMAT_MASK = 0x5412;
const QR_FORMAT_GENERATOR = 0x537;
const QR_PRIMITIVE = 0x11d;

const QR_VERSIONS = [
  { version: 1, size: 21, byteCapacity: 17, dataCodewords: 19, eccCodewords: 7, alignment: [] },
  { version: 2, size: 25, byteCapacity: 32, dataCodewords: 34, eccCodewords: 10, alignment: [6, 18] },
  { version: 3, size: 29, byteCapacity: 53, dataCodewords: 55, eccCodewords: 15, alignment: [6, 22] },
  { version: 4, size: 33, byteCapacity: 78, dataCodewords: 80, eccCodewords: 20, alignment: [6, 26] },
  { version: 5, size: 37, byteCapacity: 106, dataCodewords: 108, eccCodewords: 26, alignment: [6, 30] },
];

const MASK_PATTERNS = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

let gfTables = null;

function getGfTables() {
  if (gfTables) return gfTables;

  const exp = new Array(512).fill(0);
  const log = new Array(256).fill(0);
  let value = 1;

  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= QR_PRIMITIVE;
  }

  for (let index = 255; index < 512; index += 1) {
    exp[index] = exp[index - 255];
  }

  gfTables = { exp, log };
  return gfTables;
}

function gfMultiply(left, right) {
  if (!left || !right) return 0;
  const { exp, log } = getGfTables();
  return exp[log[left] + log[right]];
}

function multiplyPolynomials(left, right) {
  const result = new Array(left.length + right.length - 1).fill(0);
  left.forEach((leftValue, leftIndex) => {
    right.forEach((rightValue, rightIndex) => {
      result[leftIndex + rightIndex] ^= gfMultiply(leftValue, rightValue);
    });
  });
  return result;
}

function buildGeneratorPolynomial(degree) {
  let polynomial = [1];
  const { exp } = getGfTables();

  for (let index = 0; index < degree; index += 1) {
    polynomial = multiplyPolynomials(polynomial, [1, exp[index]]);
  }

  return polynomial;
}

function buildErrorCorrection(dataCodewords, eccCodewordCount) {
  const generator = buildGeneratorPolynomial(eccCodewordCount);
  const result = [...dataCodewords, ...new Array(eccCodewordCount).fill(0)];

  dataCodewords.forEach((_codeword, index) => {
    const coefficient = result[index];
    if (!coefficient) return;

    generator.forEach((generatorValue, generatorIndex) => {
      result[index + generatorIndex] ^= gfMultiply(generatorValue, coefficient);
    });
  });

  return result.slice(dataCodewords.length);
}

function appendBits(bits, value, length) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push(((value >> index) & 1) === 1);
  }
}

function encodeData(value, versionInfo) {
  const bytes = Array.from(new TextEncoder().encode(value));
  if (bytes.length > versionInfo.byteCapacity) {
    throw new Error('QR payload is too long for the location QR generator.');
  }

  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(bits, byte, 8));

  const totalBits = versionInfo.dataCodewords * 8;
  const terminatorLength = Math.min(4, totalBits - bits.length);
  appendBits(bits, 0, terminatorLength);

  while (bits.length % 8 !== 0) bits.push(false);

  const codewords = [];
  for (let index = 0; index < bits.length; index += 8) {
    let codeword = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      codeword = (codeword << 1) | (bits[index + bit] ? 1 : 0);
    }
    codewords.push(codeword);
  }

  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < versionInfo.dataCodewords) {
    codewords.push(pads[padIndex % pads.length]);
    padIndex += 1;
  }

  return codewords;
}

function createMatrix(size) {
  return {
    modules: Array.from({ length: size }, () => new Array(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array(size).fill(false)),
  };
}

function setModule(matrix, x, y, isDark, isReserved = true) {
  if (x < 0 || y < 0 || y >= matrix.modules.length || x >= matrix.modules.length) return;
  matrix.modules[y][x] = Boolean(isDark);
  if (isReserved) matrix.reserved[y][x] = true;
}

function drawFinder(matrix, left, top) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const targetX = left + x;
      const targetY = top + y;
      if (targetX < 0 || targetY < 0 || targetX >= matrix.modules.length || targetY >= matrix.modules.length) continue;

      const isSeparator = x === -1 || x === 7 || y === -1 || y === 7;
      const isDark =
        !isSeparator &&
        (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));

      setModule(matrix, targetX, targetY, isDark);
    }
  }
}

function drawAlignment(matrix, centerX, centerY) {
  if (matrix.reserved[centerY]?.[centerX]) return;

  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const distance = Math.max(Math.abs(x), Math.abs(y));
      setModule(matrix, centerX + x, centerY + y, distance !== 1);
    }
  }
}

function reserveFormatAreas(matrix) {
  const size = matrix.modules.length;
  for (let index = 0; index < 9; index += 1) {
    if (index !== 6) {
      matrix.reserved[8][index] = true;
      matrix.reserved[index][8] = true;
    }
  }

  for (let index = 0; index < 8; index += 1) {
    matrix.reserved[size - 1 - index][8] = true;
    matrix.reserved[8][size - 1 - index] = true;
  }
}

function drawFunctionPatterns(versionInfo) {
  const matrix = createMatrix(versionInfo.size);
  const size = versionInfo.size;

  drawFinder(matrix, 0, 0);
  drawFinder(matrix, size - 7, 0);
  drawFinder(matrix, 0, size - 7);

  for (let index = 8; index < size - 8; index += 1) {
    const isDark = index % 2 === 0;
    setModule(matrix, index, 6, isDark);
    setModule(matrix, 6, index, isDark);
  }

  versionInfo.alignment.forEach((x) => {
    versionInfo.alignment.forEach((y) => drawAlignment(matrix, x, y));
  });

  setModule(matrix, 8, 4 * versionInfo.version + 9, true);
  reserveFormatAreas(matrix);

  return matrix;
}

function getFormatBits(maskIndex) {
  const data = (QR_LEVEL_L << 3) | maskIndex;
  let remainder = data << 10;

  for (let index = 14; index >= 10; index -= 1) {
    if ((remainder & (1 << index)) !== 0) {
      remainder ^= QR_FORMAT_GENERATOR << (index - 10);
    }
  }

  return ((data << 10) | remainder) ^ QR_FORMAT_MASK;
}

function drawFormatBits(matrix, maskIndex) {
  const size = matrix.modules.length;
  const formatBits = getFormatBits(maskIndex);

  for (let index = 0; index < 15; index += 1) {
    const isDark = ((formatBits >> index) & 1) === 1;

    if (index < 6) setModule(matrix, 8, index, isDark);
    else if (index < 8) setModule(matrix, 8, index + 1, isDark);
    else setModule(matrix, 8, size - 15 + index, isDark);

    if (index < 8) setModule(matrix, size - index - 1, 8, isDark);
    else if (index === 8) setModule(matrix, 7, 8, isDark);
    else setModule(matrix, 14 - index, 8, isDark);
  }
}

function cloneMatrix(matrix) {
  return {
    modules: matrix.modules.map((row) => [...row]),
    reserved: matrix.reserved.map((row) => [...row]),
  };
}

function placeData(matrix, codewords, maskIndex) {
  const bits = [];
  codewords.forEach((codeword) => appendBits(bits, codeword, 8));

  const size = matrix.modules.length;
  let bitIndex = 0;
  let upward = true;

  for (let rightColumn = size - 1; rightColumn > 0; rightColumn -= 2) {
    if (rightColumn === 6) rightColumn -= 1;

    for (let rowOffset = 0; rowOffset < size; rowOffset += 1) {
      const y = upward ? size - 1 - rowOffset : rowOffset;

      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const x = rightColumn - columnOffset;
        if (matrix.reserved[y][x]) continue;

        const dataBit = bits[bitIndex] ?? false;
        const maskedBit = MASK_PATTERNS[maskIndex](x, y) ? !dataBit : dataBit;
        setModule(matrix, x, y, maskedBit, false);
        bitIndex += 1;
      }
    }

    upward = !upward;
  }
}

function getPenalty(matrix) {
  const modules = matrix.modules;
  const size = modules.length;
  let penalty = 0;
  let darkCount = 0;

  for (let y = 0; y < size; y += 1) {
    let runColor = modules[y][0];
    let runLength = 1;

    for (let x = 0; x < size; x += 1) {
      if (modules[y][x]) darkCount += 1;
      if (x === 0) continue;
      if (modules[y][x] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) penalty += 3 + (runLength - 5);
        runColor = modules[y][x];
        runLength = 1;
      }
    }
    if (runLength >= 5) penalty += 3 + (runLength - 5);
  }

  for (let x = 0; x < size; x += 1) {
    let runColor = modules[0][x];
    let runLength = 1;

    for (let y = 1; y < size; y += 1) {
      if (modules[y][x] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) penalty += 3 + (runLength - 5);
        runColor = modules[y][x];
        runLength = 1;
      }
    }
    if (runLength >= 5) penalty += 3 + (runLength - 5);
  }

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y][x];
      if (modules[y][x + 1] === color && modules[y + 1][x] === color && modules[y + 1][x + 1] === color) {
        penalty += 3;
      }
    }
  }

  const darkRatio = darkCount / (size * size);
  penalty += Math.floor(Math.abs(darkRatio * 100 - 50) / 5) * 10;
  return penalty;
}

function createQrModules(value) {
  const bytes = new TextEncoder().encode(value);
  const versionInfo = QR_VERSIONS.find((candidate) => bytes.length <= candidate.byteCapacity);
  if (!versionInfo) {
    throw new Error('QR payload is too long for supported location QR sizes.');
  }

  const dataCodewords = encodeData(value, versionInfo);
  const eccCodewords = buildErrorCorrection(dataCodewords, versionInfo.eccCodewords);
  const codewords = [...dataCodewords, ...eccCodewords];
  const baseMatrix = drawFunctionPatterns(versionInfo);

  return MASK_PATTERNS.reduce((best, _mask, maskIndex) => {
    const candidate = cloneMatrix(baseMatrix);
    placeData(candidate, codewords, maskIndex);
    drawFormatBits(candidate, maskIndex);
    const penalty = getPenalty(candidate);
    return !best || penalty < best.penalty ? { modules: candidate.modules, penalty } : best;
  }, null).modules;
}

export function createQrSvg(value, options = {}) {
  const margin = options.margin ?? 4;
  const modules = createQrModules(value);
  const size = modules.length + margin * 2;
  const darkModules = [];

  modules.forEach((row, y) => {
    row.forEach((isDark, x) => {
      if (isDark) darkModules.push(`M${x + margin} ${y + margin}h1v1h-1z`);
    });
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    `<path fill="#000" d="${darkModules.join('')}"/>`,
    '</svg>',
  ].join('');
}
