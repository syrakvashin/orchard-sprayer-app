import { useEffect, useMemo, useState } from 'react';

const LS_MEASUREMENTS = 'sprayer_measurements_v3';
const LS_BLOCKS = 'sprayer_blocks_v3';
const LS_WEATHER = 'sprayer_weather_v1';

const defaultMeasurements = [
  { pressure: 3, flow: 0.635 },
  { pressure: 4, flow: 0.75 },
  { pressure: 5, flow: 0.86 },
  { pressure: 6, flow: 1.0 },
  { pressure: 7, flow: 1.074 },
  { pressure: 8, flow: 1.152 },
  { pressure: 9, flow: 1.25 },
  { pressure: 10, flow: 1.313 },
  { pressure: 11, flow: 1.359 },
  { pressure: 12, flow: 1.463 },
  { pressure: 15, flow: 1.641 },
];

const defaultBlocks = [
  { id: uid(), name: '0 Яблоня около навеса', culture: 'Яблоня', year: '2023', rows: '73', scheme: '4 × 1 м', quantity: '17380', area: '7.5' },
  { id: uid(), name: '1 Слива около базы', culture: 'Слива', year: '2023', rows: '102', scheme: '4,5 × 3 м', quantity: '16040', area: '23.4' },
  { id: uid(), name: '2 Яблоня около деревни', culture: 'Яблоня', year: '2023', rows: '85', scheme: '4 × 1 м', quantity: '11880', area: '5.1' },
  { id: uid(), name: '3 Яблоня между сливой и берез', culture: 'Яблоня', year: '2023', rows: '25', scheme: '4 × 1 м', quantity: '10040', area: '5.2' },
  { id: uid(), name: '4 Слива за березами', culture: 'Слива', year: '2024', rows: '58', scheme: '4,5 × 3 м', quantity: '11600', area: '19.1' },
  { id: uid(), name: '5 Яблоня за дорогой 2023', culture: 'Яблоня', year: '2023', rows: '49', scheme: '4 × 1 м', quantity: '16050', area: '7.9' },
  { id: uid(), name: '5 Яблоня за дорогой 2025', culture: 'Яблоня', year: '2025', rows: '', scheme: '4 × 1 м', quantity: '26500', area: '10' },
];

const defaultWeatherSettings = {
  mode: 'coords',
  city: '',
  lat: '53.414120',
  lon: '24.678197',
  label: '53.414120, 24.678197',
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return Number(String(value).replace(',', '.').replace(/\s/g, ''));
}

function formatNum(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

function sortMeasurements(list) {
  return [...list]
    .map((item) => ({ pressure: toNumber(item.pressure), flow: toNumber(item.flow) }))
    .filter((item) => Number.isFinite(item.pressure) && Number.isFinite(item.flow) && item.pressure > 0 && item.flow > 0)
    .sort((a, b) => a.flow - b.flow);
}

function parseSpacingFromScheme(scheme) {
  const text = String(scheme || '').replace(/,/g, '.');
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : NaN;
}

function interpolatePressure(targetFlow, measurements) {
  const rows = sortMeasurements(measurements);
  if (rows.length < 2 || !Number.isFinite(targetFlow) || targetFlow <= 0) {
    return { status: 'Недостаточно данных', pressure: null, lower: null, upper: null };
  }
  if (targetFlow < rows[0].flow) {
    return { status: 'Ниже диапазона таблицы', pressure: null, lower: rows[0], upper: rows[1] };
  }
  if (targetFlow > rows[rows.length - 1].flow) {
    return { status: 'Выше диапазона таблицы', pressure: null, lower: rows[rows.length - 2], upper: rows[rows.length - 1] };
  }
  for (let i = 0; i < rows.length - 1; i += 1) {
    const lower = rows[i];
    const upper = rows[i + 1];
    if (targetFlow === lower.flow) {
      return { status: 'Точное совпадение', pressure: lower.pressure, lower, upper: lower };
    }
    if (targetFlow >= lower.flow && targetFlow <= upper.flow) {
      const ratio = (targetFlow - lower.flow) / (upper.flow - lower.flow);
      const pressure = lower.pressure + ratio * (upper.pressure - lower.pressure);
      return { status: 'В пределах таблицы', pressure, lower, upper };
    }
  }
  return { status: 'Ошибка расчёта', pressure: null, lower: null, upper: null };
}

function weatherCodeToText(code) {
  const map = {
    0: 'Ясно',
    1: 'Преимущественно ясно',
    2: 'Переменная облачность',
    3: 'Пасмурно',
    45: 'Туман',
    48: 'Туман с инеем',
    51: 'Слабая морось',
    53: 'Морось',
    55: 'Сильная морось',
    61: 'Слабый дождь',
    63: 'Дождь',
    65: 'Сильный дождь',
    71: 'Слабый снег',
    73: 'Снег',
    75: 'Сильный снег',
    80: 'Ливень',
    81: 'Ливень',
    82: 'Сильный ливень',
    95: 'Гроза',
    96: 'Гроза с градом',
    99: 'Сильная гроза',
  };
  return map[code] || 'Без уточнения';
}

function dayLabel(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
}

function calcForecastUrl(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: 'auto',
    forecast_days: '7',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function calcGeocodeUrl(city) {
  const params = new URLSearchParams({ name: city, count: '1', language: 'ru', format: 'json' });
  return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

export default function App() {
  const [activeView, setActiveView] = useState('calc');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState('measurements');

  const [measurements, setMeasurements] = useState(defaultMeasurements);
  const [blocks, setBlocks] = useState(defaultBlocks);
  const [weatherSettings, setWeatherSettings] = useState(defaultWeatherSettings);

  const [calcMode, setCalcMode] = useState('block');
  const [selectedBlockId, setSelectedBlockId] = useState(defaultBlocks[0].id);
  const [manualCulture, setManualCulture] = useState('Яблоня');
  const [manualArea, setManualArea] = useState('7.5');
  const [manualSpacing, setManualSpacing] = useState('4');
  const [norm, setNorm] = useState('400');
  const [speed, setSpeed] = useState('8');
  const [nozzles, setNozzles] = useState('14');
  const [tankVolume, setTankVolume] = useState('3000');

  const [newMeasurement, setNewMeasurement] = useState({ pressure: '', flow: '' });

  const emptyBlockForm = {
    id: '',
    name: '',
    culture: 'Яблоня',
    year: '',
    rows: '',
    scheme: '4 × 1 м',
    quantity: '',
    area: '',
  };
  const [blockForm, setBlockForm] = useState(emptyBlockForm);
  const [editingBlockId, setEditingBlockId] = useState('');

  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [weatherData, setWeatherData] = useState(null);

  useEffect(() => {
    try {
      const savedMeasurements = JSON.parse(localStorage.getItem(LS_MEASUREMENTS) || 'null');
      const savedBlocks = JSON.parse(localStorage.getItem(LS_BLOCKS) || 'null');
      const savedWeather = JSON.parse(localStorage.getItem(LS_WEATHER) || 'null');
      if (Array.isArray(savedMeasurements) && savedMeasurements.length) setMeasurements(savedMeasurements);
      if (Array.isArray(savedBlocks) && savedBlocks.length) {
        setBlocks(savedBlocks);
        setSelectedBlockId(savedBlocks[0].id);
      }
      if (savedWeather && typeof savedWeather === 'object') setWeatherSettings({ ...defaultWeatherSettings, ...savedWeather });
    } catch {
      // ignore broken localStorage
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_MEASUREMENTS, JSON.stringify(measurements));
  }, [measurements]);

  useEffect(() => {
    localStorage.setItem(LS_BLOCKS, JSON.stringify(blocks));
  }, [blocks]);

  useEffect(() => {
    localStorage.setItem(LS_WEATHER, JSON.stringify(weatherSettings));
  }, [weatherSettings]);

  const selectedBlock = useMemo(() => blocks.find((item) => item.id === selectedBlockId) || null, [blocks, selectedBlockId]);

  const calcCulture = calcMode === 'block' ? (selectedBlock?.culture || '') : manualCulture;
  const calcArea = calcMode === 'block' ? toNumber(selectedBlock?.area) : toNumber(manualArea);
  const calcSpacing = calcMode === 'block' ? parseSpacingFromScheme(selectedBlock?.scheme) : toNumber(manualSpacing);

  const totalLiters = useMemo(() => toNumber(norm) * calcArea, [norm, calcArea]);
  const totalFlow = useMemo(() => {
    const n = toNumber(norm);
    const s = toNumber(speed);
    const sp = calcSpacing;
    if (![n, s, sp].every(Number.isFinite) || s <= 0 || sp <= 0) return NaN;
    return (n * s * sp) / 600;
  }, [norm, speed, calcSpacing]);
  const flowPerNozzle = useMemo(() => {
    const q = totalFlow;
    const count = toNumber(nozzles);
    if (![q, count].every(Number.isFinite) || count <= 0) return NaN;
    return q / count;
  }, [totalFlow, nozzles]);
  const pressureResult = useMemo(() => interpolatePressure(flowPerNozzle, measurements), [flowPerNozzle, measurements]);
  const tanksNeeded = useMemo(() => {
    const tank = toNumber(tankVolume);
    if (![tank, totalLiters].every(Number.isFinite) || tank <= 0) return NaN;
    return totalLiters / tank;
  }, [tankVolume, totalLiters]);

  async function loadWeather(forceMode) {
    const mode = forceMode || weatherSettings.mode;
    setWeatherLoading(true);
    setWeatherError('');
    try {
      let lat = toNumber(weatherSettings.lat);
      let lon = toNumber(weatherSettings.lon);
      let label = weatherSettings.label;

      if (mode === 'city') {
        const city = weatherSettings.city.trim();
        if (!city) throw new Error('Введи город или населённый пункт');
        const geoResp = await fetch(calcGeocodeUrl(city));
        if (!geoResp.ok) throw new Error('Не удалось найти город');
        const geoData = await geoResp.json();
        const place = geoData?.results?.[0];
        if (!place) throw new Error('Город не найден');
        lat = place.latitude;
        lon = place.longitude;
        label = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
        setWeatherSettings((prev) => ({ ...prev, lat: String(lat), lon: String(lon), label }));
      } else {
        if (![lat, lon].every(Number.isFinite)) throw new Error('Проверь координаты');
        label = `${weatherSettings.lat}, ${weatherSettings.lon}`;
        setWeatherSettings((prev) => ({ ...prev, label }));
      }

      const weatherResp = await fetch(calcForecastUrl(lat, lon));
      if (!weatherResp.ok) throw new Error('Не удалось получить погоду');
      const weatherJson = await weatherResp.json();
      setWeatherData(weatherJson);
    } catch (error) {
      setWeatherError(error.message || 'Ошибка загрузки погоды');
    } finally {
      setWeatherLoading(false);
    }
  }

  useEffect(() => {
    loadWeather(weatherSettings.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weatherRows = useMemo(() => {
    if (!weatherData?.daily) return [];
    const daily = weatherData.daily;
    return daily.time.map((date, index) => ({
      date,
      label: dayLabel(date),
      code: daily.weather_code[index],
      tMax: daily.temperature_2m_max[index],
      tMin: daily.temperature_2m_min[index],
      rain: daily.precipitation_sum[index],
      rainChance: daily.precipitation_probability_max[index],
      wind: daily.wind_speed_10m_max[index],
    }));
  }, [weatherData]);

  function addMeasurement() {
    const pressure = toNumber(newMeasurement.pressure);
    const flow = toNumber(newMeasurement.flow);
    if (!Number.isFinite(pressure) || !Number.isFinite(flow) || pressure <= 0 || flow <= 0) return;
    setMeasurements((prev) => sortMeasurements([...prev, { pressure, flow }]));
    setNewMeasurement({ pressure: '', flow: '' });
  }

  function removeMeasurement(index) {
    setMeasurements((prev) => prev.filter((_, i) => i !== index));
  }

  function startEditBlock(block) {
    setDrawerView('blocks');
    setDrawerOpen(true);
    setEditingBlockId(block.id);
    setBlockForm({ ...block });
  }

  function saveBlock() {
    if (!blockForm.name.trim()) return;
    const nextBlock = {
      ...blockForm,
      name: blockForm.name.trim(),
      id: editingBlockId || uid(),
    };
    if (editingBlockId) {
      setBlocks((prev) => prev.map((item) => (item.id === editingBlockId ? nextBlock : item)));
    } else {
      setBlocks((prev) => [...prev, nextBlock]);
      setSelectedBlockId(nextBlock.id);
    }
    setEditingBlockId('');
    setBlockForm(emptyBlockForm);
  }

  function removeBlock(id) {
    const next = blocks.filter((item) => item.id !== id);
    setBlocks(next);
    if (selectedBlockId === id && next.length) setSelectedBlockId(next[0].id);
  }

  function resetBlockForm() {
    setEditingBlockId('');
    setBlockForm(emptyBlockForm);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Калькулятор опрыскивателя</div>
        <div className="top-actions">
          <button className={`tab-btn ${activeView === 'calc' ? 'active' : ''}`} onClick={() => setActiveView('calc')}>Расчёт</button>
          <button className={`tab-btn ${activeView === 'weather' ? 'active' : ''}`} onClick={() => setActiveView('weather')}>Погода</button>
          <button className="menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Открыть меню">☰</button>
        </div>
      </header>

      <main className="page">
        {activeView === 'calc' && (
          <section className="grid-two">
            <div className="card">
              <h2>Ввод данных</h2>
              <div className="mode-switch">
                <button className={calcMode === 'block' ? 'active' : ''} onClick={() => setCalcMode('block')}>Из участка</button>
                <button className={calcMode === 'manual' ? 'active' : ''} onClick={() => setCalcMode('manual')}>Вручную</button>
              </div>

              {calcMode === 'block' ? (
                <div className="form-grid">
                  <label>
                    <span>Участок</span>
                    <select value={selectedBlockId} onChange={(e) => setSelectedBlockId(e.target.value)}>
                      {blocks.map((block) => (
                        <option key={block.id} value={block.id}>{block.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Культура</span>
                    <input value={selectedBlock?.culture || ''} readOnly />
                  </label>
                  <label>
                    <span>Площадь, га</span>
                    <input value={selectedBlock?.area || ''} readOnly />
                  </label>
                  <label>
                    <span>Междурядье, м</span>
                    <input value={Number.isFinite(calcSpacing) ? calcSpacing : ''} readOnly />
                  </label>
                </div>
              ) : (
                <div className="form-grid">
                  <label>
                    <span>Культура</span>
                    <select value={manualCulture} onChange={(e) => setManualCulture(e.target.value)}>
                      <option>Яблоня</option>
                      <option>Слива</option>
                      <option>Груша</option>
                      <option>Черешня</option>
                      <option>Другое</option>
                    </select>
                  </label>
                  <label>
                    <span>Площадь, га</span>
                    <input value={manualArea} onChange={(e) => setManualArea(e.target.value)} />
                  </label>
                  <label>
                    <span>Междурядье, м</span>
                    <input value={manualSpacing} onChange={(e) => setManualSpacing(e.target.value)} />
                  </label>
                </div>
              )}

              <div className="form-grid form-grid-3">
                <label>
                  <span>Норма вылива, л/га</span>
                  <input value={norm} onChange={(e) => setNorm(e.target.value)} />
                </label>
                <label>
                  <span>Скорость, км/ч</span>
                  <input value={speed} onChange={(e) => setSpeed(e.target.value)} />
                </label>
                <label>
                  <span>Форсунок, шт</span>
                  <input value={nozzles} onChange={(e) => setNozzles(e.target.value)} />
                </label>
                <label>
                  <span>Бак, л</span>
                  <input value={tankVolume} onChange={(e) => setTankVolume(e.target.value)} />
                </label>
                <label>
                  <span>Культура</span>
                  <input value={calcCulture} readOnly />
                </label>
                <label>
                  <span>Площадь, га</span>
                  <input value={Number.isFinite(calcArea) ? calcArea : ''} readOnly />
                </label>
              </div>
            </div>

            <div className="card">
              <h2>Результат</h2>
              <div className="result-grid">
                <div className="result-box"><small>Нужно рабочей жидкости</small><strong>{formatNum(totalLiters, 0)} л</strong></div>
                <div className="result-box"><small>Нужно баков</small><strong>{formatNum(tanksNeeded, 2)}</strong></div>
                <div className="result-box"><small>Общий расход</small><strong>{formatNum(totalFlow, 3)} л/мин</strong></div>
                <div className="result-box"><small>На 1 форсунку</small><strong>{formatNum(flowPerNozzle, 3)} л/мин</strong></div>
              </div>
              <div className="pressure-box">
                <div className="pressure-header">
                  <span>Расчётное давление</span>
                  <span className="status-pill">{pressureResult.status}</span>
                </div>
                <div className="pressure-value">{pressureResult.pressure ? `${formatNum(pressureResult.pressure, 2)} бар` : '—'}</div>
                <div className="hint">Нижняя точка: {pressureResult.lower ? `${formatNum(pressureResult.lower.flow, 3)} л/мин при ${formatNum(pressureResult.lower.pressure, 0)} бар` : '—'}</div>
                <div className="hint">Верхняя точка: {pressureResult.upper ? `${formatNum(pressureResult.upper.flow, 3)} л/мин при ${formatNum(pressureResult.upper.pressure, 0)} бар` : '—'}</div>
              </div>
            </div>
          </section>
        )}

        {activeView === 'weather' && (
          <section className="card weather-card">
            <div className="weather-top">
              <h2>Погода на 7 дней</h2>
              <div className="mode-switch compact">
                <button className={weatherSettings.mode === 'coords' ? 'active' : ''} onClick={() => setWeatherSettings((prev) => ({ ...prev, mode: 'coords' }))}>По координатам</button>
                <button className={weatherSettings.mode === 'city' ? 'active' : ''} onClick={() => setWeatherSettings((prev) => ({ ...prev, mode: 'city' }))}>По городу</button>
              </div>
            </div>

            {weatherSettings.mode === 'coords' ? (
              <div className="form-grid form-grid-3">
                <label>
                  <span>Широта</span>
                  <input value={weatherSettings.lat} onChange={(e) => setWeatherSettings((prev) => ({ ...prev, lat: e.target.value }))} />
                </label>
                <label>
                  <span>Долгота</span>
                  <input value={weatherSettings.lon} onChange={(e) => setWeatherSettings((prev) => ({ ...prev, lon: e.target.value }))} />
                </label>
                <div className="button-cell">
                  <button className="primary-btn" onClick={() => loadWeather('coords')} disabled={weatherLoading}>Обновить</button>
                </div>
              </div>
            ) : (
              <div className="form-grid form-grid-3">
                <label className="span-2">
                  <span>Город или населённый пункт</span>
                  <input value={weatherSettings.city} onChange={(e) => setWeatherSettings((prev) => ({ ...prev, city: e.target.value }))} placeholder="Например, Мосты" />
                </label>
                <div className="button-cell">
                  <button className="primary-btn" onClick={() => loadWeather('city')} disabled={weatherLoading}>Обновить</button>
                </div>
              </div>
            )}

            <div className="weather-place">Место: {weatherSettings.label || '—'}</div>
            {weatherError && <div className="error-box">{weatherError}</div>}
            {weatherLoading && <div className="hint">Загрузка погоды...</div>}

            <div className="weather-list">
              {weatherRows.map((row) => (
                <div className="weather-row" key={row.date}>
                  <div><strong>{row.label}</strong><small>{weatherCodeToText(row.code)}</small></div>
                  <div><strong>{formatNum(row.tMax, 0)}° / {formatNum(row.tMin, 0)}°</strong><small>день / ночь</small></div>
                  <div><strong>{formatNum(row.rain, 1)} мм</strong><small>осадки</small></div>
                  <div><strong>{formatNum(row.rainChance, 0)}%</strong><small>вероятность дождя</small></div>
                  <div><strong>{formatNum(row.wind, 0)} км/ч</strong><small>ветер</small></div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <div className={`drawer-backdrop ${drawerOpen ? 'show' : ''}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <strong>Справочники</strong>
          <button className="close-btn" onClick={() => setDrawerOpen(false)}>×</button>
        </div>
        <div className="drawer-tabs">
          <button className={drawerView === 'measurements' ? 'active' : ''} onClick={() => setDrawerView('measurements')}>Замеры форсунки</button>
          <button className={drawerView === 'blocks' ? 'active' : ''} onClick={() => setDrawerView('blocks')}>Участки сада</button>
        </div>

        {drawerView === 'measurements' && (
          <div className="drawer-content">
            <div className="form-grid form-grid-2">
              <label>
                <span>Давление, бар</span>
                <input value={newMeasurement.pressure} onChange={(e) => setNewMeasurement((prev) => ({ ...prev, pressure: e.target.value }))} />
              </label>
              <label>
                <span>Вылив, л/мин</span>
                <input value={newMeasurement.flow} onChange={(e) => setNewMeasurement((prev) => ({ ...prev, flow: e.target.value }))} />
              </label>
            </div>
            <button className="primary-btn full" onClick={addMeasurement}>Добавить замер</button>
            <div className="simple-table">
              {sortMeasurements(measurements).map((row, index) => (
                <div className="table-row" key={`${row.pressure}-${row.flow}-${index}`}>
                  <span>{formatNum(row.pressure, 0)} бар</span>
                  <span>{formatNum(row.flow, 3)} л/мин</span>
                  <button className="danger-text" onClick={() => removeMeasurement(index)}>Удалить</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {drawerView === 'blocks' && (
          <div className="drawer-content">
            <div className="form-grid form-grid-2">
              <label className="span-2">
                <span>Название участка</span>
                <input value={blockForm.name} onChange={(e) => setBlockForm((prev) => ({ ...prev, name: e.target.value }))} />
              </label>
              <label>
                <span>Культура</span>
                <select value={blockForm.culture} onChange={(e) => setBlockForm((prev) => ({ ...prev, culture: e.target.value }))}>
                  <option>Яблоня</option>
                  <option>Слива</option>
                  <option>Груша</option>
                  <option>Черешня</option>
                  <option>Другое</option>
                </select>
              </label>
              <label>
                <span>Год</span>
                <input value={blockForm.year} onChange={(e) => setBlockForm((prev) => ({ ...prev, year: e.target.value }))} />
              </label>
              <label>
                <span>Рядов</span>
                <input value={blockForm.rows} onChange={(e) => setBlockForm((prev) => ({ ...prev, rows: e.target.value }))} />
              </label>
              <label>
                <span>Схема посадки</span>
                <input value={blockForm.scheme} onChange={(e) => setBlockForm((prev) => ({ ...prev, scheme: e.target.value }))} />
              </label>
              <label>
                <span>Количество, шт</span>
                <input value={blockForm.quantity} onChange={(e) => setBlockForm((prev) => ({ ...prev, quantity: e.target.value }))} />
              </label>
              <label>
                <span>Площадь, га</span>
                <input value={blockForm.area} onChange={(e) => setBlockForm((prev) => ({ ...prev, area: e.target.value }))} />
              </label>
            </div>
            <div className="action-row">
              <button className="primary-btn" onClick={saveBlock}>{editingBlockId ? 'Сохранить изменения' : 'Добавить участок'}</button>
              <button className="ghost-btn" onClick={resetBlockForm}>Очистить</button>
            </div>
            <div className="blocks-list">
              {blocks.map((block) => (
                <div className="block-card" key={block.id}>
                  <div className="block-title">{block.name}</div>
                  <div className="block-meta">{block.culture} · {block.year || '—'} · {block.scheme} · {block.area} га</div>
                  <div className="block-meta">Рядов: {block.rows || '—'} · Кол-во: {block.quantity || '—'}</div>
                  <div className="action-row small">
                    <button className="ghost-btn" onClick={() => startEditBlock(block)}>Изменить</button>
                    <button className="danger-text" onClick={() => removeBlock(block.id)}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
