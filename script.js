/**
 * TopoCraft: Procedural Topography & 3D Elevation Studio
 * Pure JS procedural heightmap generator, contour renderer, and 3D wireframe simulator.
 */

// Simple seeded PRNG (Mulberry32)
function createRNG(seedStr) {
    let hash = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
        hash = Math.imul(hash ^ seedStr.charCodeAt(i), 3432918353);
        hash = hash << 13 | hash >>> 19;
    }
    return function() {
        hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
        hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
        return ((hash ^= hash >>> 16) >>> 0) / 4294967296;
    };
}

// Simple Value Noise 2D
class NoiseGenerator {
    constructor(seedString) {
        const rng = createRNG(seedString);
        this.perm = new Uint8Array(512);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        for (let i = 0; i < 512; i++) {
            this.perm[i] = p[i & 255];
        }
    }

    get(x, y) {
        const xi = Math.floor(x) & 255;
        const yi = Math.floor(y) & 255;
        const g1 = this.perm[this.perm[xi] + yi];
        const g2 = this.perm[this.perm[xi + 1] + yi];
        const g3 = this.perm[this.perm[xi] + yi + 1];
        const g4 = this.perm[this.perm[xi + 1] + yi + 1];

        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const fx = xf * xf * (3 - 2 * xf);
        const fy = yf * yf * (3 - 2 * yf);

        const top = g1 * (1 - fx) + g2 * fx;
        const bottom = g3 * (1 - fx) + g4 * fx;
        return (top * (1 - fy) + bottom * fy) / 255;
    }

    octaveNoise(x, y, octaves, persistence) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            total += this.get(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        return total / maxValue;
    }
}

// App State
const state = {
    seed: 'Topo2024',
    roughness: 4,
    scale: 50,
    uplift: 1.2,
    palette: 'topographic',
    seaLevel: 30,
    contourStep: 10,
    width: 200,
    height: 200,
    elevationData: null,
    minElev: 0,
    maxElev: 100
};

// Palettes
const palettes = {
    topographic: {
        water: '#1e3a8a',
        shallow: '#3b82f6',
        beach: '#fef08a',
        lowland: '#22c55e',
        midland: '#84cc16',
        highland: '#eab308',
        mountain: '#a16207',
        peak: '#f8fafc'
    },
    emerald: {
        water: '#065f46',
        shallow: '#047857',
        beach: '#a7f3d0',
        lowland: '#10b981',
        midland: '#059669',
        highland: '#047857',
        mountain: '#065f46',
        peak: '#ffffff'
    },
    arid: {
        water: '#78350f',
        shallow: '#b45309',
        beach: '#fde68a',
        lowland: '#d97706',
        midland: '#b45309',
        highland: '#92400e',
        mountain: '#78350f',
        peak: '#fff7ed'
    },
    monochrome: {
        water: '#cbd5e1',
        shallow: '#94a3b8',
        beach: '#f1f5f9',
        lowland: '#e2e8f0',
        midland: '#cbd5e1',
        highland: '#64748b',
        mountain: '#334155',
        peak: '#0f172a'
    },
    cyberpunk: {
        water: '#2e1065',
        shallow: '#7c3aed',
        beach: '#c084fc',
        lowland: '#06b6d4',
        midland: '#3b82f6',
        highland: '#ec4899',
        mountain: '#f43f5e',
        peak: '#facc15'
    }
};

// DOM Elements
const seedInput = document.getElementById('seedInput');
const randomSeedBtn = document.getElementById('randomSeedBtn');
const roughnessRange = document.getElementById('roughnessRange');
const roughnessVal = document.getElementById('roughnessVal');
const scaleRange = document.getElementById('scaleRange');
const scaleVal = document.getElementById('scaleVal');
const upliftRange = document.getElementById('upliftRange');
const upliftVal = document.getElementById('upliftVal');
const paletteSelect = document.getElementById('paletteSelect');
const seaLevelRange = document.getElementById('seaLevelRange');
const seaLevelVal = document.getElementById('seaLevelVal');
const contourStepRange = document.getElementById('contourStepRange');
const contourStepVal = document.getElementById('contourStepVal');
const generateBtn = document.getElementById('generateBtn');
const exportPngBtn = document.getElementById('exportPngBtn');
const mapCanvas = document.getElementById('mapCanvas');
const isoCanvas = document.getElementById('isoCanvas');
const profileCanvas = document.getElementById('profileCanvas');
const inspectCoords = document.getElementById('inspectCoords');

const statMaxElev = document.getElementById('statMaxElev');
const statMinElev = document.getElementById('statMinElev');
const statLandRatio = document.getElementById('statLandRatio');
const statPeaks = document.getElementById('statPeaks');

const tabBtns = document.querySelectorAll('.tab-btn');
const viewPanels = document.querySelectorAll('.view-panel');

// Initialize Terrain Generation
function generateTerrain() {
    state.seed = seedInput.value || 'Topo2024';
    state.roughness = parseInt(roughnessRange.value);
    state.scale = parseInt(scaleRange.value);
    state.uplift = parseFloat(upliftRange.value);
    state.palette = paletteSelect.value;
    state.seaLevel = parseInt(seaLevelRange.value);
    state.contourStep = parseInt(contourStepRange.value);

    const noise = new NoiseGenerator(state.seed);
    const w = state.width;
    const h = state.height;
    const data = new Float32Array(w * h);

    let min = Infinity;
    let max = -Infinity;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Distance from center to create island effect
            const nx = x / w - 0.5;
            const ny = y / h - 0.5;
            const distFromCenter = Math.sqrt(nx * nx + ny * ny) * 1.4;

            let val = noise.octaveNoise(x / state.scale, y / state.scale, state.roughness, 0.5);
            // Apply uplift and island falloff
            val = Math.pow(val * state.uplift, 1.2);
            val = Math.max(0, val - distFromCenter * 0.4);

            data[y * w + x] = val;
            if (val < min) min = val;
            if (val > max) max = val;
        }
    }

    // Normalize to 0 - 100 meters/units
    for (let i = 0; i < data.length; i++) {
        data[i] = ((data[i] - min) / (max - min)) * 100;
    }

    state.elevationData = data;
    state.minElev = 0;
    state.maxElev = 100;

    renderContourMap();
    renderIsometricMap();
    renderStatsAndProfile();
}

// Get color by elevation
fnGetColor = function(elev, pal) {
    const p = palettes[pal];
    const seaCutoff = state.seaLevel;
    if (elev < seaCutoff) {
        return elev < seaCutoff * 0.5 ? p.water : p.shallow;
    }
    const norm = (elev - seaCutoff) / (100 - seaCutoff);
    if (norm < 0.15) return p.beach;
    if (norm < 0.40) return p.lowland;
    if (norm < 0.65) return p.midland;
    if (norm < 0.85) return p.highland;
    if (norm < 0.95) return p.mountain;
    return p.peak;
}; let fnGetColor;

// Render 2D Contour Map
function renderContourMap() {
    const ctx = mapCanvas.getContext('2d');
    const w = state.width;
    const h = state.height;
    const imgData = ctx.createImageData(w, h);
    const data = state.elevationData;
    const pal = palettes[state.palette];

    // Helper hex to rgb
    function hexToRgb(hex) {
        const bigint = parseInt(hex.replace('#',''), 16);
        return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
    }

    const colorCache = {};
    function getRgbForElev(elev) {
        const key = Math.floor(elev);
        if (colorCache[key]) return colorCache[key];
        const hex = fnGetColor(elev, state.palette);
        const rgb = hexToRgb(hex);
        colorCache[key] = rgb;
        return rgb;
    }

    // Render base shaded relief / colors
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            const elev = data[idx];
            const rgb = getRgbForElev(elev);
            
            const targetIdx = (y * w + x) * 4;
            imgData.data[targetIdx] = rgb[0];
            imgData.data[targetIdx + 1] = rgb[1];
            imgData.data[targetIdx + 2] = rgb[2];
            imgData.data[targetIdx + 3] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);

    // Draw contour lines
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = state.palette === 'monochrome' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)';
    
    const step = state.contourStep;
    for (let targetElev = step; targetElev < 100; targetElev += step) {
        if (targetElev < state.seaLevel) continue;
        ctx.beginPath();
        for (let y = 0; y < h - 1; y++) {
            for (let x = 0; x < w - 1; x++) {
                const e1 = data[y * w + x];
                const e2 = data[y * w + (x + 1)];
                const e3 = data[(y + 1) * w + x];

                if ((e1 <= targetElev && e2 > targetElev) || (e1 > targetElev && e2 <= targetElev)) {
                    const t = (targetElev - e1) / (e2 - e1);
                    ctx.moveTo((x + t) * (mapCanvas.width / w), y * (mapCanvas.height / h));
                    ctx.lineTo((x + t) * (mapCanvas.width / w), (y + 1) * (mapCanvas.height / h));
                }
                if ((e1 <= targetElev && e3 > targetElev) || (e1 > targetElev && e3 <= targetElev)) {
                    const t = (targetElev - e1) / (e3 - e1);
                    ctx.moveTo(x * (mapCanvas.width / w), (y + t) * (mapCanvas.height / h));
                    ctx.lineTo((x + 1) * (mapCanvas.width / w), (y + t) * (mapCanvas.height / h));
                }
            }
        }
        ctx.stroke();
    }
}

// Render 3D Isometric Wireframe Elevation Model
function renderIsometricMap() {
    const ctx = isoCanvas.getContext('2d');
    ctx.clearRect(0, 0, isoCanvas.width, isoCanvas.height);
    
    const data = state.elevationData;
    const cols = 50;
    const rows = 50;
    const stepX = Math.floor(state.width / cols);
    const stepY = Math.floor(state.height / rows);

    ctx.strokeStyle = state.palette === 'cyberpunk' ? '#06b6d4' : (state.palette === 'monochrome' ? '#334155' : '#3b82f6');
    ctx.lineWidth = 1;

    const startX = 300;
    const startY = 150;

    for (let r = 0; r < rows; r++) {
        ctx.beginPath();
        for (let c = 0; c < cols; c++) {
            const x = c * stepX;
            const y = r * stepY;
            const elev = data[y * state.width + x];

            // Isometric projection formulas
            const isoX = startX + (c - r) * 8;
            const isoY = startY + (c + r) * 4 - elev * 1.5;

            if (c === 0) ctx.moveTo(isoX, isoY);
            else ctx.lineTo(isoX, isoY);
        }
        ctx.stroke();
    }

    for (let c = 0; c < cols; c++) {
        ctx.beginPath();
        for (let r = 0; r < rows; r++) {
            const x = c * stepX;
            const y = r * stepY;
            const elev = data[y * state.width + x];

            const isoX = startX + (c - r) * 8;
            const isoY = startY + (c + r) * 4 - elev * 1.5;

            if (r === 0) ctx.moveTo(isoX, isoY);
            else ctx.lineTo(isoX, isoY);
        }
        ctx.stroke();
    }
}

// Render Stats & Cross-Section Profile
function renderStatsAndProfile() {
    const data = state.elevationData;
    let max = -Infinity;
    let min = Infinity;
    let landCount = 0;
    let peaks = 0;

    const w = state.width;
    const h = state.height;

    for (let i = 0; i < data.length; i++) {
        const val = data[i];
        if (val > max) max = val;
        if (val < min) min = val;
        if (val >= state.seaLevel) landCount++;

        // Simple peak detection
        const x = i % w;
        const y = Math.floor(i / w);
        if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
            if (val > 80 && val > data[i - 1] && val > data[i + 1] && val > data[i - w] && val > data[i + w]) {
                peaks++;
            }
        }
    }

    statMaxElev.textContent = `${Math.round(max)}m`;
    statMinElev.textContent = `${Math.round(min)}m`;
    statLandRatio.textContent = `${Math.round((landCount / data.length) * 100)}%`;
    statPeaks.textContent = peaks;

    // Draw profile canvas (center horizontal cross-section)
    const pCtx = profileCanvas.getContext('2d');
    pCtx.clearRect(0, 0, profileCanvas.width, profileCanvas.height);

    const midY = Math.floor(h / 2);
    pCtx.beginPath();
    pCtx.strokeStyle = '#3b82f6';
    pCtx.lineWidth = 2;

    const pw = profileCanvas.width;
    const ph = profileCanvas.height;

    for (let x = 0; x < w; x++) {
        const elev = data[midY * w + x];
        const px = (x / w) * pw;
        const py = ph - (elev / 100) * (ph - 20) - 10;

        if (x === 0) pCtx.moveTo(px, py);
        else pCtx.lineTo(px, py);
    }
    pCtx.stroke();

    // Sea level line in profile
    const seaPy = ph - (state.seaLevel / 100) * (ph - 20) - 10;
    pCtx.strokeStyle = '#60a5fa';
    pCtx.setLineDash([4, 4]);
    pCtx.beginPath();
    pCtx.moveTo(0, seaPy);
    pCtx.lineTo(pw, seaPy);
    pCtx.stroke();
    pCtx.setLineDash([]);
}

// Interactive Canvas Click Inspection
mapCanvas.addEventListener('click', (e) => {
    const rect = mapCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const mapX = Math.floor((clickX / mapCanvas.clientWidth) * state.width);
    const mapY = Math.floor((clickY / mapCanvas.clientHeight) * state.height);

    if (mapX >= 0 && mapX < state.width && mapY >= 0 && mapY < state.height) {
        const elev = Math.round(state.elevationData[mapY * state.width + mapX]);
        inspectCoords.textContent = `X: ${mapX}, Y: ${mapY}, Elev: ${elev}m`;
    }
});

// Tab Switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        viewPanels.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        const view = btn.getAttribute('data-view');
        if (view === 'contour') document.getElementById('contourView').classList.add('active');
        if (view === 'isometric') document.getElementById('isometricView').classList.add('active');
        if (view === 'stats') document.getElementById('statsView').classList.add('active');
    });
});

// Event Listeners for Controls
roughnessRange.addEventListener('input', (e) => {
    roughnessVal.textContent = e.target.value;
});
scaleRange.addEventListener('input', (e) => {
    scaleVal.textContent = e.target.value;
});
upliftRange.addEventListener('input', (e) => {
    upliftVal.textContent = e.target.value;
});
seaLevelRange.addEventListener('input', (e) => {
    seaLevelVal.textContent = e.target.value;
});
contourStepRange.addEventListener('input', (e) => {
    contourStepVal.textContent = e.target.value;
});

randomSeedBtn.addEventListener('click', () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    seedInput.value = result;
    generateTerrain();
});

generateBtn.addEventListener('click', generateTerrain);

exportPngBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `Topograph_${state.seed}.png`;
    link.href = mapCanvas.toDataURL('image/png');
    link.click();
});

// Initial Generation on Load
window.addEventListener('DOMContentLoaded', () => {
    generateTerrain();
});
