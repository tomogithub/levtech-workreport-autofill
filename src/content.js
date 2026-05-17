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

function getReportStatus() {
  const rows = getReportRows();
  return {
    ok: rows.length > 0,
    month: getReportMonth(),
    totalRows: rows.length,
    workdays: rows.filter((row) => !row.isWeekend).length,
    filledRows: rows.filter((row) => row.start.value || row.end.value || row.break.value || row.content.value).length
  };
}

function applyWorkreportValues(settings) {
  const values = normalizeSettings(settings);
  const rows = getReportRows();
  let changed = 0;
  let skipped = 0;

  rows.forEach((row) => {
    if (values.weekdaysOnly && row.isWeekend) {
      skipped += 1;
      return;
    }

    const rowHasValue = row.start.value || row.end.value || row.break.value || row.content.value;
    if (!values.overwrite && rowHasValue) {
      skipped += 1;
      return;
    }

    setInputValue(row.start, values.startTime);
    setInputValue(row.end, values.endTime);
    setInputValue(row.break, values.breakTime);
    setInputValue(row.content, values.workContent);
    updateWorkTime(row.dateKey, values.startTime, values.endTime, values.breakTime);
    changed += 1;
  });

  updateMonthlySummary();

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

function getReportRows() {
  return Array.from(document.querySelectorAll("#working-report tr"))
    .map((tr) => {
      const targetDate = tr.querySelector('input[name$="[target_date]"]');
      if (!targetDate) {
        return null;
      }

      const dateKey = targetDate.name.match(/\[DailyReport\]\[(\d{8})\]/)?.[1];
      if (!dateKey) {
        return null;
      }

      const label = tr.querySelector("td.txtNormal")?.textContent || "";
      const start = tr.querySelector(`input[datetime="${dateKey}"][ref="start_time"]`);
      const end = tr.querySelector(`input[datetime="${dateKey}"][ref="end_time"]`);
      const breakInput = tr.querySelector(`input[datetime="${dateKey}"][ref="relax_time"]`);
      const content = tr.querySelector(`input[name="data[DailyReport][${dateKey}][work_content]"]`);

      if (!start || !end || !breakInput || !content) {
        return null;
      }

      return {
        dateKey,
        isWeekend: /[（(][土日][）)]/.test(label),
        start,
        end,
        break: breakInput,
        content
      };
    })
    .filter(Boolean);
}

function setInputValue(input, value) {
  input.focus();
  input.value = value;
  ["input", "change", "keyup", "blur", "focusout"].forEach((eventName) => {
    input.dispatchEvent(new Event(eventName, { bubbles: true }));
  });
}

function updateWorkTime(dateKey, startTime, endTime, breakTime) {
  const workTime = calculateWorkTime(startTime, endTime, breakTime);
  const display = document.querySelector(`.work_time_field[datetime="${dateKey}"]`);
  const hidden = document.querySelector(`input[name="data[DailyReport][${dateKey}][work_time]"]`);

  if (display) {
    display.textContent = workTime;
  }

  if (hidden) {
    hidden.value = workTime;
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function calculateWorkTime(startTime, endTime, breakTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const rest = timeToMinutes(breakTime);
  const total = Math.max(0, end - start - rest);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function updateMonthlySummary() {
  const filledWorkTimes = Array.from(document.querySelectorAll(".work_time_field"))
    .map((field) => field.textContent.trim())
    .filter(Boolean);
  const totalMinutes = filledWorkTimes.reduce((sum, value) => sum + timeToMinutes(value), 0);
  const workingDay = filledWorkTimes.length;
  const totalTime = `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`;

  setText(".working_day", workingDay ? `${workingDay}.0` : "0.0");
  setText(".actualy_work_time", workingDay ? totalTime : "");
  setValue("#MonthlyReportWorkingDay", String(workingDay));
  setValue("#MonthlyReportActualyWorkTime", workingDay ? totalTime : "");
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function setValue(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.value = value;
  }
}

function getReportMonth() {
  return document.querySelector(".reportTop__list__data__txtInput")?.textContent.trim() || "";
}
