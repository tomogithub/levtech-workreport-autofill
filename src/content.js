chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_REPORT_STATUS") {
    sendResponse(getReportStatus());
    return false;
  }

  if (message?.type === "APPLY_WORKREPORT_VALUES") {
    try {
      sendResponse(applyWorkreportValues(message.settings || {}));
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  }

  return false;
});

const FIELD_KEYS = ["startTime", "endTime", "breakTime", "comment"];

function getReportStatus() {
  const rows = getReportRows();
  return {
    ok: rows.length > 0,
    month: getReportMonth(),
    totalRows: rows.length,
    workdays: rows.filter((row) => !row.isDayOff).length,
    filledRows: rows.filter(rowHasValue).length
  };
}

function applyWorkreportValues(settings) {
  const values = normalizeSettings(settings);
  const rows = getReportRows();
  if (rows.length === 0) {
    throw new Error("作業報告書の入力欄が見つかりません。");
  }

  let changed = 0;
  let skipped = 0;

  rows.forEach((row) => {
    if (values.weekdaysOnly && row.isDayOff) {
      skipped += 1;
      return;
    }

    if (!values.overwrite && rowHasValue(row)) {
      skipped += 1;
      return;
    }

    setInputValue(row.startTime, values.startTime);
    setInputValue(row.endTime, values.endTime);
    setInputValue(row.breakTime, values.breakTime);
    setInputValue(row.comment, values.workContent);
    changed += 1;
  });

  return {
    ok: true,
    changed,
    skipped,
    totalRows: rows.length,
    month: getReportMonth()
  };
}

function normalizeSettings(settings) {
  const startTime = normalizeTime(settings.startTime, "10:00");
  const endTime = normalizeTime(settings.endTime, "19:00");
  const breakTime = normalizeTime(settings.breakTime, "01:00");
  const workContent = String(settings.workContent || "開発業務").trim();

  if (!workContent) {
    throw new Error("作業内容を入力してください。");
  }

  return {
    startTime,
    endTime,
    breakTime,
    workContent,
    weekdaysOnly: settings.weekdaysOnly !== false,
    overwrite: settings.overwrite === true
  };
}

function normalizeTime(value, fallback) {
  const text = String(value || fallback).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`時刻の形式が正しくありません: ${text}`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error(`時刻の範囲が正しくありません: ${text}`);
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// 入力欄は name="rows.{index}.{startTime|endTime|breakTime|comment}" の形式。
// index ごとに1行としてまとめる。
function getReportRows() {
  const rowsByIndex = new Map();

  document.querySelectorAll('input[name^="rows."]').forEach((input) => {
    const match = input.name.match(/^rows\.(\d+)\.(\w+)$/);
    if (!match || !FIELD_KEYS.includes(match[2])) {
      return;
    }

    const index = Number(match[1]);
    if (!rowsByIndex.has(index)) {
      rowsByIndex.set(index, { index });
    }
    rowsByIndex.get(index)[match[2]] = input;
  });

  return Array.from(rowsByIndex.values())
    .filter((row) => FIELD_KEYS.every((key) => row[key]))
    .sort((a, b) => a.index - b.index)
    .map((row) => {
      const tr = row.startTime.closest("tr");
      const labelCell = tr?.querySelector("td");
      return {
        ...row,
        label: labelCell?.textContent.trim() || "",
        isDayOff: isDayOff(labelCell)
      };
    });
}

// 土曜・日曜・祝日は日付セルに *_labelSaturday / *_labelHolidayOrSunday が付く。
// CSS Modules の接頭辞（例: u3eC6a_）は変わりうるので後半一致で判定し、曜日表記も予備で見る。
function isDayOff(labelCell) {
  if (!labelCell) {
    return false;
  }

  if (labelCell.querySelector('[class*="_labelSaturday"], [class*="_labelHolidayOrSunday"]')) {
    return true;
  }

  return /[（(][土日祝][）)]/.test(labelCell.textContent);
}

function rowHasValue(row) {
  return FIELD_KEYS.some((key) => row[key].value.trim());
}

// React の制御コンポーネントは input.value への直接代入を検知しないため、
// ネイティブの setter で値を設定してから input イベントを発火する。
const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;

function setInputValue(input, value) {
  if (input.disabled || input.readOnly) {
    return;
  }

  input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  nativeValueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("blur"));
}

// ヘッダーの「対象期間 2026/10/01 ～ 2026/10/31」から対象月を取得する。
function getReportMonth() {
  const text = document.body?.innerText || "";
  const match = text.match(/対象期間\s*(\d{4})\/(\d{1,2})\/\d{1,2}/);
  if (!match) {
    return "";
  }
  return `${match[1]}年${Number(match[2])}月`;
}
