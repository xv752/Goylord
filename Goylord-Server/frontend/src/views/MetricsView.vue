<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick, shallowRef } from 'vue'
import { api } from '../lib/api'

interface MetricsSnapshot {
  timestamp: number
  clients: { total: number; online: number; offline: number; byOS: Record<string,number>; byCountry: Record<string,number> }
  connections: { totalConnections: number; totalDisconnections: number; activeConnections: number }
  commands: { total: number; lastMinute: number; lastHour: number; byType: Record<string,number> }
  sessions: { console: number; remoteDesktop: number; fileBrowser: number; process: number }
  bandwidth: { sent: number; received: number; sentPerSecond: number; receivedPerSecond: number }
  server: { uptime: number; startTime: number; memoryUsage: any; systemMemory: any; cpu: any }
  ping: { min: number; max: number; avg: number; count: number }
  http: { total: number; lastMinute: number; lastMinuteErrors: number; latencyAvg: number; latencyP95: number; latencyP99: number; routes: any[] }
  eventLoop: { avg: number; max: number; p95: number }
  internal: { tasks: any[] }
}
interface HistoryPoint {
  timestamp: number; clientsOnline: number; commandsPerMinute: number
  bandwidthSent: number; bandwidthReceived: number
  httpRequestsPerMinute: number; httpErrorsPerMinute: number
  httpLatencyAvg: number; httpLatencyP95: number; httpLatencyP99: number
  eventLoopAvg: number; eventLoopP95: number
  heapUsed: number; rss: number; systemMemoryUsedPercent: number; activeSessions: number
}

const loading = ref(true)
const snapshot = ref<MetricsSnapshot | null>(null)
const history = ref<HistoryPoint[]>([])
let refreshTimer: ReturnType<typeof setInterval> | null = null
let visibilityHandler: (() => void) | null = null
let chartInstances: any[] = []
let ChartJS: any = null
let geoJson: any = null
const globeCanvas = ref<HTMLCanvasElement | null>(null)
const globeTooltip = ref({ show: false, x: 0, y: 0, text: '' })

const globeState = reactive({ phi: -0.3, theta: 0.35, zoom: 1.15, spinning: true, dragging: false, lastPointer: { x: 0, y: 0 }, autoSpinTimer: null as any, countryFeatures: [] as any[], countryPolys3D: [] as any[], countryCount: {} as Record<string, number>, totalCount: 1 })

function formatBytes(b: number) {
  if (b === 0) return '0 B'
  const k = 1024, units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + units[i]
}
function formatMs(ms: number) { return ms.toFixed(1) + ' ms' }
function formatUptime(ms: number) {
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

async function loadMetrics() {
  try {
    const data = await api.get<{ snapshot: MetricsSnapshot; history: HistoryPoint[] }>('/api/metrics?historyLimit=240')
    snapshot.value = data.snapshot
    history.value = data.history || []
  } catch {} finally { loading.value = false }
}

async function loadChartJs() {
  if (ChartJS) return ChartJS
  const mod = await import('chart.js')
  ChartJS = mod.Chart
  ChartJS.defaults.color = '#cbd5e1'
  ChartJS.defaults.borderColor = 'rgba(100,116,139,0.25)'
  ChartJS.defaults.font.family = 'Inter, system-ui, sans-serif'
  ChartJS.defaults.animation = false as any
  return ChartJS
}

function makeLineDatasets(keys: string[], colors: string[], labels?: string[]) {
  return keys.map((k, i) => ({
    label: labels?.[i] || k, data: history.value.map((h: any) => h[k]),
    borderColor: colors[i], backgroundColor: colors[i] + '20', borderWidth: 1.5,
    tension: 0.4, pointRadius: 0, fill: keys.length === 1,
  }))
}

let chartsInitialized = false

function getLabels() {
  return history.value.map(h => { const d = new Date(h.timestamp); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') })
}

const chartOpts = (yFmt?: (v: number) => string) => ({
  responsive: true, maintainAspectRatio: false, animation: false as const,
  plugins: { legend: { display: false } },
  scales: {
    x: { display: false },
    y: { beginAtZero: true, grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { callback: yFmt || ((v: any) => v), maxTicksLimit: 5 } }
  }
})

async function initCharts() {
  const Chart = await loadChartJs()
  if (!Chart) return

  if (chartsInitialized) { updateCharts(); return }
  chartsInitialized = true
  const labels = getLabels()

  const c1 = document.getElementById('chart-clients') as HTMLCanvasElement
  if (c1) chartInstances.push(new Chart(c1, { type: 'line', data: { labels, datasets: [{ label: 'Online', data: [], borderColor: '#60a5fa', backgroundColor: '#60a5fa20', borderWidth: 1.5, tension: 0.4, pointRadius: 0, fill: true }] }, options: chartOpts() }))

  const c2 = document.getElementById('chart-commands') as HTMLCanvasElement
  if (c2) chartInstances.push(new Chart(c2, { type: 'line', data: { labels, datasets: [{ label: 'Cmd/min', data: [], borderColor: '#c084fc', backgroundColor: '#c084fc20', borderWidth: 1.5, tension: 0.4, pointRadius: 0, fill: true }] }, options: chartOpts() }))

  const c3 = document.getElementById('chart-bandwidth') as HTMLCanvasElement
  if (c3) chartInstances.push(new Chart(c3, { type: 'line', data: { labels, datasets: [
    { label: 'Sent/s', data: [], borderColor: '#fb923c', backgroundColor: '#fb923c20', borderWidth: 1.5, tension: 0.4, pointRadius: 0 },
    { label: 'Received/s', data: [], borderColor: '#38bdf8', backgroundColor: '#38bdf820', borderWidth: 1.5, tension: 0.4, pointRadius: 0 },
  ] }, options: { ...chartOpts((v: number) => formatBytes(v)), plugins: { legend: { display: true, boxWidth: 10, labels: { boxWidth: 8 } } } } }))

  const c4 = document.getElementById('chart-http-req') as HTMLCanvasElement
  if (c4) chartInstances.push(new Chart(c4, { type: 'line', data: { labels, datasets: [
    { label: 'Req/min', data: [], borderColor: '#34d399', backgroundColor: '#34d39920', borderWidth: 1.5, tension: 0.4, pointRadius: 0 },
    { label: 'Errors/min', data: [], borderColor: '#f87171', borderWidth: 1.5, tension: 0.4, pointRadius: 0, borderDash: [5, 4] },
  ] }, options: { ...chartOpts(), plugins: { legend: { display: true, boxWidth: 10, labels: { boxWidth: 8 } } } } }))

  const c5 = document.getElementById('chart-http-lat') as HTMLCanvasElement
  if (c5) chartInstances.push(new Chart(c5, { type: 'line', data: { labels, datasets: [
    { label: 'P99', data: [], borderColor: '#f87171', borderWidth: 1.5, tension: 0.4, pointRadius: 0, borderDash: [4, 4] },
    { label: 'P95', data: [], borderColor: '#f43f5e', backgroundColor: '#f43f5e15', borderWidth: 1.5, tension: 0.4, pointRadius: 0, fill: true },
    { label: 'Avg', data: [], borderColor: '#fbbf24', borderWidth: 1.5, tension: 0.4, pointRadius: 0 },
  ] }, options: { ...chartOpts((v: number) => formatMs(v)), plugins: { legend: { display: true, boxWidth: 10, labels: { boxWidth: 8 } } } } }))

  const c6 = document.getElementById('chart-memory') as HTMLCanvasElement
  if (c6) chartInstances.push(new Chart(c6, { type: 'line', data: { labels, datasets: [
    { label: 'Heap', data: [], borderColor: '#22d3ee', borderWidth: 1.5, tension: 0.4, pointRadius: 0, yAxisID: 'y' },
    { label: 'RSS', data: [], borderColor: '#818cf8', borderWidth: 1.5, tension: 0.4, pointRadius: 0, yAxisID: 'y' },
    { label: 'System %', data: [], borderColor: '#34d399', borderWidth: 1.5, tension: 0.4, pointRadius: 0, yAxisID: 'y1' },
  ] }, options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { x: { display: false }, y: { beginAtZero: true, position: 'left', grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { callback: (v: any) => formatBytes(v), maxTicksLimit: 5 } }, y1: { beginAtZero: true, max: 100, position: 'right', grid: { display: false }, ticks: { callback: (v: any) => v + '%', maxTicksLimit: 5 } } }, plugins: { legend: { display: true, boxWidth: 10, labels: { boxWidth: 8 } } } } }))

  const c7 = document.getElementById('chart-evloop') as HTMLCanvasElement
  if (c7) chartInstances.push(new Chart(c7, { type: 'line', data: { labels, datasets: [
    { label: 'P95', data: [], borderColor: '#fbbf24', borderWidth: 1.5, tension: 0.4, pointRadius: 0 },
    { label: 'Avg', data: [], borderColor: '#60a5fa', borderWidth: 1.5, tension: 0.4, pointRadius: 0 },
  ] }, options: { ...chartOpts((v: number) => formatMs(v)), plugins: { legend: { display: true, boxWidth: 10, labels: { boxWidth: 8 } } } } }))

  const c8 = document.getElementById('chart-sessions') as HTMLCanvasElement
  if (c8) {
    const s = snapshot.value?.sessions
    const sessData = s ? [s.console, s.remoteDesktop, s.fileBrowser, s.process] : [0, 0, 0, 0]
    const sessColors = ['#34d399', '#c084fc', '#60a5fa', '#fb923c']
    chartInstances.push(new Chart(c8, { type: 'doughnut', data: { labels: ['Console', 'Remote Desktop', 'Files', 'Processes'], datasets: [{ data: sessData, backgroundColor: sessData.some(v => v > 0) ? sessColors : sessColors.map(() => 'rgba(100,116,139,0.35)'), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '64%', plugins: { legend: { display: false } } } }))
  }

  const c9 = document.getElementById('chart-os') as HTMLCanvasElement
  if (c9 && snapshot.value?.clients.byOS) {
    const osEntries = Object.entries(snapshot.value.clients.byOS).sort((a, b) => b[1] - a[1]).slice(0, 10)
    chartInstances.push(new Chart(c9, { type: 'bar', data: { labels: osEntries.map(([k]) => k), datasets: [{ data: osEntries.map(([, v]) => v), backgroundColor: 'rgba(56,189,248,0.5)', borderRadius: 4 }] }, options: { indexAxis: 'y' as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { maxTicksLimit: 5 } }, y: { grid: { display: false } } } } }))
  }

  updateCharts()
}

function updateCharts() {
  if (!chartInstances.length || !history.value.length) return
  const labels = getLabels()
  const h = history.value
  const ci = chartInstances

  if (ci[0]) { ci[0].data.labels = labels; ci[0].data.datasets[0].data = h.map(p => p.clientsOnline); ci[0].update('none') }
  if (ci[1]) { ci[1].data.labels = labels; ci[1].data.datasets[0].data = h.map(p => p.commandsPerMinute); ci[1].update('none') }
  if (ci[2]) { ci[2].data.labels = labels; ci[2].data.datasets[0].data = h.map(p => p.bandwidthSent); ci[2].data.datasets[1].data = h.map(p => p.bandwidthReceived); ci[2].update('none') }
  if (ci[3]) { ci[3].data.labels = labels; ci[3].data.datasets[0].data = h.map(p => p.httpRequestsPerMinute); ci[3].data.datasets[1].data = h.map(p => p.httpErrorsPerMinute); ci[3].update('none') }
  if (ci[4]) { ci[4].data.labels = labels; ci[4].data.datasets[0].data = h.map(p => p.httpLatencyP99); ci[4].data.datasets[1].data = h.map(p => p.httpLatencyP95); ci[4].data.datasets[2].data = h.map(p => p.httpLatencyAvg); ci[4].update('none') }
  if (ci[5]) { ci[5].data.labels = labels; ci[5].data.datasets[0].data = h.map(p => p.heapUsed); ci[5].data.datasets[1].data = h.map(p => p.rss); ci[5].data.datasets[2].data = h.map(p => p.systemMemoryUsedPercent); ci[5].update('none') }
  if (ci[6]) { ci[6].data.labels = labels; ci[6].data.datasets[0].data = h.map(p => p.eventLoopP95); ci[6].data.datasets[1].data = h.map(p => p.eventLoopAvg); ci[6].update('none') }
  if (ci[7]) {
    const s = snapshot.value?.sessions
    const sd = s ? [s.console, s.remoteDesktop, s.fileBrowser, s.process] : [0, 0, 0, 0]
    const sc = ['#34d399', '#c084fc', '#60a5fa', '#fb923c']
    ci[7].data.datasets[0].data = sd; ci[7].data.datasets[0].backgroundColor = sd.some(v => v > 0) ? sc : sc.map(() => 'rgba(100,116,139,0.35)'); ci[7].update('none')
  }
  if (ci[8] && snapshot.value?.clients.byOS) {
    const osE = Object.entries(snapshot.value.clients.byOS).sort((a, b) => b[1] - a[1]).slice(0, 10)
    ci[8].data.labels = osE.map(([k]) => k); ci[8].data.datasets[0].data = osE.map(([, v]) => v); ci[8].update('none')
  }
}

// === GLOBE ===
function lonLatTo3D(lon: number, lat: number) {
  const r = 1, rad = Math.PI / 180
  return { x: r * Math.cos(lat * rad) * Math.cos(lon * rad), y: r * Math.cos(lat * rad) * Math.sin(lon * rad), z: r * Math.sin(lat * rad) }
}
function rotate3D(p: { x: number; y: number; z: number }, phi: number, theta: number) {
  const cosP = Math.cos(phi), sinP = Math.sin(phi), cosT = Math.cos(theta), sinT = Math.sin(theta)
  return { x: p.x * cosP - p.y * sinP, y: (p.x * sinP + p.y * cosP) * cosT + p.z * sinT, z: -(p.x * sinP + p.y * cosP) * sinT + p.z * cosT }
}
function project(p: { x: number; y: number; z: number }, w: number, h: number, zoom: number) {
  return { x: w / 2 + p.x * w * 0.4 * zoom, y: h / 2 - p.z * h * 0.4 * zoom, behind: p.y < 0.025 }
}
function simplifyPolygon(coords: [number, number][], tolerance: number) {
  if (coords.length <= 4) return coords
  const result: [number, number][] = [coords[0]]
  for (let i = 1; i < coords.length - 1; i += 3) { if (i < coords.length - 1) result.push(coords[i]) }
  result.push(coords[coords.length - 1])
  return result
}
function countryHeatColor(count: number, total: number) {
  const intensity = Math.min(1, Math.sqrt(count / Math.max(total, 1)))
  if (intensity < 0.25) return `rgba(34,211,238,${0.2 + intensity * 1.2})`
  if (intensity < 0.5) return `rgba(110,231,183,${0.3 + intensity})`
  if (intensity < 0.75) return `rgba(251,191,36,${0.3 + intensity * 0.7})`
  return `rgba(239,68,68,${0.4 + intensity * 0.6})`
}

async function loadGeoJson() {
  try { geoJson = await api.get<any>('/vendor/geo-countries/countries.geojson') } catch {}
}

function initGlobe() {
  if (!geoJson || !globeCanvas.value) return
  const gs = globeState
  gs.countryFeatures = geoJson.features || []
  gs.countryCount = snapshot.value?.clients.byCountry || {}
  gs.totalCount = Object.values(gs.countryCount).reduce((a: number, b: any) => a + (b as number), 0) as number

  gs.countryPolys3D = gs.countryFeatures.map((f: any) => {
    const code = f.properties?.ISO_A2 || f.properties?.iso_a2 || 'ZZ'
    const polys = (f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry?.coordinates]).filter(Boolean)
    return { code, polys: polys.map((poly: any) => (poly[0] || poly).map((ring: any[]) => simplifyPolygon(ring.map((c: [number, number]) => c), 0.18).map(([lon, lat]: [number, number]) => lonLatTo3D(lon, lat)))) }
  })

  drawGlobe()
  globeCanvas.value.addEventListener('pointerdown', onGlobeDown)
  globeCanvas.value.addEventListener('pointermove', onGlobeMove)
  globeCanvas.value.addEventListener('pointerup', onGlobeUp)
  globeCanvas.value.addEventListener('pointerleave', onGlobeUp)
  globeCanvas.value.addEventListener('wheel', onGlobeWheel)
  requestAnimationFrame(globeSpinLoop)
}

function drawGlobe() {
  const canvas = globeCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  const gs = globeState
  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = 'rgba(2,6,22,0.8)'
  ctx.fillRect(0, 0, W, H)

  // Globe circle
  ctx.beginPath()
  ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.4 * gs.zoom, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(15,23,42,0.6)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(51,65,85,0.5)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Graticule
  ctx.strokeStyle = 'rgba(51,65,85,0.2)'
  ctx.lineWidth = 0.5
  for (let lon = -180; lon < 180; lon += 30) {
    ctx.beginPath()
    for (let lat = -90; lat <= 90; lat += 3) {
      const p = project(rotate3D(lonLatTo3D(lon, lat), gs.phi, gs.theta), W, H, gs.zoom)
      if (p.behind) continue
      lat === -90 || p.behind ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath()
    for (let lon = -180; lon <= 180; lon += 3) {
      const p = project(rotate3D(lonLatTo3D(lon, lat), gs.phi, gs.theta), W, H, gs.zoom)
      if (p.behind) continue
      lon === -180 || p.behind ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
  }

  // Countries
  for (const country of gs.countryPolys3D) {
    const count = gs.countryCount[country.code] || 0
    const fill = countryHeatColor(count, gs.totalCount)
    for (const poly of country.polys) {
      for (const ring of poly) {
        ctx.beginPath()
        let started = false
        for (const pt of ring) {
          const rp = rotate3D(pt, gs.phi, gs.theta)
          if (rp.y < 0.025) { started = false; continue }
          const p = project(rp, W, H, gs.zoom)
          if (!started) { ctx.moveTo(p.x, p.y); started = true } else { ctx.lineTo(p.x, p.y) }
        }
        ctx.closePath()
        ctx.fillStyle = fill
        ctx.fill()
        ctx.strokeStyle = 'rgba(30,41,59,0.7)'
        ctx.lineWidth = 0.4
        ctx.stroke()
      }
    }
  }

  // Country dots for high-count countries
  for (const country of gs.countryPolys3D) {
    const count = gs.countryCount[country.code] || 0
    if (count <= 0) continue
    // Estimate centroid from first ring
    const ring = country.polys[0]?.[0]
    if (!ring || ring.length < 3) continue
    let cLon = 0, cLat = 0, n = 0
    for (const pt of ring) { cLon += pt[0]; cLat += pt[1]; n++ }
    cLon /= n; cLat /= n
    const p = project(rotate3D(lonLatTo3D(cLon, cLat), gs.phi, gs.theta), W, H, gs.zoom)
    if (p.behind) continue
    const radius = Math.min(6, 2 + Math.sqrt(count) * 1.2)
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = countryHeatColor(count, gs.totalCount)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }
}

let lastGlobeFrame = 0
const GLOBE_FRAME_MS = 32
let globeRafId = 0
let isPageVisible = true

function globeSpinLoop(timestamp: number) {
  if (isPageVisible && globeState.spinning && !globeState.dragging && (timestamp - lastGlobeFrame >= GLOBE_FRAME_MS)) {
    globeState.phi += 0.005
    lastGlobeFrame = timestamp
    drawGlobe()
  }
  globeRafId = requestAnimationFrame(globeSpinLoop)
}
function onGlobeDown(e: PointerEvent) { globeState.dragging = true; globeState.lastPointer = { x: e.clientX, y: e.clientY }; globeState.spinning = false }
let lastGlobeMoveFrame = 0
function onGlobeMove(e: PointerEvent) {
  if (!globeState.dragging) return
  const now = performance.now()
  if (now - lastGlobeMoveFrame < 16) return
  lastGlobeMoveFrame = now
  globeState.phi += (e.clientX - globeState.lastPointer.x) * 0.006
  globeState.theta = Math.max(-1.15, Math.min(1.15, globeState.theta + (e.clientY - globeState.lastPointer.y) * 0.006))
  globeState.lastPointer = { x: e.clientX, y: e.clientY }
  drawGlobe()
  // Tooltip
  const canvas = globeCanvas.value!
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left, y = e.clientY - rect.top
  const W = canvas.width, H = canvas.height
  const unX = (x - W / 2) / (W * 0.4 * globeState.zoom)
  const unZ = -(y - H / 2) / (H * 0.4 * globeState.zoom)
  if (unX * unX + unZ * unZ < 1) {
    const unY = Math.sqrt(Math.max(0, 1 - unX * unX - unZ * unZ))
    // Reverse rotation
    const cosP = Math.cos(-globeState.phi), sinP = Math.sin(-globeState.phi), cosT = Math.cos(-globeState.theta), sinT = Math.sin(-globeState.theta)
    const ry = (unX * sinP + unY * cosP) * cosT + unZ * sinT
    const rz = -(unX * sinP + unY * cosP) * sinT + unZ * cosT
    const lat = Math.asin(Math.max(-1, Math.min(1, rz))) * 180 / Math.PI
    const lon = Math.atan2(ry, unX * cosP - unY * sinP) * 180 / Math.PI
    // Find country by point-in-polygon
    for (const country of globeState.countryPolys3D) {
      for (const poly of country.polys) {
        for (const ring of poly) {
          if (pointInRing(lon, lat, ring)) {
            const count = globeState.countryCount[country.code] || 0
            const name = country.code
            globeTooltip.value = { show: true, x: e.clientX - rect.left, y: e.clientY - rect.top, text: `${name}: ${count} (${globeState.totalCount ? Math.round(count / globeState.totalCount * 100) : 0}%)` }
            return
          }
        }
      }
    }
  }
  globeTooltip.value = { show: false, x: 0, y: 0, text: '' }
}
function pointInRing(lon: number, lat: number, ring: { x: number; y: number; z: number }[]) {
  let inside = false
  // Convert 3D points back to lon/lat for ray casting
  const coords = ring.map(p => {
    const lat2 = Math.asin(p.z) * 180 / Math.PI
    const lon2 = Math.atan2(p.y, p.x) * 180 / Math.PI
    return [lon2, lat2]
  })
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1], xj = coords[j][0], yj = coords[j][1]
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function onGlobeUp() {
  globeState.dragging = false
  clearTimeout(globeState.autoSpinTimer)
  globeState.autoSpinTimer = setTimeout(() => { globeState.spinning = true }, 2500)
}
function onGlobeWheel(e: WheelEvent) {
  e.preventDefault()
  globeState.zoom = Math.max(0.72, Math.min(2.2, globeState.zoom * (e.deltaY > 0 ? 0.92 : 1.08)))
  drawGlobe()
}

onMounted(async () => {
  await loadMetrics()
  await nextTick()
  if (!loading.value) { initCharts(); initGlobe() }
  refreshTimer = setInterval(async () => {
    if (!isPageVisible) return
    await loadMetrics()
    await nextTick()
    updateCharts()
    if (globeCanvas.value && !globeState.dragging) { globeState.countryCount = snapshot.value?.clients.byCountry || {}; globeState.totalCount = Object.values(globeState.countryCount).reduce((a: number, b: any) => a + (b as number), 0) as number; drawGlobe() }
  }, 15000)
  loadGeoJson()
  visibilityHandler = () => { isPageVisible = !document.hidden }
  document.addEventListener('visibilitychange', visibilityHandler)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
  if (globeRafId) cancelAnimationFrame(globeRafId)
  chartInstances.forEach(c => c.destroy()); chartInstances = []; chartsInitialized = false
})
</script>

<template>
  <div>
    <div class="section-header">
      <h1 class="section-title"><i class="fa-solid fa-chart-line" style="margin-right:8px;color:#22d3ee"></i>Metrics</h1>
      <span class="badge badge-sm badge-success"><i class="fa-solid fa-circle" style="font-size:6px;margin-right:4px"></i>Live</span>
    </div>

    <div v-if="loading" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading metrics...</div>
    <template v-else-if="snapshot">
      <!-- Stats Row -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(160px,1fr));gap:10px;margin-bottom:20px">
        <div class="card" style="padding:14px">
          <div style="font-size:11px;color:#64748b">Clients</div>
          <div style="font-size:22px;font-weight:700;color:#e2e8f0;font-family:monospace">{{ snapshot.clients.online }}<span style="font-size:13px;color:#64748b">/{{ snapshot.clients.total }}</span></div>
        </div>
        <div class="card" style="padding:14px">
          <div style="font-size:11px;color:#64748b">Uptime</div>
          <div style="font-size:22px;font-weight:700;color:#22c55e;font-family:monospace">{{ formatUptime(snapshot.server.uptime) }}</div>
        </div>
        <div class="card" style="padding:14px">
          <div style="font-size:11px;color:#64748b">Cmd/min</div>
          <div style="font-size:22px;font-weight:700;color:#a78bfa;font-family:monospace">{{ snapshot.commands.lastMinute }}</div>
        </div>
        <div class="card" style="padding:14px">
          <div style="font-size:11px;color:#64748b">Bandwidth</div>
          <div style="font-size:15px;font-weight:600;color:#e2e8f0;font-family:monospace">↑{{ formatBytes(snapshot.bandwidth.sentPerSecond) }}/s</div>
          <div style="font-size:15px;font-weight:600;color:#38bdf8;font-family:monospace">↓{{ formatBytes(snapshot.bandwidth.receivedPerSecond) }}/s</div>
        </div>
        <div class="card" style="padding:14px">
          <div style="font-size:11px;color:#64748b">HTTP</div>
          <div style="font-size:22px;font-weight:700;color:#22d3ee;font-family:monospace">{{ snapshot.http.lastMinute }}<span style="font-size:11px;color:#64748b"> /min</span></div>
          <div v-if="snapshot.http.lastMinuteErrors" style="font-size:11px;color:#ef4444">{{ snapshot.http.lastMinuteErrors }} errors</div>
        </div>
        <div class="card" style="padding:14px">
          <div style="font-size:11px;color:#64748b">CPU</div>
          <div style="font-size:16px;font-weight:600;color:#e2e8f0;font-family:monospace">{{ snapshot.server.cpu?.cores }} cores</div>
          <div style="font-size:12px;color:#94a3b8;font-family:monospace">Load {{ snapshot.server.cpu?.loadAvg?.map((v:number) => v.toFixed(1)).join(' / ') || 'N/A' }}</div>
        </div>
        <div class="card" style="padding:14px">
          <div style="font-size:11px;color:#64748b">Memory</div>
          <div style="font-size:14px;font-weight:600;color:#e2e8f0;font-family:monospace">{{ formatBytes(snapshot.server.memoryUsage?.rss || 0) }}</div>
          <div style="font-size:11px;color:#94a3b8">{{ snapshot.server.systemMemory?.usedPercent?.toFixed(0) || 0 }}% system</div>
        </div>
      </div>

      <!-- Globe + OS -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <!-- Globe -->
        <div class="panel" style="padding:14px;position:relative">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">Client Distribution</h3>
          <div style="position:relative">
            <canvas ref="globeCanvas" width="500" height="320" style="width:100%;border-radius:8px;cursor:grab"></canvas>
            <div v-if="globeTooltip.show" :style="{position:'absolute',left:globeTooltip.x+'px',top:(globeTooltip.y-30)+'px',background:'rgba(2,6,22,0.92)',border:'1px solid rgba(51,65,85,0.6)',borderRadius:'6px',padding:'4px 8px',fontSize:'11px',color:'#e2e8f0',pointerEvents:'none',whiteSpace:'nowrap',transform:'translate(-50%,0)'}">{{ globeTooltip.text }}</div>
            <div style="position:absolute;bottom:6px;left:0;right:0;display:flex;justify-content:center;gap:4px;font-size:9px;color:#475569">
              <span>Low</span>
              <div style="width:80px;height:6px;border-radius:3px;background:linear-gradient(90deg,#22d3ee,#6ee7b7,#fbbf24,#ef4444)"></div>
              <span>High</span>
            </div>
          </div>
        </div>

        <!-- OS Bar -->
        <div class="panel" style="padding:14px">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">Operating Systems</h3>
          <div style="height:300px"><canvas id="chart-os"></canvas></div>
        </div>
      </div>

      <!-- Charts Grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <div class="panel" style="padding:14px">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">Clients Online</h3>
          <div style="height:140px"><canvas id="chart-clients"></canvas></div>
        </div>
        <div class="panel" style="padding:14px">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">Commands / min</h3>
          <div style="height:140px"><canvas id="chart-commands"></canvas></div>
        </div>
        <div class="panel" style="padding:14px">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">Network Throughput</h3>
          <div style="height:140px"><canvas id="chart-bandwidth"></canvas></div>
        </div>
        <div class="panel" style="padding:14px">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">HTTP Requests</h3>
          <div style="height:140px"><canvas id="chart-http-req"></canvas></div>
        </div>
        <div class="panel" style="padding:14px">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">HTTP Latency</h3>
          <div style="height:140px"><canvas id="chart-http-lat"></canvas></div>
        </div>
        <div class="panel" style="padding:14px">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">Runtime Memory</h3>
          <div style="height:140px"><canvas id="chart-memory"></canvas></div>
        </div>
        <div class="panel" style="padding:14px">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">Event Loop Lag</h3>
          <div style="height:140px"><canvas id="chart-evloop"></canvas></div>
        </div>
        <div class="panel" style="padding:14px">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">Active Sessions</h3>
          <div style="height:140px"><canvas id="chart-sessions"></canvas></div>
        </div>
      </div>

      <!-- HTTP Routes Table -->
      <div v-if="snapshot.http.routes?.length" class="panel" style="padding:14px;margin-bottom:20px">
        <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">HTTP Routes (top by P95)</h3>
        <div style="overflow-x:auto">
          <table class="data-table" style="font-size:12px">
            <thead><tr><th>Route</th><th>Reqs/min</th><th>Errors</th><th>Avg</th><th>P95</th><th>P99</th><th>Max</th></tr></thead>
            <tbody>
              <tr v-for="r in snapshot.http.routes" :key="r.route">
                <td style="font-family:monospace;color:#818cf8">{{ r.route }}</td>
                <td>{{ r.countLastMinute }}</td>
                <td :style="{color: r.errorsLastMinute > 0 ? '#ef4444' : '#64748b'}">{{ r.errorsLastMinute }}</td>
                <td>{{ formatMs(r.latencyAvg) }}</td>
                <td>{{ formatMs(r.latencyP95) }}</td>
                <td>{{ formatMs(r.latencyP99) }}</td>
                <td>{{ formatMs(r.latencyMax) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Internal Tasks -->
      <div v-if="snapshot.internal.tasks?.length" class="panel" style="padding:14px">
        <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">Internal Tasks</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
          <div v-for="t in snapshot.internal.tasks" :key="t.task" style="padding:10px;background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.4);border-radius:8px">
            <div style="font-size:12px;color:#e2e8f0;font-weight:500;margin-bottom:4px;font-family:monospace">{{ t.task }}</div>
            <div style="font-size:11px;color:#64748b">Avg: {{ formatMs(t.durationAvg) }} · P95: {{ formatMs(t.durationP95) }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
