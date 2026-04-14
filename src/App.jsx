import React, { useEffect, useMemo, useState } from 'react';

const DEFAULT_MEASUREMENTS = [
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

const DEFAULT_BLOCKS = [
  { id: 1, name: 'Яблоня около навеса 0', culture: 'Яблоня', year: 2023, rows: 73, scheme: '4 × 1 м', treeCount: 17380, area: 7.5, spacing: 4 },
  { id: 2, name: 'Слива около базы 1', culture: 'Слива', year: 2023, rows: 102, scheme: '4,5 × 3 м', treeCount: 16040, area: 23.4, spacing: 4.5 },
  { id: 3, name: 'Яблоня около деревни 2', culture: 'Яблоня', year: 2023, rows: 85, scheme: '4 × 1 м', treeCount: 11880, area: 5.1, spacing: 4 },
  { id: 4, name: 'Яблоня между сливой и берез', culture: 'Яблоня', year: 2023, rows: 25, scheme: '4 × 1 м', treeCount: 10040, area: 5.2, spacing: 4 },
  { id: 5, name: 'Слива за березами', culture: 'Слива', year: 2024, rows: 58, scheme: '4,5 × 3 м', treeCount: 11600, area: 19.1, spacing: 4.5 },
  { id: 6, name: 'Яблоня за дорогой 2023', culture: 'Яблоня', year: 2023, rows: 49, scheme: '4 × 1 м', treeCount: 16050, area: 7.9, spacing: 4 },
  { id: 7, name: 'Яблоня за дорогой 2025', culture: 'Яблоня', year: 2025, rows: '', scheme: '4 × 1 м', treeCount: 26500, area: 10, spacing: 4 },
];

const LS_MEASUREMENTS = 'sprayer_measurements_v1';
const LS_BLOCKS = 'sprayer_blocks_v2';

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return '—';
  return Number(value).toFixed(digits);
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return Number(String(value).replace(',', '.').replace(/\s/g, ''));
}

function parseSpacingFromScheme(scheme) {
  if (!scheme) return NaN;
  const match = String(scheme).replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function sortMeasurements(list) {
  return [...list]
    .filter((item) => Number.isFinite(item.pressure) && Number.isFinite(item.flow) && item.pressure > 0 && item.flow > 0)
    .sort((a, b) => a.flow - b.flow);
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
    return {
      status: 'Выше диапазона таблицы',
      pressure: null,
      lower: rows[rows.length - 2],
      upper: rows[rows.length - 1],
    };
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

const EMPTY_BLOCK_FORM = {
  id: null,
  name: '',
  culture: 'Яблоня',
  year: '',
  rows: '',
  scheme: '4 × 1 м',
  treeCount: '',
  area: '',
};

export default function App() {
  const [tab, setTab] = useState('calc');
  const [measurements, setMeasurements] = useState(DEFAULT_MEASUREMENTS);
  const [blocks, setBlocks] = useState(DEFAULT_BLOCKS);

  const [calcMode, setCalcMode] = useState('block');
  const [selectedBlockId, setSelectedBlockId] = useState(DEFAULT_BLOCKS[0].id);
  const [manualCulture, setManualCulture] = useState('Яблоня');
  const [manualArea, setManualArea] = useState('');

  const [norm, setNorm] = useState(400);
  const [speed, setSpeed] = useState(8);
  const [spacing, setSpacing] = useState(4);
  const [nozzles, setNozzles] = useState(14);
  const [tankVolume, setTankVolume] = useState(3000);

  const [newPressure, setNewPressure] = useState('');
  const [newFlow, setNewFlow] = useState('');
  const [blockForm, setBlockForm] = useState(EMPTY_BLOCK_FORM);
  const [editingBlockId, setEditingBlockId] = useState(null);

  useEffect(() => {
    try {
      const savedMeasurements = localStorage.getItem(LS_MEASUREMENTS);
      const savedBlocks = localStorage.getItem(LS_BLOCKS);

      if (savedMeasurements) {
        const parsed = JSON.parse(savedMeasurements);
        if (Array.isArray(parsed) && parsed.length) setMeasurements(parsed);
      }

      if (savedBlocks) {
        const parsed = JSON.parse(savedBlocks);
        if (Array.isArray(parsed) && parsed.length) {
          setBlocks(parsed);
          setSelectedBlockId(parsed[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const currentBlock = useMemo(() => blocks.find((block) => block.id === selectedBlockId) || null, [blocks, selectedBlockId]);

  useEffect(() => {
    if (calcMode === 'block' && currentBlock?.spacing) {
      setSpacing(currentBlock.spacing);
    }
  }, [calcMode, currentBlock]);

  const effectiveCulture = calcMode === 'block' ? currentBlock?.culture || '' : manualCulture;
  const effectiveArea = calcMode === 'block' ? parseNumber(currentBlock?.area) : parseNumber(manualArea);

  const totalLiters = useMemo(() => {
    const n = parseNumber(norm);
    if (!Number.isFinite(n) || !Number.isFinite(effectiveArea)) return 0;
    return n * effectiveArea;
  }, [effectiveArea, norm]);

  const totalFlow = useMemo(() => {
    const n = parseNumber(norm);
    const s = parseNumber(speed);
    const m = parseNumber(spacing);
    if (![n, s, m].every(Number.isFinite) || s <= 0 || m <= 0) return 0;
    return (n * s * m) / 600;
  }, [norm, speed, spacing]);

  const flowPerNozzle = useMemo(() => {
    const q = parseNumber(totalFlow);
    const count = parseNumber(nozzles);
    if (!Number.isFinite(q) || !Number.isFinite(count) || count <= 0) return 0;
    return q / count;
  }, [totalFlow, nozzles]);

  const pressureResult = useMemo(() => interpolatePressure(flowPerNozzle, measurements), [flowPerNozzle, measurements]);

  const tanksNeeded = useMemo(() => {
    const volume = parseNumber(tankVolume);
    if (!Number.isFinite(volume) || volume <= 0) return 0;
    return totalLiters / volume;
  }, [tankVolume, totalLiters]);

  const sortedMeasurements = useMemo(() => sortMeasurements(measurements), [measurements]);

  function saveMeasurements() {
    localStorage.setItem(LS_MEASUREMENTS, JSON.stringify(measurements));
    alert('Замеры сохранены в браузере.');
  }

  function resetMeasurements() {
    setMeasurements(DEFAULT_MEASUREMENTS);
    localStorage.setItem(LS_MEASUREMENTS, JSON.stringify(DEFAULT_MEASUREMENTS));
  }

  function addMeasurement() {
    const pressure = parseNumber(newPressure);
    const flow = parseNumber(newFlow);
    if (!Number.isFinite(pressure) || !Number.isFinite(flow) || pressure <= 0 || flow <= 0) return;
    setMeasurements(sortMeasurements([...measurements, { pressure, flow }]));
    setNewPressure('');
    setNewFlow('');
  }

  function removeMeasurement(index) {
    setMeasurements(measurements.filter((_, i) => i !== index));
  }

  function saveBlocks() {
    localStorage.setItem(LS_BLOCKS, JSON.stringify(blocks));
    alert('Участки сохранены в браузере.');
  }

  function resetBlocks() {
    setBlocks(DEFAULT_BLOCKS);
    setSelectedBlockId(DEFAULT_BLOCKS[0].id);
    setEditingBlockId(null);
    setBlockForm(EMPTY_BLOCK_FORM);
    localStorage.setItem(LS_BLOCKS, JSON.stringify(DEFAULT_BLOCKS));
  }

  function updateBlockForm(field, value) {
    setBlockForm((prev) => ({ ...prev, [field]: value }));
  }

  function clearBlockForm() {
    setBlockForm(EMPTY_BLOCK_FORM);
    setEditingBlockId(null);
  }

  function addOrUpdateBlock() {
    const name = String(blockForm.name).trim();
    const area = parseNumber(blockForm.area);
    const spacingFromScheme = parseSpacingFromScheme(blockForm.scheme);
    const year = blockForm.year === '' ? '' : parseNumber(blockForm.year);
    const rows = blockForm.rows === '' ? '' : parseNumber(blockForm.rows);
    const treeCount = blockForm.treeCount === '' ? '' : parseNumber(blockForm.treeCount);

    if (!name || !Number.isFinite(area) || area <= 0 || !Number.isFinite(spacingFromScheme) || spacingFromScheme <= 0) return;

    const prepared = {
      id: editingBlockId || Date.now(),
      name,
      culture: blockForm.culture,
      year: Number.isFinite(year) ? year : '',
      rows: Number.isFinite(rows) ? rows : '',
      scheme: blockForm.scheme,
      treeCount: Number.isFinite(treeCount) ? treeCount : '',
      area,
      spacing: spacingFromScheme,
    };

    if (editingBlockId) {
      const next = blocks.map((block) => (block.id === editingBlockId ? prepared : block));
      setBlocks(next);
      if (selectedBlockId === editingBlockId) setSelectedBlockId(prepared.id);
    } else {
      const next = [...blocks, prepared];
      setBlocks(next);
      setSelectedBlockId(prepared.id);
    }

    clearBlockForm();
  }

  function startEditBlock(block) {
    setEditingBlockId(block.id);
    setBlockForm({
      id: block.id,
      name: block.name,
      culture: block.culture,
      year: block.year,
      rows: block.rows,
      scheme: block.scheme,
      treeCount: block.treeCount,
      area: block.area,
    });
  }

  function removeBlock(id) {
    const next = blocks.filter((block) => block.id !== id);
    setBlocks(next);
    if (selectedBlockId === id && next.length) setSelectedBlockId(next[0].id);
    if (editingBlockId === id) clearBlockForm();
  }

  return (
    <div className="app-shell">
      <div className="container">
        <header className="page-header">
          <h1>Калькулятор опрыскивателя</h1>
          <p>Есть отдельная страница для расчёта, замеров форсунки и участков сада.</p>
        </header>

        <nav className="tabs">
          <button className={tab === 'calc' ? 'tab active' : 'tab'} onClick={() => setTab('calc')}>Расчёт</button>
          <button className={tab === 'measurements' ? 'tab active' : 'tab'} onClick={() => setTab('measurements')}>Замеры форсунки</button>
          <button className={tab === 'blocks' ? 'tab active' : 'tab'} onClick={() => setTab('blocks')}>Участки сада</button>
        </nav>

        {tab === 'calc' && (
          <section className="grid two-columns">
            <article className="card">
              <h2>Ввод данных</h2>

              <div className="mode-switch">
                <button className={calcMode === 'block' ? 'tab active' : 'tab'} onClick={() => setCalcMode('block')}>Из участка</button>
                <button className={calcMode === 'manual' ? 'tab active' : 'tab'} onClick={() => setCalcMode('manual')}>Вручную</button>
              </div>

              {calcMode === 'block' ? (
                <>
                  <label>
                    <span>Участок</span>
                    <select value={selectedBlockId} onChange={(e) => setSelectedBlockId(Number(e.target.value))}>
                      {blocks.map((block) => (
                        <option key={block.id} value={block.id}>{block.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid two-small-columns">
                    <label>
                      <span>Культура</span>
                      <input value={effectiveCulture} readOnly />
                    </label>
                    <label>
                      <span>Площадь, га</span>
                      <input value={currentBlock?.area || ''} readOnly />
                    </label>
                  </div>
                </>
              ) : (
                <div className="grid two-small-columns">
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
                    <input value={manualArea} onChange={(e) => setManualArea(e.target.value)} placeholder="Например 7,5" />
                  </label>
                </div>
              )}

              <div className="grid two-small-columns">
                <label>
                  <span>Норма вылива, л/га</span>
                  <input type="number" value={norm} onChange={(e) => setNorm(e.target.value)} />
                </label>
                <label>
                  <span>Скорость, км/ч</span>
                  <input type="number" value={speed} onChange={(e) => setSpeed(e.target.value)} />
                </label>
              </div>

              <div className="grid three-small-columns">
                <label>
                  <span>Междурядье, м</span>
                  <input type="number" value={spacing} onChange={(e) => setSpacing(e.target.value)} />
                </label>
                <label>
                  <span>Форсунок, шт</span>
                  <input type="number" value={nozzles} onChange={(e) => setNozzles(e.target.value)} />
                </label>
                <label>
                  <span>Бак, л</span>
                  <input type="number" value={tankVolume} onChange={(e) => setTankVolume(e.target.value)} />
                </label>
              </div>
            </article>

            <article className="card">
              <h2>Результат</h2>

              <div className="stats-grid">
                <div className="stat-box">
                  <div className="stat-label">Культура</div>
                  <div className="stat-value stat-text">{effectiveCulture || '—'}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Площадь</div>
                  <div className="stat-value">{Number.isFinite(effectiveArea) ? `${round(effectiveArea, 2)} га` : '—'}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Нужно рабочей жидкости</div>
                  <div className="stat-value">{round(totalLiters, 0)} л</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Нужно баков</div>
                  <div className="stat-value">{round(tanksNeeded, 2)}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Общий расход</div>
                  <div className="stat-value">{round(totalFlow, 3)} л/мин</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">На 1 форсунку</div>
                  <div className="stat-value">{round(flowPerNozzle, 3)} л/мин</div>
                </div>
              </div>

              <div className="pressure-box">
                <div className="pressure-head">
                  <div className="stat-label">Расчётное давление</div>
                  <span className="status-badge">{pressureResult.status}</span>
                </div>
                <div className="pressure-value">{pressureResult.pressure ? `${round(pressureResult.pressure, 2)} бар` : '—'}</div>
                <div className="hint">Нижняя точка: {pressureResult.lower ? `${pressureResult.lower.flow} л/мин при ${pressureResult.lower.pressure} бар` : '—'}</div>
                <div className="hint">Верхняя точка: {pressureResult.upper ? `${pressureResult.upper.flow} л/мин при ${pressureResult.upper.pressure} бар` : '—'}</div>
              </div>
            </article>
          </section>
        )}

        {tab === 'measurements' && (
          <section className="card">
            <div className="card-head-row">
              <div>
                <h2>Свои замеры вылива форсунки</h2>
                <p className="muted">Тут вносишь свои значения. Они сохраняются в браузере телефона.</p>
              </div>
              <div className="button-row">
                <button className="secondary" onClick={resetMeasurements}>Сбросить</button>
                <button onClick={saveMeasurements}>Сохранить</button>
              </div>
            </div>

            <div className="grid three-small-columns add-row">
              <label>
                <span>Давление, бар</span>
                <input value={newPressure} onChange={(e) => setNewPressure(e.target.value)} placeholder="например 10" />
              </label>
              <label>
                <span>Вылив, л/мин</span>
                <input value={newFlow} onChange={(e) => setNewFlow(e.target.value)} placeholder="например 1.313" />
              </label>
              <div className="button-wrap">
                <button onClick={addMeasurement}>Добавить строку</button>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Давление, бар</th>
                    <th>Вылив, л/мин</th>
                    <th>Удалить</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMeasurements.map((row, index) => (
                    <tr key={`${row.pressure}-${row.flow}-${index}`}>
                      <td>{row.pressure}</td>
                      <td>{row.flow}</td>
                      <td><button className="danger small" onClick={() => removeMeasurement(index)}>Удалить</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'blocks' && (
          <section className="card">
            <div className="card-head-row">
              <div>
                <h2>Участки сада</h2>
                <p className="muted">Можно добавлять, редактировать и сохранять участки со всеми полями из таблицы.</p>
              </div>
              <div className="button-row">
                <button className="secondary" onClick={resetBlocks}>Сбросить</button>
                <button onClick={saveBlocks}>Сохранить</button>
              </div>
            </div>

            <div className="grid four-columns add-row">
              <label>
                <span>Название участка</span>
                <input value={blockForm.name} onChange={(e) => updateBlockForm('name', e.target.value)} placeholder="Например, яблоня около навеса" />
              </label>
              <label>
                <span>Культура</span>
                <select value={blockForm.culture} onChange={(e) => updateBlockForm('culture', e.target.value)}>
                  <option>Яблоня</option>
                  <option>Слива</option>
                  <option>Груша</option>
                  <option>Черешня</option>
                </select>
              </label>
              <label>
                <span>Год</span>
                <input value={blockForm.year} onChange={(e) => updateBlockForm('year', e.target.value)} placeholder="2023" />
              </label>
              <label>
                <span>Рядов</span>
                <input value={blockForm.rows} onChange={(e) => updateBlockForm('rows', e.target.value)} placeholder="73" />
              </label>
            </div>

            <div className="grid three-small-columns add-row">
              <label>
                <span>Схема посадки</span>
                <input value={blockForm.scheme} onChange={(e) => updateBlockForm('scheme', e.target.value)} placeholder="4 × 1 м" />
              </label>
              <label>
                <span>Количество, шт</span>
                <input value={blockForm.treeCount} onChange={(e) => updateBlockForm('treeCount', e.target.value)} placeholder="17380" />
              </label>
              <label>
                <span>Площадь, га</span>
                <input value={blockForm.area} onChange={(e) => updateBlockForm('area', e.target.value)} placeholder="7,5" />
              </label>
            </div>

            <div className="button-row left-gap wrap-buttons">
              <button onClick={addOrUpdateBlock}>{editingBlockId ? 'Сохранить изменения' : 'Добавить участок'}</button>
              {editingBlockId ? <button className="secondary" onClick={clearBlockForm}>Отмена</button> : null}
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Участок</th>
                    <th>Культура</th>
                    <th>Год</th>
                    <th>Рядов</th>
                    <th>Схема</th>
                    <th>Количество</th>
                    <th>Площадь, га</th>
                    <th>Изменить</th>
                    <th>Удалить</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((block) => (
                    <tr key={block.id}>
                      <td>{block.name}</td>
                      <td>{block.culture}</td>
                      <td>{block.year || '—'}</td>
                      <td>{block.rows || '—'}</td>
                      <td>{block.scheme}</td>
                      <td>{block.treeCount || '—'}</td>
                      <td>{block.area}</td>
                      <td><button className="secondary small" onClick={() => startEditBlock(block)}>Изменить</button></td>
                      <td><button className="danger small" onClick={() => removeBlock(block.id)}>Удалить</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
