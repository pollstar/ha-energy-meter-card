/*
 * Energy Meter Card — Lovelace card for a mains energy meter
 * (Tuya DIN meter such as GR2PWS flashed with ESPHome).
 * Author: Pavel Starovoitov (@pollstar), https://github.com/pollstar/ha-energy-meter-card
 * Styled to match eybond-inverter-card (https://github.com/pollstar/ha-eybond-local).
 *
 *   type: custom:energy-meter-card
 *   device: cb2s             # optional, object-id prefix; auto-detected
 *   title: Ввод              # optional
 *   breaker: 40              # optional, gauge scale in A; default: the meter's
 *                            # overcurrent protection value, else 40
 *   inverter: pi30_6200      # optional, eybond_local prefix: adds the
 *                            # meter-vs-inverter balance to Statistics
 *   stale_after: 120         # optional, seconds without a voltage update
 *                            # before values are shown as stale
 *   show_controls: true      # optional, Settings button
 *   tariff_check: true       # warn when T1 + T2 differ from the meter; turn off
 *                            # when T1/T2 are seeded from the utility meter
 *   theme: auto              # auto | light | dark
 *   entities:                # optional overrides, any key of DEFAULTS below
 *     total: sensor.my_meter_energy
 *
 * Day/night (T1/T2) energy for a period is computed from the long-term
 * statistics of the total-energy sensor, split by the tariff hours, so the
 * periods always add up to the meter itself. The cumulative T1/T2 counters
 * are shown as the meter's tariff package reports them.
 *
 * Language follows the HA UI language: Ukrainian, Russian, otherwise English.
 * Vanilla JS, no dependencies.
 */

const CARD_VERSION = "0.1.1";

// key -> [domain, object-id suffix]; full entity ids may be overridden in config.entities
const DEFAULTS = {
  power: ["sensor", "power"],
  voltage: ["sensor", "voltage"],
  current: ["sensor", "current"],
  frequency: ["sensor", "current_frequency"],
  power_factor: ["sensor", "power_factor"],
  total: ["sensor", "total_energy"],
  t1: ["sensor", "energy_t1_day"],
  t2: ["sensor", "energy_t2_night"],
  tariff: ["sensor", "current_tariff"],
  leakage: ["sensor", "leakage_total_energy"],
  cpu_temp: ["sensor", "cpu_temp"],
  relay: ["switch", "switch_1"],
  power_on_state: ["select", "power_on_switch_status"],
  t1_start: ["number", "t1_start_hour"],
  t1_end: ["number", "t1_end_hour"],
  ovp: ["number", "overvoltage_protection_value"],
  lvp: ["number", "low_voltage_protection"],
  ocp: ["number", "overcurrent_protection_value"],
  opp: ["number", "overpower_protection_value"],
  recovery: ["number", "over_voltage_recovery_delay"],
  w_ovp: ["binary_sensor", "warning_ovp"],
  w_lvp: ["binary_sensor", "warning_lvp"],
  w_ocp: ["binary_sensor", "warning_ocp"],
  w_opp: ["binary_sensor", "warning_opp"],
  w_le: ["binary_sensor", "warning_le"],
  w_olcp: ["binary_sensor", "warning_olcp"],
};
const WARNINGS = ["w_ocp", "w_opp", "w_ovp", "w_lvp", "w_le", "w_olcp"];
const SETTING_NUMBERS = ["ovp", "recovery", "lvp", "ocp", "opp"];
const NO_GRID_V = 50;

const I18N = {
  en: {
    title: "Mains", reading: "Meter reading", t1: "Day · T1", t2: "Night · T2", t1s: "T1", t2s: "T2",
    today: "Today", month: "Month", plus_today: "today",
    voltage: "Voltage", current: "Current", frequency: "Frequency", pf: "cos φ", power: "Power",
    updated: "Updated {t} ago", stale_age: "Last data {t} ago", no_grid: "No grid", no_voltage: "No voltage",
    offline: "Meter offline", stale: "No data · {t}", relay_off: "Relay off",
    of_breaker: "{p}% of {a} A",
    w: { w_ocp: "Overcurrent", w_opp: "Overpower", w_ovp: "Overvoltage", w_lvp: "Undervoltage", w_le: "Leakage", w_olcp: "Leakage protection" },
    mismatch: "T1 + T2 differ from the meter by {p}% — check the tariff package",
    settings: "Settings", stats: "Statistics", close: "Close",
    s_tariff: "Tariff", s_tariff_note: "Day tariff hours used by the meter's tariff package and by this card.",
    t1_start: "Day tariff from", t1_end: "Day tariff until",
    s_prot: "Protection", s_prot_note: "Thresholds of the meter. A trip turns the relay off only if over-limit control is enabled on the meter.",
    ovp: "Overvoltage", lvp: "Undervoltage", ocp: "Overcurrent", opp: "Overpower", recovery: "Recovery delay",
    s_relay: "Relay", relay: "Load relay", power_on_state: "After power loss",
    relay_confirm: "Tap again to switch the house off",
    apply: "Apply", write_failed: "Could not change the setting",
    h_period: { day: "Day", month: "Month", year: "Year" }, h_prev: "Previous", h_next: "Next",
    h_loading: "Loading…", h_error: "History is unavailable (is the recorder enabled?)",
    h_no_data: "No statistics for this period yet.",
    bal: "Meter vs inverter · today", bal_inv: "Taken by the inverter", bal_loss: "Losses before the inverter",
    bal_note: "The meter is on the mains input; the inverter estimates its grid import from its own balance. The difference is what is consumed between them (e.g. a voltage stabiliser).",
    now: "Now", tariff_now: "Tariff", leakage: "Leakage (total)", mcu_temp: "Meter temperature", link: "Last update",
    on: "On", off: "Off", until: "until {h}",
    opts: { memory: "As before", on: "On", off: "Off" },
    s: "s", min: "min", h: "h",
  },
  uk: {
    title: "Ввід", reading: "Показання лічильника", t1: "День · T1", t2: "Ніч · T2", t1s: "T1", t2s: "T2",
    today: "Сьогодні", month: "Місяць", plus_today: "сьогодні",
    voltage: "Напруга", current: "Струм", frequency: "Частота", pf: "cos φ", power: "Потужність",
    updated: "Оновлено {t} тому", stale_age: "Останні дані {t} тому", no_grid: "Немає мережі", no_voltage: "Немає напруги",
    offline: "Лічильник офлайн", stale: "Немає даних · {t}", relay_off: "Реле вимкнено",
    of_breaker: "{p}% від {a} А",
    w: { w_ocp: "Перевантаження струмом", w_opp: "Перевантаження потужністю", w_ovp: "Перенапруга", w_lvp: "Знижена напруга", w_le: "Витік", w_olcp: "Захист від витоку" },
    mismatch: "T1 + T2 відрізняються від лічильника на {p}% — перевірте тарифний пакет",
    settings: "Налаштування", stats: "Статистика", close: "Закрити",
    s_tariff: "Тариф", s_tariff_note: "Години денного тарифу для тарифного пакета лічильника і цієї картки.",
    t1_start: "Денний тариф з", t1_end: "Денний тариф до",
    s_prot: "Захист", s_prot_note: "Пороги лічильника. Спрацювання вимикає реле, лише якщо на лічильнику ввімкнено керування за перевищенням.",
    ovp: "Перенапруга", lvp: "Знижена напруга", ocp: "Перевантаження струмом", opp: "Перевантаження потужністю", recovery: "Затримка відновлення",
    s_relay: "Реле", relay: "Реле навантаження", power_on_state: "Після зникнення живлення",
    relay_confirm: "Натисніть ще раз, щоб знеструмити будинок",
    apply: "Застосувати", write_failed: "Не вдалося змінити налаштування",
    h_period: { day: "День", month: "Місяць", year: "Рік" }, h_prev: "Попередній", h_next: "Наступний",
    h_loading: "Завантаження…", h_error: "Історія недоступна (чи ввімкнено recorder?)",
    h_no_data: "За цей період статистики ще немає.",
    bal: "Лічильник і інвертор · сьогодні", bal_inv: "Прийняв інвертор", bal_loss: "Втрати до інвертора",
    bal_note: "Лічильник стоїть на вводі, інвертор рахує «з мережі» за власним балансом. Різниця — те, що споживається між ними (наприклад, стабілізатор).",
    now: "Зараз", tariff_now: "Тариф", leakage: "Витік (усього)", mcu_temp: "Температура лічильника", link: "Останнє оновлення",
    on: "Увімкнено", off: "Вимкнено", until: "до {h}",
    opts: { memory: "Як було", on: "Увімкнено", off: "Вимкнено" },
    s: "с", min: "хв", h: "год",
  },
  ru: {
    title: "Ввод", reading: "Показания счётчика", t1: "День · T1", t2: "Ночь · T2", t1s: "T1", t2s: "T2",
    today: "Сегодня", month: "Месяц", plus_today: "сегодня",
    voltage: "Напряжение", current: "Ток", frequency: "Частота", pf: "cos φ", power: "Мощность",
    updated: "Обновлено {t} назад", stale_age: "Последние данные {t} назад", no_grid: "Нет сети", no_voltage: "Нет напряжения",
    offline: "Счётчик офлайн", stale: "Нет данных · {t}", relay_off: "Реле выключено",
    of_breaker: "{p}% от {a} А",
    w: { w_ocp: "Перегрузка по току", w_opp: "Перегрузка по мощности", w_ovp: "Перенапряжение", w_lvp: "Пониженное напряжение", w_le: "Утечка", w_olcp: "Защита от утечки" },
    mismatch: "T1 + T2 расходятся со счётчиком на {p}% — проверьте тарифный пакет",
    settings: "Настройки", stats: "Статистика", close: "Закрыть",
    s_tariff: "Тариф", s_tariff_note: "Часы дневного тарифа для тарифного пакета счётчика и этой карточки.",
    t1_start: "Дневной тариф с", t1_end: "Дневной тариф до",
    s_prot: "Защита", s_prot_note: "Пороги счётчика. Срабатывание отключает реле, только если на счётчике включено управление по превышению.",
    ovp: "Перенапряжение", lvp: "Пониженное напряжение", ocp: "Перегрузка по току", opp: "Перегрузка по мощности", recovery: "Задержка восстановления",
    s_relay: "Реле", relay: "Реле нагрузки", power_on_state: "После пропадания питания",
    relay_confirm: "Нажмите ещё раз, чтобы обесточить дом",
    apply: "Применить", write_failed: "Не удалось изменить настройку",
    h_period: { day: "День", month: "Месяц", year: "Год" }, h_prev: "Предыдущий", h_next: "Следующий",
    h_loading: "Загрузка…", h_error: "История недоступна (включён ли recorder?)",
    h_no_data: "За этот период статистики пока нет.",
    bal: "Счётчик и инвертор · сегодня", bal_inv: "Принял инвертор", bal_loss: "Потери до инвертора",
    bal_note: "Счётчик стоит на вводе, инвертор считает «из сети» по собственному балансу. Разница — то, что потребляется между ними (например, стабилизатор).",
    now: "Сейчас", tariff_now: "Тариф", leakage: "Утечка (всего)", mcu_temp: "Температура счётчика", link: "Последнее обновление",
    on: "Включено", off: "Выключено", until: "до {h}",
    opts: { memory: "Как было", on: "Включено", off: "Выключено" },
    s: "с", min: "мин", h: "ч",
  },
};

const GAUGE_R = 60;
const GAUGE_C = 2 * Math.PI * GAUGE_R;
const GAUGE_ARC = GAUGE_C * 0.75;

const STYLE = `
  :host { --em-g:#4f86e8; --em-t2:#2f5597; --em-t2i:#2f5597;
          --em-track:var(--divider-color,#e0e0e0); --em-muted:var(--secondary-text-color,#727272);
          --em-bg:var(--card-background-color,var(--ha-card-background,#fff));
          --em-well:color-mix(in srgb,var(--primary-text-color,#1c1c1c) 5%,var(--em-bg));
          --em-warn:var(--warning-color,#f4a100); --em-err:var(--error-color,#db4437); }
  :host([data-dark]) { --em-t2i:#8aa6e6; }
  :host([data-theme="dark"]) {
    --primary-text-color:#e6e6e6; --secondary-text-color:#9e9e9e; --divider-color:#3a3a3a;
    --card-background-color:#1c1c1c; --ha-card-background:#1c1c1c; --em-bg:#1c1c1c; color-scheme:dark;
  }
  :host([data-theme="light"]) {
    --primary-text-color:#1c1c1c; --secondary-text-color:#727272; --divider-color:#e0e0e0;
    --card-background-color:#fff; --ha-card-background:#fff; --em-bg:#fff; color-scheme:light;
  }
  ha-card { padding:16px; overflow:hidden; font-variant-numeric:tabular-nums; }
  [hidden] { display:none !important; }
  .hdr { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
  .title { font-size:18px; font-weight:500; flex:1 1 auto; min-width:0; white-space:nowrap; overflow:hidden;
           text-overflow:ellipsis; color:var(--primary-text-color); }
  .chips { display:flex; gap:6px; flex-wrap:wrap; }
  .chip { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 10px; border-radius:13px;
          font-size:12px; font-weight:500; cursor:pointer; user-select:none; color:var(--primary-text-color);
          background:color-mix(in srgb,var(--primary-text-color) 7%,transparent); }
  .chip .dot { width:8px; height:8px; border-radius:50%; background:var(--c,var(--em-muted)); }
  .chip ha-icon { --mdc-icon-size:16px; color:var(--c); }
  .chip.warn { --c:var(--em-warn); background:color-mix(in srgb,var(--em-warn) 18%,transparent); }
  .chip.err { --c:var(--em-err); background:color-mix(in srgb,var(--em-err) 15%,transparent); }

  .hero { display:flex; align-items:center; gap:18px; }
  .gauge { position:relative; width:150px; height:150px; flex:0 0 auto; cursor:pointer; }
  .gauge svg { width:100%; height:100%; display:block; }
  .gauge .trk { fill:none; stroke:var(--em-track); stroke-width:8; stroke-linecap:round; }
  .gauge .bar { fill:none; stroke:var(--c,var(--em-g)); stroke-width:8; stroke-linecap:round;
                transition:stroke-dasharray .5s ease, stroke .3s; }
  .gauge .mid { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
                justify-content:center; gap:2px; }
  .gauge ha-icon { --mdc-icon-size:22px; color:var(--c,var(--em-g)); }
  .gauge .pw { font-size:26px; font-weight:700; line-height:1.1; color:var(--primary-text-color); white-space:nowrap; }
  .gauge .sub { font-size:12px; color:var(--em-muted); white-space:nowrap; }
  .gauge .lo, .gauge .hi { position:absolute; bottom:6px; font-size:10.5px; color:var(--em-muted); }
  .gauge .lo { left:20px; } .gauge .hi { right:12px; }
  .live { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; }
  .lv { display:flex; justify-content:space-between; align-items:baseline; gap:8px; padding:6px 0;
        border-bottom:1px solid var(--em-track); cursor:pointer; }
  .lv span:first-child { font-size:12.5px; color:var(--em-muted); }
  .lv span:last-child { font-size:15px; font-weight:600; color:var(--primary-text-color); white-space:nowrap; }
  .age { margin-top:8px; font-size:11.5px; color:var(--em-muted); }
  .dim .pw, .dim .lv span:last-child { color:var(--em-muted); }
  .age.warn, .lv .warn { color:var(--em-warn) !important; } .lv .err { color:var(--em-err) !important; }

  .lbl { display:flex; justify-content:space-between; gap:8px; font-size:12px; color:var(--em-muted); margin:16px 2px 6px; }
  .odo { display:flex; align-items:flex-end; justify-content:center; gap:4px; padding:10px; border-radius:12px;
         background:var(--em-well); border:1px solid var(--em-track); cursor:pointer; }
  .odo span { width:34px; height:46px; display:flex; align-items:center; justify-content:center; border-radius:7px;
              background:var(--em-bg); font-size:28px; font-weight:600; color:var(--primary-text-color); }
  .odo span.lead { color:var(--em-muted); }
  .odo span.dec { color:var(--em-g); background:color-mix(in srgb,var(--em-g) 16%,var(--em-bg)); }
  .odo i { font-style:normal; font-size:28px; font-weight:600; line-height:46px; color:var(--em-muted); }
  .tiles { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
  .tile { border-radius:14px; padding:10px 12px; display:flex; align-items:center; gap:10px; cursor:pointer;
          background:color-mix(in srgb,var(--c) 11%,transparent); outline:1.5px solid transparent; outline-offset:-1.5px; }
  .tile.t2 { background:color-mix(in srgb,var(--em-t2) 20%,transparent); }
  .tile.on { outline-color:color-mix(in srgb,var(--ci) 55%,transparent); }
  .tile ha-icon { --mdc-icon-size:22px; color:var(--ci); }
  .tile .k { font-size:12px; color:var(--em-muted); }
  .tile .v { font-size:16px; font-weight:600; color:var(--primary-text-color); white-space:nowrap; }
  .tile .d { font-size:11.5px; color:var(--em-muted); }
  .t1 { --c:var(--em-g); --ci:var(--em-g); } .t2 { --c:var(--em-t2); --ci:var(--em-t2i); }
  .mm { margin-top:8px; font-size:11.5px; color:var(--em-warn); }

  .fb { margin-top:16px; }
  .fb-h { display:flex; justify-content:space-between; gap:8px; font-size:13px; margin-bottom:6px; color:var(--primary-text-color); }
  .fb-h b { font-weight:600; }
  .fb-bar { display:flex; gap:2px; height:12px; border-radius:6px; overflow:hidden; background:var(--em-track); }
  .fb-bar div { background:var(--c); transition:width .4s; }
  .fb-lg { display:flex; flex-wrap:wrap; gap:4px 14px; margin-top:6px; font-size:12px; color:var(--em-muted); }
  .fb-lg span { display:inline-flex; align-items:center; gap:5px; }
  .fb-lg span.sw::before { content:""; width:8px; height:8px; border-radius:2px; background:var(--c); }
  .fb-lg b { color:var(--primary-text-color); font-weight:600; }
  .fb-lg .r { margin-left:auto; }
  .c1 { --c:var(--em-g); } .c2 { --c:var(--em-t2); } .cl { --c:#e8a317; }

  .actions { display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin-top:16px; }
  .btn { all:unset; cursor:pointer; display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 16px;
         border-radius:20px; font-size:13px; font-weight:500; color:var(--primary-text-color);
         background:color-mix(in srgb,var(--primary-text-color) 7%,transparent); }
  .btn:hover { background:color-mix(in srgb,var(--primary-text-color) 11%,transparent); }
  .btn:focus-visible { outline:2px solid var(--primary-color,#03a9f4); outline-offset:2px; }
  .btn ha-icon { --mdc-icon-size:20px; color:var(--em-muted); }

  .backdrop { position:fixed; inset:0; z-index:9; background:rgba(0,0,0,.45); display:flex;
              align-items:center; justify-content:center; padding:16px; box-sizing:border-box; }
  .dlg { width:min(480px,100%); max-height:min(86vh,800px); display:flex; flex-direction:column;
         background:var(--em-bg); color:var(--primary-text-color); border-radius:20px;
         box-shadow:0 12px 40px rgba(0,0,0,.35); overflow:hidden; font-variant-numeric:tabular-nums; }
  .dlg header { display:flex; align-items:center; padding:14px 8px 8px 20px; font-size:18px; font-weight:500; }
  .dlg header span { flex:1; }
  .dlg header button, .nav button { all:unset; cursor:pointer; width:40px; height:40px; border-radius:50%;
                       display:flex; align-items:center; justify-content:center; }
  .dlg header button:hover, .nav button:hover { background:color-mix(in srgb,var(--primary-text-color) 8%,transparent); }
  .nav button[disabled] { opacity:.3; pointer-events:none; }
  .dlg-body { overflow:auto; padding:4px 20px 20px; }
  .sec { margin-top:18px; } .sec:first-child { margin-top:4px; }
  .sec h3 { margin:0 0 8px; font-size:13px; font-weight:600; color:var(--em-muted); text-transform:uppercase; letter-spacing:.04em; }
  .note { font-size:12px; color:var(--em-muted); margin:-2px 0 8px; line-height:1.4; }
  .row { display:flex; align-items:center; gap:10px; min-height:44px; border-bottom:1px solid var(--divider-color,#e0e0e0); }
  .row .rl { flex:1; font-size:14px; min-width:0; }
  .row input, .row select { font:inherit; font-size:14px; color:var(--primary-text-color); background:transparent;
       border:1px solid var(--divider-color,#ccc); border-radius:8px; padding:6px 8px; }
  .row input { width:72px; text-align:right; }
  .row input.dirty { border-color:var(--primary-color,#03a9f4); }
  .row .unit { font-size:13px; color:var(--em-muted); min-width:26px; }
  .row .apply { all:unset; cursor:pointer; font-size:13px; font-weight:500; color:var(--primary-color,#03a9f4); padding:6px 8px; border-radius:8px; }
  .row.danger .rl { color:var(--em-err); }
  .tgl { position:relative; width:40px; height:22px; flex:0 0 auto; }
  .tgl input { position:absolute; inset:0; opacity:0; margin:0; cursor:pointer; }
  .tgl span { position:absolute; inset:0; border-radius:11px; background:var(--em-track); transition:background .2s; pointer-events:none; }
  .tgl span::after { content:""; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%;
                     background:#fff; transition:transform .2s; }
  .tgl input:checked + span { background:var(--primary-color,#03a9f4); }
  .tgl input:checked + span::after { transform:translateX(18px); }
  .tgl input:focus-visible + span { outline:2px solid var(--primary-color,#03a9f4); outline-offset:2px; }

  .seg { display:grid; grid-auto-flow:column; grid-auto-columns:1fr; gap:4px; padding:4px; border-radius:12px;
         background:color-mix(in srgb,var(--primary-text-color) 6%,transparent); }
  .seg button { all:unset; text-align:center; padding:8px 6px; border-radius:9px; font-size:13px; font-weight:500; cursor:pointer; }
  .seg button.active { background:var(--primary-color,#03a9f4); color:var(--text-primary-color,#fff); }
  .nav { display:flex; align-items:center; gap:4px; margin-top:8px; }
  .nav span { flex:1; text-align:center; font-size:14px; font-weight:500; }
  .h-total { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px 16px; margin:6px 0 10px; }
  .h-total .big { font-size:26px; font-weight:600; }
  .h-total .lg { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--em-muted); }
  .h-total .lg i { width:10px; height:10px; border-radius:3px; background:var(--c); }
  .h-total .lg b { color:var(--primary-text-color); font-weight:600; }
  .chart { display:flex; gap:6px; }
  .h-y { width:24px; height:132px; display:flex; flex-direction:column; justify-content:space-between;
         font-size:10.5px; color:var(--em-muted); text-align:right; }
  .plot { flex:1; min-width:0; }
  .bars { height:132px; display:flex; align-items:flex-end; gap:2px; border-bottom:1px solid var(--em-track);
          background-image:linear-gradient(var(--em-track) 1px,transparent 1px); background-size:100% 66px; }
  .bars .col { flex:1; min-width:0; height:100%; display:flex; flex-direction:column; justify-content:flex-end; cursor:pointer; border-radius:3px; }
  .bars .col.hot { outline:1.5px solid var(--primary-text-color); outline-offset:1px; }
  .bars .col div { min-height:0; }
  .bars .b1 { background:var(--em-g); } .bars .b2 { background:var(--em-t2); }
  .bars .col div:first-child { border-radius:3px 3px 0 0; }
  .h-x { display:flex; justify-content:space-between; font-size:10.5px; color:var(--em-muted); margin-top:4px; }
  .h-sel { min-height:20px; margin-top:8px; font-size:12.5px; color:var(--em-muted); }
  .h-sel b { color:var(--primary-text-color); font-weight:600; }
  .h-msg { padding:30px 0; text-align:center; font-size:13px; color:var(--em-muted); }
  .kv { display:flex; justify-content:space-between; gap:12px; padding:9px 0; font-size:14px;
        border-bottom:1px solid var(--divider-color,#e0e0e0); cursor:pointer; }
  .kv span:first-child { color:var(--em-muted); }
  .kv span:last-child { text-align:right; }
  .warn-msg { padding:12px; color:var(--em-err); }
  @media (prefers-reduced-motion: reduce) { .gauge .bar, .fb-bar div { transition:none; } }
`;

class EnergyMeterCard extends HTMLElement {
  static getStubConfig(hass) {
    const prefix = hass ? EnergyMeterCard._detectPrefix(hass) : null;
    return prefix ? { device: prefix } : {};
  }

  static _detectPrefix(hass) {
    const found = [];
    for (const id of Object.keys(hass.states)) {
      const m = /^sensor\.(.+)_total_energy$/.exec(id);
      if (m && hass.states[`sensor.${m[1]}_voltage`] && hass.states[`sensor.${m[1]}_current`]) found.push(m[1]);
    }
    found.sort((a, b) => (b === "cb2s") - (a === "cb2s") || a.localeCompare(b));
    return found[0] || null;
  }

  setConfig(config) {
    this._config = { show_controls: true, stale_after: 120, tariff_check: true, ...(config || {}) };
    const theme = ["light", "dark"].includes(this._config.theme) ? this._config.theme : "auto";
    this.setAttribute("data-theme", theme);
    this._prefix = this._config.device || null;
    this._built = false;
    this._pending = {};
    this._today = null;
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const theme = this.getAttribute("data-theme");
    const dark = theme === "dark" || (theme === "auto" && !!hass?.themes?.darkMode);
    this.toggleAttribute("data-dark", dark);
    if (theme === "auto") this.style.colorScheme = dark ? "dark" : "light";
    this._render();
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }

  connectedCallback() {
    if (!this._tick) this._tick = setInterval(() => this._built && this._update(), 5000);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._tick = null;
    this._closeDialog();
  }

  // ---------------------------------------------------------------- helpers
  get _t() {
    const lang = String(this._hass?.locale?.language || this._hass?.language || "en").toLowerCase().slice(0, 2);
    return I18N[lang] || I18N.en;
  }

  _id(key) {
    const own = this._config.entities?.[key];
    if (own) return own;
    const d = DEFAULTS[key];
    return d && this._prefix ? `${d[0]}.${this._prefix}_${d[1]}` : null;
  }
  _st(key) { const id = this._id(key); return id ? this._hass?.states[id] : undefined; }
  _ok(s) { return s && !["unknown", "unavailable"].includes(s.state); }
  _num(key) {
    const s = this._st(key);
    if (!this._ok(s)) return null;
    const v = parseFloat(s.state);
    return Number.isFinite(v) ? v : null;
  }

  _fmt(v, digits = 0) {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const lang = this._hass?.locale?.language || "en";
    return new Intl.NumberFormat(lang, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
  }
  _u(u) {
    if (this._t === I18N.en || !u) return u || "";
    const uk = this._t === I18N.uk;
    return { V: "В", A: "А", W: "Вт", kW: "кВт", kWh: "кВт·ч", Hz: "Гц", min: uk ? "хв" : "мин", h: uk ? "год" : "ч" }[u] || u;
  }
  _q(v, digits, unit) { return v === null ? "—" : `${this._fmt(v, digits)} ${this._u(unit)}`; }
  _kwh(v) {
    if (v === null || v === undefined) return "—";
    return this._q(v, Math.abs(v) >= 100 ? 1 : 2, "kWh");
  }
  _w(v) {
    if (v === null) return { n: "—", u: this._u("W") };
    const a = Math.abs(v);
    return a >= 10000 ? { n: this._fmt(a / 1000, 1), u: this._u("kW") } : { n: this._fmt(a), u: this._u("W") };
  }
  _ago(ms) {
    const t = this._t, s = Math.max(0, Math.round(ms / 1000));
    if (s < 90) return `${s} ${t.s}`;
    if (s < 5400) return `${Math.round(s / 60)} ${t.min}`;
    return `${this._fmt(s / 3600, 1)} ${t.h}`;
  }
  _tpl(str, vars) { return str.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? ""); }

  _moreInfo(key) {
    const entityId = this._id(key);
    if (!entityId || !this._hass.states[entityId]) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  _toast(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
  }

  // Tariff hours: hour h belongs to T1 when start <= h < end (wraps past midnight).
  _hours() {
    const a = this._num("t1_start"), b = this._num("t1_end");
    return { start: a ?? 7, end: b ?? 23 };
  }
  _isT1(date) {
    const { start, end } = this._hours(), h = date.getHours();
    return start <= end ? h >= start && h < end : h >= start || h < end;
  }
  _activeT1() {
    const t = this._num("tariff");
    if (t === 1 || t === 2) return t === 1;
    return this._isT1(new Date());
  }

  _breaker() {
    const own = parseFloat(this._config.breaker);
    if (Number.isFinite(own) && own > 0) return own;
    const ocp = this._num("ocp");
    return ocp && ocp > 0 ? ocp : 40;
  }

  // Overall state: offline | stale | nogrid | ok
  _status() {
    const v = this._st("voltage");
    if (!v || v.state === "unavailable") return { kind: "offline" };
    const age = Date.now() - new Date(v.last_updated).getTime();
    const limit = (parseFloat(this._config.stale_after) || 120) * 1000;
    if (age > limit) return { kind: "stale", age };
    const volts = this._num("voltage");
    if (volts !== null && volts < NO_GRID_V) return { kind: "nogrid", age };
    return { kind: "ok", age };
  }

  // ---------------------------------------------------------------- render
  _render() {
    if (!this._hass || !this._config) return;
    if (!this._prefix && !this._config.entities?.total) this._prefix = EnergyMeterCard._detectPrefix(this._hass);
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    if (!this._st("voltage") && !this._st("total")) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="warn-msg">
        Energy meter entities not found${this._prefix ? ` for "${this._prefix}"` : ""}. Set <b>device:</b> to the
        object-id prefix of the meter (e.g. <code>cb2s</code>).</div></ha-card>`;
      this._built = false;
      return;
    }
    if (!this._built) this._build();
    this._update();
    if (this._dialog) this._updateDialog();
    this._maybeLoadToday();
  }

  _build() {
    const t = this._t;
    const showCtl = this._config.show_controls !== false;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="hdr">
          <div class="title">${this._config.title || t.title}</div>
          <div class="chips"><span data-alerts style="display:contents"></span>
            <span class="chip" data-tariff><span class="dot"></span><span></span></span></div>
        </div>
        <div class="hero" data-hero>
          <div class="gauge" data-info="power" role="img">
            <svg viewBox="0 0 150 150" aria-hidden="true">
              <circle class="trk" cx="75" cy="75" r="${GAUGE_R}" stroke-dasharray="${GAUGE_ARC} ${GAUGE_C}" transform="rotate(135 75 75)"></circle>
              <circle class="bar" data-bar cx="75" cy="75" r="${GAUGE_R}" stroke-dasharray="0 ${GAUGE_C}" transform="rotate(135 75 75)"></circle>
            </svg>
            <div class="mid"><ha-icon data-gicon icon="mdi:transmission-tower"></ha-icon>
              <div class="pw" data-pw>—</div><div class="sub" data-sub></div></div>
            <div class="lo">0</div><div class="hi" data-hi></div>
          </div>
          <div class="live">
            <div class="lv" data-info="voltage"><span>${t.voltage}</span><span data-v="voltage">—</span></div>
            <div class="lv" data-info="current"><span>${t.current}</span><span data-v="current">—</span></div>
            <div class="lv" data-info="frequency"><span>${t.frequency}</span><span data-v="frequency">—</span></div>
            <div class="lv" data-info="power_factor"><span>${t.pf}</span><span data-v="power_factor">—</span></div>
            <div class="age" data-age></div>
          </div>
        </div>
        <div class="lbl"><span>${t.reading}</span><span>${this._u("kWh")}</span></div>
        <div class="odo" data-odo data-info="total"></div>
        <div class="tiles">
          <div class="tile t1" data-info="t1"><ha-icon icon="mdi:white-balance-sunny"></ha-icon>
            <div><div class="k">${t.t1}</div><div class="v" data-c1>—</div><div class="d" data-d1></div></div></div>
          <div class="tile t2" data-info="t2"><ha-icon icon="mdi:weather-night"></ha-icon>
            <div><div class="k">${t.t2}</div><div class="v" data-c2>—</div><div class="d" data-d2></div></div></div>
        </div>
        <div class="mm" data-mm hidden></div>
        <div class="fb" data-fb hidden>
          <div class="fb-h"><span>${t.today}</span><b data-ft></b></div>
          <div class="fb-bar"><div class="c1" data-fb1></div><div class="c2" data-fb2></div></div>
          <div class="fb-lg"><span class="sw c1">${t.t1s} <b data-fl1></b></span><span class="sw c2">${t.t2s} <b data-fl2></b></span>
            <span class="r">${t.month} <b data-fm></b></span></div>
        </div>
        <div class="actions">
          ${showCtl ? `<button class="btn" data-open="settings"><ha-icon icon="mdi:tune-variant"></ha-icon>${t.settings}</button>` : ""}
          <button class="btn" data-open="stats"><ha-icon icon="mdi:chart-box-outline"></ha-icon>${t.stats}</button>
        </div>
      </ha-card>`;
    const root = this.shadowRoot;
    root.querySelectorAll("[data-info]").forEach((el) =>
      el.addEventListener("click", () => this._moreInfo(el.dataset.info)));
    root.querySelector("[data-tariff]").addEventListener("click", () => this._moreInfo("tariff"));
    root.querySelectorAll("[data-open]").forEach((el) =>
      el.addEventListener("click", () => this._openDialog(el.dataset.open)));
    this._built = true;
  }

  _update() {
    const root = this.shadowRoot;
    if (!root || !this._built) return;
    const t = this._t;
    const st = this._status();
    const dim = st.kind === "stale" || st.kind === "offline" || st.kind === "nogrid";

    // chips
    const alerts = [];
    if (st.kind === "offline") alerts.push(["warn", "mdi:lan-disconnect", t.offline, "voltage"]);
    else if (st.kind === "stale") alerts.push(["warn", "mdi:clock-alert-outline", this._tpl(t.stale, { t: this._ago(st.age) }), "voltage"]);
    else if (st.kind === "nogrid") alerts.push(["warn", "mdi:transmission-tower-off", t.no_voltage, "voltage"]);
    const relay = this._st("relay");
    if (relay && relay.state === "off") alerts.push(["err", "mdi:electric-switch", t.relay_off, "relay"]);
    for (const w of WARNINGS) if (this._st(w)?.state === "on") alerts.push(["err", "mdi:alert", t.w[w], w]);
    const box = root.querySelector("[data-alerts]");
    const sig = JSON.stringify(alerts);
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = alerts.map(([cls, icon, text, key]) =>
        `<span class="chip ${cls}" data-key="${key}"><ha-icon icon="${icon}"></ha-icon>${text}</span>`).join("");
      box.querySelectorAll("[data-key]").forEach((el) => el.addEventListener("click", () => this._moreInfo(el.dataset.key)));
    }
    const t1now = this._activeT1();
    const chip = root.querySelector("[data-tariff]");
    chip.style.setProperty("--c", t1now ? "var(--em-g)" : "var(--em-t2i)");
    chip.lastElementChild.textContent = t1now ? t.t1 : t.t2;

    // gauge
    const amps = this._num("current"), power = this._num("power"), brk = this._breaker();
    const pct = amps === null || st.kind === "nogrid" ? 0 : Math.max(0, amps / brk * 100);
    const tripped = WARNINGS.slice(0, 2).some((w) => this._st(w)?.state === "on");
    const color = dim ? "var(--em-muted)" : tripped || pct >= 90 ? "var(--em-err)" : pct >= 70 ? "var(--em-warn)" : "var(--em-g)";
    const gauge = root.querySelector(".gauge");
    gauge.style.setProperty("--c", color);
    root.querySelector("[data-bar]").setAttribute("stroke-dasharray", `${(GAUGE_ARC * Math.min(pct, 100) / 100).toFixed(2)} ${GAUGE_C}`);
    root.querySelector("[data-gicon]").setAttribute("icon", st.kind === "nogrid" || st.kind === "offline" ? "mdi:transmission-tower-off" : "mdi:transmission-tower");
    const pw = st.kind === "nogrid" ? { n: "—", u: "" } : this._w(power);
    root.querySelector("[data-pw]").textContent = pw.n;
    root.querySelector("[data-sub]").textContent = st.kind === "nogrid" ? t.no_grid
      : amps === null ? pw.u : `${pw.u} · ${this._tpl(t.of_breaker, { p: this._fmt(pct), a: this._fmt(brk) })}`;
    root.querySelector("[data-hi]").textContent = `${this._fmt(brk)} ${this._u("A")}`;
    gauge.setAttribute("aria-label", `${t.power} ${pw.n} ${pw.u}`);
    root.querySelector("[data-hero]").classList.toggle("dim", dim);

    const set = (key, text, cls = "") => {
      const el = root.querySelector(`[data-v="${key}"]`);
      el.textContent = text;
      el.className = cls;
    };
    set("voltage", this._q(this._num("voltage"), 1, "V"),
      st.kind === "nogrid" || this._st("w_ovp")?.state === "on" || this._st("w_lvp")?.state === "on" ? "warn" : "");
    set("current", this._q(amps, amps !== null && amps < 10 ? 2 : 1, "A"), tripped ? "err" : "");
    set("frequency", this._q(this._num("frequency"), 2, "Hz"));
    set("power_factor", this._fmt(this._num("power_factor"), 2));
    const age = root.querySelector("[data-age]");
    age.textContent = st.kind === "offline" ? t.offline
      : this._tpl(st.kind === "stale" ? t.stale_age : t.updated, { t: this._ago(st.age) });
    age.classList.toggle("warn", st.kind === "stale" || st.kind === "offline");

    // odometer
    const total = this._num("total");
    const odo = root.querySelector("[data-odo]");
    const osig = total === null ? "-" : total.toFixed(2);
    if (odo.dataset.sig !== osig) {
      odo.dataset.sig = osig;
      if (total === null) {
        odo.innerHTML = "<span>—</span>";
      } else {
        const [ip, dp] = total.toFixed(2).split(".");
        const digits = ip.padStart(5, "0");
        const lead = digits.length - ip.length;
        const sep = (this._hass?.locale?.language || "en").startsWith("en") ? "." : ",";
        odo.innerHTML = digits.split("").map((d, i) => `<span class="${i < lead ? "lead" : ""}">${d}</span>`).join("")
          + `<i>${sep}</i>` + dp.split("").map((d) => `<span class="dec">${d}</span>`).join("");
      }
      odo.setAttribute("aria-label", `${t.reading}: ${this._kwh(total)}`);
    }

    // tariff tiles
    const c1 = this._num("t1"), c2 = this._num("t2");
    root.querySelector("[data-c1]").textContent = this._kwh(c1);
    root.querySelector("[data-c2]").textContent = this._kwh(c2);
    root.querySelector(".tile.t1").classList.toggle("on", t1now);
    root.querySelector(".tile.t2").classList.toggle("on", !t1now);
    const mm = root.querySelector("[data-mm]");
    const mismatch = this._config.tariff_check !== false && total && c1 !== null && c2 !== null
      ? Math.abs(c1 + c2 - total) / total * 100 : 0;
    mm.hidden = mismatch <= 1;
    if (!mm.hidden) mm.textContent = this._tpl(t.mismatch, { p: this._fmt(mismatch, mismatch >= 10 ? 0 : 1) });

    // today
    const td = this._todayValues();
    root.querySelector("[data-d1]").textContent = td ? `+${this._fmt(td.t1, 2)} ${t.plus_today}` : "";
    root.querySelector("[data-d2]").textContent = td ? `+${this._fmt(td.t2, 2)} ${t.plus_today}` : "";
    const fb = root.querySelector("[data-fb]");
    fb.hidden = !td;
    if (td) {
      const sum = td.t1 + td.t2;
      const p1 = sum > 0 ? td.t1 / sum * 100 : 0;
      root.querySelector("[data-ft]").textContent = this._kwh(sum);
      root.querySelector("[data-fb1]").style.width = `${p1}%`;
      root.querySelector("[data-fb2]").style.width = `${sum > 0 ? 100 - p1 : 0}%`;
      root.querySelector("[data-fl1]").textContent = `${this._fmt(td.t1, 2)} · ${this._fmt(p1)}%`;
      root.querySelector("[data-fl2]").textContent = `${this._fmt(td.t2, 2)} · ${this._fmt(sum > 0 ? 100 - p1 : 0)}%`;
      root.querySelector("[data-fm]").textContent = this._kwh(td.month);
    }
  }

  // ---------------------------------------------------------------- statistics
  _statTime(v) { return typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v); }

  // Hourly energy of the total sensor in [s, e): [{start: Date, kwh}], plus the
  // not-yet-compiled part of the current hour (long-term statistics lag ~1 h).
  async _hourly(s, e) {
    const id = this._id("total");
    const res = await this._hass.callWS({
      type: "recorder/statistics_during_period",
      start_time: s.toISOString(), end_time: e.toISOString(),
      statistic_ids: [id], period: "hour", types: ["change", "state"], units: { energy: "kWh" },
    });
    const rows = (res?.[id] || []).map((r) => ({
      start: this._statTime(r.start), kwh: Number.isFinite(r.change) ? Math.max(0, r.change) : 0, state: r.state,
    }));
    const now = new Date();
    const cur = this._num("total");
    if (now >= s && now < e && cur !== null && rows.length) {
      const last = rows[rows.length - 1];
      const lastEnd = new Date(last.start.getTime() + 3600e3);
      const pending = Number.isFinite(last.state) ? cur - last.state : 0;
      if (pending > 0.0005 && pending < 30) rows.push({ start: lastEnd > now ? now : lastEnd, kwh: pending, pendingAt: now });
    }
    return rows;
  }

  _split(rows) {
    let t1 = 0, t2 = 0;
    for (const r of rows) {
      const at = r.pendingAt ? (this._activeT1() ? 1 : 2) : this._isT1(r.start) ? 1 : 2;
      if (at === 1) t1 += r.kwh; else t2 += r.kwh;
    }
    return { t1, t2 };
  }

  _maybeLoadToday() {
    if (!this._hass?.callWS || this._loadingToday) return;
    const fresh = this._today && Date.now() - this._today.at < 5 * 60e3
      && this._today.day === new Date().toDateString();
    if (fresh) return;
    this._loadingToday = true;
    this._loadToday().finally(() => { this._loadingToday = false; });
  }

  async _loadToday() {
    try {
      const now = new Date();
      const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
      const m0 = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(day0.getTime() + 86400e3);
      const rows = await this._hourly(m0, end);
      const today = this._split(rows.filter((r) => r.start >= day0));
      const month = rows.reduce((a, r) => a + r.kwh, 0);
      const base = this._num("total");
      this._today = { ...today, month, at: Date.now(), day: now.toDateString(), base };
    } catch (err) {
      this._today = { error: true, at: Date.now(), day: new Date().toDateString() };
      console.warn("energy-meter-card: statistics query failed", err);
    }
    this._update();
    if (this._dialog?.kind === "stats") this._updateDialog();
  }

  // Today's values, with what the meter counted since the last query added live.
  _todayValues() {
    const d = this._today;
    if (!d || d.error) return null;
    const cur = this._num("total");
    const extra = cur !== null && d.base !== null && cur > d.base && cur - d.base < 100 ? cur - d.base : 0;
    const t1 = d.t1 + (this._activeT1() ? extra : 0);
    const t2 = d.t2 + (this._activeT1() ? 0 : extra);
    return { t1, t2, month: d.month + extra };
  }

  // ---------------------------------------------------------------- dialogs
  _openDialog(kind) {
    this._closeDialog();
    const t = this._t;
    const wrap = document.createElement("div");
    wrap.className = "backdrop";
    const title = kind === "settings" ? t.settings : t.stats;
    wrap.innerHTML = `<div class="dlg" role="dialog" aria-modal="true" aria-label="${title}">
        <header><span>${title}</span>
          <button data-close aria-label="${t.close}"><ha-icon icon="mdi:close"></ha-icon></button></header>
        <div class="dlg-body">${kind === "settings" ? this._settingsHtml() : this._statsHtml()}</div>
      </div>`;
    wrap.addEventListener("click", (ev) => { if (ev.target === wrap) this._closeDialog(); });
    wrap.querySelector("[data-close]").addEventListener("click", () => this._closeDialog());
    this._onKey = (ev) => { if (ev.key === "Escape") this._closeDialog(); };
    window.addEventListener("keydown", this._onKey);
    this.shadowRoot.appendChild(wrap);
    this._dialog = { kind, el: wrap };
    if (kind === "settings") this._wireSettings(wrap);
    else this._wireStats(wrap);
    this._updateDialog();
    wrap.querySelector("[data-close]").focus();
  }

  _closeDialog() {
    this._hist = null;
    if (this._dialog) this._dialog.el.remove();
    this._dialog = null;
    if (this._onKey) window.removeEventListener("keydown", this._onKey);
    this._onKey = null;
  }

  _updateDialog() {
    if (!this._dialog) return;
    if (this._dialog.kind === "settings") this._updateSettings();
    else this._updateStats();
  }

  // ---- settings
  _numRow(key, label) {
    const s = this._st(key);
    if (!s) return "";
    const unit = key === "t1_start" || key === "t1_end" ? "" : this._u(s.attributes.unit_of_measurement);
    const a = s.attributes;
    return `<div class="row" data-row="${key}"><label class="rl" for="n-${key}">${label}</label>
      <input id="n-${key}" type="number" inputmode="decimal" min="${a.min ?? ""}" max="${a.max ?? ""}" step="${a.step ?? 1}" data-num="${key}">
      <span class="unit">${unit}</span><button class="apply" data-apply="${key}" hidden>${this._t.apply}</button></div>`;
  }

  _settingsHtml() {
    const t = this._t;
    const tariff = ["t1_start", "t1_end"].map((k) => this._numRow(k, t[k])).join("");
    const prot = SETTING_NUMBERS.map((k) => this._numRow(k, t[k])).join("");
    const pos = this._st("power_on_state");
    const posRow = pos ? `<div class="row"><label class="rl" for="sel-pos">${t.power_on_state}</label>
      <select id="sel-pos" data-select="power_on_state">${(pos.attributes.options || [])
        .map((o) => `<option value="${o}">${t.opts[o] || o}</option>`).join("")}</select></div>` : "";
    const relay = this._st("relay") ? `<div class="row" data-relay-row><label class="rl" for="sw-relay">${t.relay}</label>
      <span class="tgl"><input id="sw-relay" type="checkbox" data-relay><span></span></span></div>` : "";
    return `
      ${tariff ? `<div class="sec"><h3>${t.s_tariff}</h3><div class="note">${t.s_tariff_note}</div>${tariff}</div>` : ""}
      ${prot ? `<div class="sec"><h3>${t.s_prot}</h3><div class="note">${t.s_prot_note}</div>${prot}</div>` : ""}
      ${relay || posRow ? `<div class="sec"><h3>${t.s_relay}</h3>${relay}${posRow}</div>` : ""}`;
  }

  _wireSettings(el) {
    el.querySelectorAll("[data-num]").forEach((inp) => {
      const key = inp.dataset.num;
      const btn = el.querySelector(`[data-apply="${key}"]`);
      inp.addEventListener("input", () => {
        const dirty = inp.value !== "" && parseFloat(inp.value) !== this._num(key);
        inp.classList.toggle("dirty", dirty);
        inp.dataset.edit = dirty ? "1" : "";
        btn.hidden = !dirty;
      });
      const apply = async () => {
        const value = parseFloat(inp.value);
        if (!Number.isFinite(value)) return;
        btn.hidden = true;
        inp.classList.remove("dirty");
        inp.dataset.edit = "";
        try {
          await this._hass.callService("number", "set_value", { entity_id: this._id(key), value });
        } catch (err) {
          this._toast(`${this._t.write_failed}: ${err?.message || err}`);
        }
        this._updateSettings();
      };
      btn.addEventListener("click", apply);
      inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") apply(); });
    });
    const sel = el.querySelector("[data-select]");
    if (sel) sel.addEventListener("change", () => this._hass.callService("select", "select_option",
      { entity_id: this._id("power_on_state"), option: sel.value }).catch((err) => this._toast(`${this._t.write_failed}: ${err?.message || err}`)));
    const relay = el.querySelector("[data-relay]");
    if (relay) relay.addEventListener("change", () => {
      const on = this._st("relay")?.state === "on";
      const row = el.querySelector("[data-relay-row]");
      const label = row.querySelector(".rl");
      // Switching the mains relay off blacks out the house: ask for a second tap.
      if (on && !relay.checked && !this._relayArmed) {
        this._relayArmed = true;
        relay.checked = true;
        row.classList.add("danger");
        label.textContent = this._t.relay_confirm;
        clearTimeout(this._relayTimer);
        this._relayTimer = setTimeout(() => {
          this._relayArmed = false;
          row.classList.remove("danger");
          label.textContent = this._t.relay;
        }, 4000);
        return;
      }
      this._relayArmed = false;
      clearTimeout(this._relayTimer);
      row.classList.remove("danger");
      label.textContent = this._t.relay;
      this._hass.callService("switch", relay.checked ? "turn_on" : "turn_off", { entity_id: this._id("relay") })
        .catch((err) => this._toast(`${this._t.write_failed}: ${err?.message || err}`));
    });
  }

  _updateSettings() {
    const el = this._dialog?.el;
    if (!el) return;
    el.querySelectorAll("[data-num]").forEach((inp) => {
      if (inp.dataset.edit || inp === this.shadowRoot.activeElement) return;
      const v = this._num(inp.dataset.num);
      inp.value = v === null ? "" : String(v);
      inp.disabled = !this._ok(this._st(inp.dataset.num));
    });
    const sel = el.querySelector("[data-select]");
    if (sel && sel !== this.shadowRoot.activeElement) sel.value = this._st("power_on_state")?.state;
    const relay = el.querySelector("[data-relay]");
    if (relay && !this._relayArmed) {
      relay.checked = this._st("relay")?.state === "on";
      relay.disabled = !this._ok(this._st("relay"));
    }
  }

  // ---- statistics
  _statsHtml() {
    const t = this._t;
    const inv = this._config.inverter
      ? `<div class="sec" data-bal hidden><h3>${t.bal}</h3>
          <div class="fb-bar"><div class="c1" data-b1></div><div class="cl" data-b2></div></div>
          <div class="fb-lg"><span class="sw c1">${t.bal_inv} <b data-bi></b></span><span class="sw cl">${t.bal_loss} <b data-bl></b></span></div>
          <div class="note" style="margin-top:8px">${t.bal_note}</div></div>` : "";
    return `<div class="sec">
        <div class="seg" data-period>${["day", "month", "year"].map((p) =>
          `<button data-p="${p}">${t.h_period[p]}</button>`).join("")}</div>
        <div class="nav"><button data-prev aria-label="${t.h_prev}"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
          <span data-range></span>
          <button data-next aria-label="${t.h_next}"><ha-icon icon="mdi:chevron-right"></ha-icon></button></div>
        <div data-hist></div>
      </div>
      ${inv}
      <div class="sec"><h3>${t.now}</h3><div data-now></div></div>`;
  }

  _wireStats(el) {
    this._hist = { period: "month", anchor: new Date(), req: 0, data: null, sel: null };
    el.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
      this._hist.period = b.dataset.p;
      this._hist.anchor = new Date();
      this._hist.sel = null;
      this._loadHistory();
    }));
    el.querySelector("[data-prev]").addEventListener("click", () => this._shift(-1));
    el.querySelector("[data-next]").addEventListener("click", () => this._shift(1));
    this._loadHistory();
  }

  _shift(dir) {
    const h = this._hist, a = new Date(h.anchor);
    if (h.period === "day") a.setDate(a.getDate() + dir);
    else if (h.period === "month") a.setMonth(a.getMonth() + dir, 1);
    else a.setFullYear(a.getFullYear() + dir, 0, 1);
    h.anchor = a;
    h.sel = null;
    this._loadHistory();
  }

  _range(period, anchor) {
    const a = new Date(anchor);
    if (period === "day") {
      const s = new Date(a.getFullYear(), a.getMonth(), a.getDate());
      return { s, e: new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1), n: 24 };
    }
    if (period === "month") {
      const s = new Date(a.getFullYear(), a.getMonth(), 1);
      const e = new Date(a.getFullYear(), a.getMonth() + 1, 1);
      return { s, e, n: Math.round((e - s) / 86400e3) };
    }
    const s = new Date(a.getFullYear(), 0, 1);
    return { s, e: new Date(a.getFullYear() + 1, 0, 1), n: 12 };
  }

  _bucket(period, d) {
    return period === "day" ? d.getHours() : period === "month" ? d.getDate() - 1 : d.getMonth();
  }

  _rangeLabel(period, s) {
    const lang = this._hass?.locale?.language || "en";
    if (period === "day") return new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric" }).format(s);
    if (period === "month") {
      const txt = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(s);
      return txt.charAt(0).toUpperCase() + txt.slice(1);
    }
    return String(s.getFullYear());
  }

  _bucketLabel(period, s, i) {
    const lang = this._hass?.locale?.language || "en";
    if (period === "day") return `${String(i).padStart(2, "0")}:00–${String(i + 1).padStart(2, "0")}:00`;
    if (period === "month") return new Intl.DateTimeFormat(lang, { day: "numeric", month: "long" })
      .format(new Date(s.getFullYear(), s.getMonth(), i + 1));
    const txt = new Intl.DateTimeFormat(lang, { month: "long" }).format(new Date(s.getFullYear(), i, 1));
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  async _loadHistory() {
    const h = this._hist;
    const el = this._dialog?.el;
    if (!h || !el) return;
    const req = ++h.req;
    const { s, e, n } = this._range(h.period, h.anchor);
    el.querySelectorAll("[data-p]").forEach((b) => b.classList.toggle("active", b.dataset.p === h.period));
    el.querySelector("[data-range]").textContent = this._rangeLabel(h.period, s);
    el.querySelector("[data-next]").disabled = e > new Date();
    if (!h.data) el.querySelector("[data-hist]").innerHTML = `<div class="h-msg">${this._t.h_loading}</div>`;
    try {
      const rows = await this._hourly(s, e);
      if (req !== h.req || this._hist !== h) return;
      const v1 = new Array(n).fill(0), v2 = new Array(n).fill(0);
      for (const r of rows) {
        const i = this._bucket(h.period, r.start);
        if (i < 0 || i >= n) continue;
        const one = r.pendingAt ? this._activeT1() : this._isT1(r.start);
        if (one) v1[i] += r.kwh; else v2[i] += r.kwh;
      }
      h.data = { s, e, n, v1, v2, empty: !rows.length };
      h.liveAt = Date.now();
      this._renderHistory();
    } catch (err) {
      if (req !== h.req || this._hist !== h) return;
      h.data = null;
      el.querySelector("[data-hist]").innerHTML = `<div class="h-msg">${this._t.h_error}</div>`;
      console.warn("energy-meter-card: history query failed", err);
    }
  }

  _niceMax(v) {
    if (v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 2, 2.5, 4, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  _renderHistory() {
    const h = this._hist, el = this._dialog?.el;
    if (!h?.data || !el) return;
    const t = this._t;
    const { s, n, v1, v2, empty } = h.data;
    const box = el.querySelector("[data-hist]");
    if (empty) { box.innerHTML = `<div class="h-msg">${t.h_no_data}</div>`; return; }
    const s1 = v1.reduce((a, b) => a + b, 0), s2 = v2.reduce((a, b) => a + b, 0);
    const max = this._niceMax(Math.max(...v1.map((x, i) => x + v2[i])));
    const H = 132;
    const now = new Date();
    const cur = now >= h.data.s && now < h.data.e ? this._bucket(h.period, now) : -1;
    const cols = v1.map((a, i) => `<div class="col ${i === h.sel ? "hot" : ""}" data-i="${i}" title="${this._bucketLabel(h.period, s, i)}">
        <div class="b2" style="height:${(v2[i] / max * H).toFixed(1)}px"></div>
        <div class="b1" style="height:${(a / max * H).toFixed(1)}px"></div></div>`).join("");
    const ticks = h.period === "day" ? [0, 6, 12, 18, 23] : h.period === "month" ? [1, 8, 15, 22, n] : [1, 4, 7, 10, 12];
    const sel = h.sel ?? (cur >= 0 ? cur : null);
    const selTxt = sel === null ? "" : `<b>${this._bucketLabel(h.period, s, sel)}</b> · ${this._kwh(v1[sel] + v2[sel])} — `
      + `${t.t1s} ${this._fmt(v1[sel], 2)} · ${t.t2s} ${this._fmt(v2[sel], 2)}`;
    box.innerHTML = `
      <div class="h-total"><span class="big">${this._kwh(s1 + s2)}</span>
        <span class="lg" style="--c:var(--em-g)"><i></i>${t.t1s} <b>${this._fmt(s1, 1)}</b></span>
        <span class="lg" style="--c:var(--em-t2)"><i></i>${t.t2s} <b>${this._fmt(s2, 1)}</b></span></div>
      <div class="chart"><div class="h-y"><span>${this._fmt(max)}</span><span>${this._fmt(max / 2, max < 4 ? 1 : 0)}</span><span>0</span></div>
        <div class="plot"><div class="bars">${cols}</div>
          <div class="h-x">${ticks.map((x) => `<span>${h.period === "day" ? `${x}` : x}</span>`).join("")}</div></div></div>
      <div class="h-sel">${selTxt}</div>`;
    box.querySelectorAll("[data-i]").forEach((c) => c.addEventListener("click", () => {
      h.sel = Number(c.dataset.i);
      this._renderHistory();
    }));
  }

  _updateStats() {
    const el = this._dialog?.el;
    if (!el) return;
    const t = this._t;
    const h = this._hist;
    if (h?.data && Date.now() - (h.liveAt || 0) > 60e3) {
      const now = new Date();
      if (now >= h.data.s && now < h.data.e) { h.liveAt = Date.now(); this._loadHistory(); }
    }
    // balance with the inverter
    const bal = el.querySelector("[data-bal]");
    if (bal) {
      const id = `sensor.${this._config.inverter}_estimated_grid_import_energy_today`;
      const s = this._hass.states[id];
      const inv = s ? parseFloat(s.state) : NaN;
      const td = this._todayValues();
      const meter = td ? td.t1 + td.t2 : null;
      bal.hidden = !(Number.isFinite(inv) && meter);
      if (!bal.hidden) {
        const loss = Math.max(0, meter - inv);
        const pl = meter > 0 ? loss / meter * 100 : 0;
        bal.querySelector("[data-b1]").style.width = `${100 - pl}%`;
        bal.querySelector("[data-b2]").style.width = `${pl}%`;
        bal.querySelector("[data-bi]").textContent = this._kwh(inv);
        bal.querySelector("[data-bl]").textContent = `${this._fmt(loss, 2)} · ${this._fmt(pl, 1)}%`;
      }
    }
    // live values
    const st = this._status();
    const { start, end } = this._hours();
    const relay = this._st("relay");
    const pf = this._num("power_factor");
    const rows = [
      ["voltage", t.voltage, this._q(this._num("voltage"), 1, "V")],
      ["current", t.current, this._q(this._num("current"), 2, "A")],
      ["power", t.power, `${this._q(this._num("power"), 0, "W")}${pf !== null ? ` · cos φ ${this._fmt(pf, 2)}` : ""}`],
      ["frequency", t.frequency, this._q(this._num("frequency"), 2, "Hz")],
      ["tariff", t.tariff_now, this._activeT1()
        ? `${t.t1} · ${this._tpl(t.until, { h: `${String(end).padStart(2, "0")}:00` })}`
        : `${t.t2} · ${this._tpl(t.until, { h: `${String(start).padStart(2, "0")}:00` })}`],
      ["leakage", t.leakage, this._kwh(this._num("leakage"))],
      ["cpu_temp", t.mcu_temp, this._q(this._num("cpu_temp"), 0, "°C")],
      ["relay", t.relay, relay ? (relay.state === "on" ? t.on : t.off) : "—"],
      ["voltage", t.link, st.kind === "offline" ? t.offline : this._ago(st.age ?? 0)],
    ].filter(([k]) => this._st(k));
    const box = el.querySelector("[data-now]");
    const sig = JSON.stringify(rows);
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = rows.map(([k, label, v]) => `<div class="kv" data-k="${k}"><span>${label}</span><span>${v}</span></div>`).join("");
      box.querySelectorAll("[data-k]").forEach((r) => r.addEventListener("click", () => this._moreInfo(r.dataset.k)));
    }
  }
}

if (!customElements.get("energy-meter-card")) {
  customElements.define("energy-meter-card", EnergyMeterCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "energy-meter-card",
    name: "Energy Meter",
    description: "Mains energy meter: live gauge, meter reading, day/night tariffs and protection states.",
    preview: true,
  });
  console.info(`%c ENERGY-METER-CARD %c ${CARD_VERSION} `, "background:#4f86e8;color:#fff;font-weight:600", "");
}
