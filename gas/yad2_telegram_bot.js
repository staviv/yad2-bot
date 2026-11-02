/**
 * ============================================================================
 * 🏠 בוט אוטומטי ואינטראקטיבי לסריקת דירות להשכרה ביד 2 (Google Apps Script + GitHub Actions + Telegram + Sheets)
 * שליטה מלאה באמצעות כפתורים (ללא צורך בפקודות!), איחוד חיפושים, חיפוש bBox נקי (ללא עיר/אזור), וסינון מחירים
 * ============================================================================
 */

// ============================================================================
// 🔧 הגדרות ראשיות (Configuration)
// ============================================================================
const CONFIG = {
  // 1. חובה: טוקן הבוט של טלגרם (שמור בבטחה ב-ScriptProperties ונטען אוטומטית):
  TELEGRAM_BOT_TOKEN: '',

  // 2. מומלץ: הזן כאן את ה-Chat ID של הקבוצה הזוגית שלכם (מתחיל במינוס, למשל '-1001234567890')
  // או השאר ריק, ושלח הודעה או לחץ על כפתור בקבוצה והוא יישמר אוטומטית!
  TELEGRAM_CHAT_ID: '',

  // 3. כתובת ה-Web App של Google Apps Script שלך (מסתיימת ב-/exec):
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycby2MJGz3Bq8fJJUtL8r0gWuJGa9I9H-1AaannsZuDyakbSIdq38wYpZrXIrRheMdshUgw/exec',

  // 4. (אופציונלי) חיבור להפעלה מרחוק של GitHub Actions מתוך Google Apps Script:
  GITHUB_REPO: 'staviv/yad2-bot',
  GITHUB_TOKEN: '', // שמור בבטחה ב-ScriptProperties (נטען אוטומטית ע"י triggerGitHubActionsWorkflow_)
  GITHUB_WORKFLOW_FILE: 'yad2_scanner.yml',

  // מזהה קובץ ה-Google Sheets (אם הסקריפט נוצר מתוך הגיליון דרך Extensions > Apps Script, השאר ריק ''):
  SPREADSHEET_ID: '',

  // 💰 הגבלות מחיר ברירת מחדל גלובליות (בש"ח)
  DEFAULT_MIN_PRICE: 0,
  DEFAULT_MAX_PRICE: 0,

  // האם לסנן מודעות שבהן המפרסם לא ציין מחיר כלל כשיש תקרת מחיר פעילה?
  EXCLUDE_UNPRICED_WHEN_MAX_SET: false,

  // הגדרות תזמון אקראי (בדקות): ממוצע 20 דקות ± 10 דקות (טווח של 10 עד 30 דקות)
  MIN_INTERVAL_MINUTES: 10,
  MAX_INTERVAL_MINUTES: 30,

  // האם בסריקה הראשונה של קישור חדש לשלוח התראות על כל הדירות הקיימות או רק לשמור אותן בגיליון?
  NOTIFY_ON_INITIAL_SEED: false,

  // מספר הדירות המקסימלי לשליחה בטלגרם בריצה אחת
  MAX_NOTIFICATIONS_PER_RUN: 15,

  // שמות הגיליונות בקובץ ה-Google Sheets
  SHEETS: {
    SEARCHES: 'קישורי חיפוש',
    APARTMENTS: 'דירות שנמצאו',
    LOGS: 'יומן מערכת'
  },

  // קישורי החיפוש ההתחלתיים:
  // שים לב: בחיפוש מפה bBox הסרנו לחלוטין את area= ו-city= כדי שיד 2 יחזיר את כל הדירות בתוך הריבוע הגיאוגרפי בלבד!
  DEFAULT_SEARCH_URLS: [
    {
      name: 'אזור גדרה - יבנה והסביבה (אזור 52)',
      url: 'https://www.yad2.co.il/realestate/rent/south?area=52'
    },
    {
      name: 'אזור השפלה - קריית מלאכי, חצב, באר טוביה והמושבים (אזור 99)',
      url: 'https://www.yad2.co.il/realestate/rent/south?area=99'
    },
    {
      name: 'חיפוש מפה (bBox נקי - ללא הגבלת עיר/אזור): גדרה, יבנה, חצב וקריית מלאכי',
      url: 'https://www.yad2.co.il/realestate/rent?bBox=31.700000%2C34.682888%2C31.862425%2C34.894362&zoom=11'
    }
  ]
};

// טקסטים של כפתורי המקלדת הקבועה בתחתית הצ'אט
const REPLY_BTN = {
  MENU: '🎛 תפריט ראשי',
  SCAN: '🚀 סריקה עכשיו',
  SEARCHES: '📋 ניהול ואיחוד חיפושים',
  BBOX: '🗺 חיפוש מפה (bBox)',
  PRICE: '💰 הגדרת מחיר',
  STATUS: '📊 סטטוס וגיליון'
};

// ============================================================================
// 🚀 פונקציות התקנה, בדיקה והפעלה ראשונית (להרצה ידנית מעורך הסקריפט)
// ============================================================================

function setupBot() {
  const ss = getSpreadsheet_();
  initSheets_(ss);
  ensureExtendedSearchAreas_(ss);
  clearProxySettings();
  logEvent_('SETUP', 'המערכת אותחלה בהצלחה והגיליונות עודכנו.');

  // ניתוק Webhook ישן כדי ש-getUpdates יעבוד חלק ובמהירות (וייעזר ב-Webhook אם קיים WEB_APP_URL)
  deleteTelegramWebhook();

  // רישום תפריט הפקודות בטלגרם
  setTelegramBotCommands_();

  // הפעלת טריגר בדיקת הודעות ולחיצות כפתורים כל דקה
  setupTelegramPollingTrigger_();

  // קריאת הודעות ולחיצות כפתורים ממתינות בטלגרם
  pollTelegramUpdates_();

  // אם כבר יש Chat ID שמור, נשלח אליו מיד את התפריט האינטראקטיבי החדש עם הכפתורים!
  const chatId = getChatId_();
  if (chatId) {
    sendInteractiveMainMenu_(chatId, '🎉 *הבוט עודכן לממשק כפתורים אינטראקטיבי מלא!*\nבחרו פעולה מהכפתורים למטה:');
  }

  // הפעלת הריצה והתזמון האקראי (10-30 דקות)
  runYad2Scanner(false);
}

/**
 * מוודא שהגיליון הקיים כולל את אזור השפלה (area=99), מנקה אוטומטית קישורי bBox מפרמטרים של area/city,
 * ומוסיף עמודת מחיר מקסימלי
 */
function ensureExtendedSearchAreas_(ss) {
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SEARCHES);
  if (!sheet) return;

  const col8Header = String(sheet.getRange(1, 8).getValue() || '').trim();
  if (!col8Header) {
    sheet.getRange(1, 8).setValue('מחיר מקסימלי (₪)')
      .setFontWeight('bold')
      .setBackground('#1a73e8')
      .setFontColor('#ffffff');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const rangeValues = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const urls = [];

  for (let i = 0; i < rangeValues.length; i++) {
    let rawUrl = String(rangeValues[i][2] || '').trim();
    if (!rawUrl) continue;

    // אם קיים קישור עם bBox שיש בו area= או city=, ננקה אותו אוטומטית כדי שיעבוד כ-bBox טהור!
    if (rawUrl.indexOf('bBox=') !== -1 && (rawUrl.indexOf('area=') !== -1 || rawUrl.indexOf('city=') !== -1)) {
      const cleanedBBoxUrl = sanitizeBBoxUrl_(rawUrl);
      if (cleanedBBoxUrl !== rawUrl) {
        sheet.getRange(i + 2, 3).setValue(cleanedBBoxUrl);
        rawUrl = cleanedBBoxUrl;
      }
    }
    urls.push(rawUrl);
  }

  const hasFullArea99 = urls.some(function(u) {
    return u.indexOf('area=99') !== -1 && u.indexOf('city=') === -1;
  });

  if (!hasFullArea99) {
    sheet.appendRow([
      'כן',
      'אזור השפלה - קריית מלאכי, חצב, באר טוביה והמושבים (אזור 99)',
      'https://www.yad2.co.il/realestate/rent/south?area=99',
      '',
      'נוסף בעדכון אזור השפלה',
      '',
      'כולל את מושב חצב, קריית מלאכי וכל יישובי הסביבה',
      ''
    ]);
  }

  const hasFullArea52 = urls.some(function(u) {
    return u.indexOf('area=52') !== -1 && u.indexOf('bBox=') === -1 && u.indexOf('city=') === -1;
  });

  if (!hasFullArea52) {
    sheet.appendRow([
      'כן',
      'אזור גדרה - יבנה והסביבה (אזור 52)',
      'https://www.yad2.co.il/realestate/rent/south?area=52',
      '',
      'נוסף בעדכון אזור גדרה-יבנה',
      '',
      'חיפוש אזורי מלא (ללא חיתוך מפה)',
      ''
    ]);
  }
}

function clearProxySettings() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('SCRAPEDO_API_TOKEN');
  props.deleteProperty('SCRAPERAPI_KEY');
  props.deleteProperty('SCRAPER_PROXY_URL');
}

function setTelegramBotCommands_() {
  const token = getBotToken_();
  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') return;

  const commands = [
    { command: 'menu', description: 'פתיחת לוח הכפתורים האינטראקטיבי' },
    { command: 'scan', description: 'הפעלת סריקת דירות מיידית' },
    { command: 'list', description: 'ניהול, איחוד ומחיקת חיפושים בכפתורים' },
    { command: 'price', description: 'בחירת תקרת מחיר בכפתורים' },
    { command: 'bbox', description: 'הגדרת חיפוש מפה (bBox נקי ללא עיר/אזור)' },
    { command: 'status', description: 'בדיקת סטטוס הבוט ומועד סריקה הבאה' },
    { command: 'help', description: 'פתיחת התפריט הראשי והמדריך' }
  ];

  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/setMyCommands', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ commands: commands }),
      muteHttpExceptions: true
    });
  } catch (e) {}
}

function testTelegramConnection() {
  const token = getBotToken_();
  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    throw new Error('❌ חסר TELEGRAM_BOT_TOKEN! הזן את הטוקן שקיבלת מ-@BotFather בקובץ ושמור (Ctrl+S).');
  }

  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/deleteWebhook', { muteHttpExceptions: true });
  setTelegramBotCommands_();
  setupTelegramPollingTrigger_();
  pollTelegramUpdates_();

  const chatId = getChatId_();
  if (!chatId) {
    throw new Error('⚠️ שלח הודעה כלשהי בקבוצה הזוגית שלכם (או בפרטי לבוט) ואז הרץ שוב את testTelegramConnection.');
  }

  sendInteractiveMainMenu_(
    chatId,
    '✅ *החיבור לטלגרם ול-Google Sheets תקין ופעיל!*\n' +
    'כל הפעולות זמינות כעת בלחיצת כפתור מתוך התפריט למטה:'
  );
}

function setupTelegramPollingTrigger_() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'checkTelegramCommandsTrigger') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    ScriptApp.newTrigger('checkTelegramCommandsTrigger')
      .timeBased()
      .everyMinutes(1)
      .create();
    logEvent_('TG_TRIGGER', 'הופעל טריגר בדיקת הודעות וכפתורי טלגרם אוטומטי (כל דקה).');
  } catch (err) {
    logEvent_('TG_TRIGGER_ERR', 'שגיאה בהקמת טריגר טלגרם: ' + err.message);
  }
}

function checkTelegramCommandsTrigger() {
  pollTelegramUpdates_();
}

function deleteTelegramWebhook() {
  const token = getBotToken_();
  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') return;
  const apiUrl = 'https://api.telegram.org/bot' + token + '/deleteWebhook';
  const res = UrlFetchApp.fetch(apiUrl, { muteHttpExceptions: true });
  logEvent_('WEBHOOK_DEL', 'Webhook של טלגרם נמחק (עובד במצב getUpdates אוטומטי): ' + res.getContentText());
}

// ============================================================================
// 🗺️ ניקוי ואיחוד חיפושים + חיפוש bBox נקי (ללא עיר ואזור!)
// ============================================================================

/**
 * מוודא שכל קישור שמכיל bBox= יהיה נקי לחלוטין מפרמטרים מגבילים של area=, city=, neighborhood=, topArea=
 * וגם מסיר סיומת של אזור בנתיב (כמו /realestate/rent/south -> /realestate/rent)
 * כך שיד 2 יחפש אך ורק לפי הקואורדינטות של ה-bBox!
 */
function sanitizeBBoxUrl_(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url || url.indexOf('bBox=') === -1) return url;

  const qIdx = url.indexOf('?');
  if (qIdx === -1) return url;

  // הפיכת הנתיב לנתיב כללי ללא נעילת אזור (/realestate/rent במקום /realestate/rent/south)
  const basePath = 'https://www.yad2.co.il/realestate/rent';
  const queryString = url.substring(qIdx + 1);
  const parts = queryString.split('&');
  const keptParts = [];

  for (let i = 0; i < parts.length; i++) {
    const kv = parts[i];
    if (!kv) continue;
    const eqIdx = kv.indexOf('=');
    const key = (eqIdx === -1 ? kv : kv.substring(0, eqIdx)).trim().toLowerCase();

    // מסירים את כל הפרמטרים של עיר/אזור/שכונה כשמדובר בחיפוש bBox!
    if (
      key === 'area' ||
      key === 'toparea' ||
      key === 'city' ||
      key === 'neighborhood' ||
      key === 'multiarea' ||
      key === 'multicity' ||
      key === 'region'
    ) {
      continue;
    }
    keptParts.push(kv);
  }

  return basePath + '?' + keptParts.join('&');
}

/**
 * בונה קישור bBox נקי מ-4 קואורדינטות או ממחרוזת bBox או מאחד שני קישורי bBox לריבוע אחד שמכיל את שניהם!
 */
function parseBBoxCoordsFromTextOrUrl_(input) {
  if (!input) return null;
  const decoded = decodeURIComponent(String(input)).trim();

  // חיפוש bBox=lat1,lon1,lat2,lon2 בתוך URL
  const bboxParamMatch = decoded.match(/bBox=([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
  const targetStr = bboxParamMatch ? (bboxParamMatch[1] + ',' + bboxParamMatch[2] + ',' + bboxParamMatch[3] + ',' + bboxParamMatch[4]) : decoded;

  const numsMatch = targetStr.match(/([23]\d\.\d+)\s*[,\s]\s*(3[345]\.\d+)\s*[,\s]\s*([23]\d\.\d+)\s*[,\s]\s*(3[345]\.\d+)/);
  if (!numsMatch) return null;

  const lat1 = parseFloat(numsMatch[1]);
  const lon1 = parseFloat(numsMatch[2]);
  const lat2 = parseFloat(numsMatch[3]);
  const lon2 = parseFloat(numsMatch[4]);

  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return null;

  return {
    minLat: Math.min(lat1, lat2),
    minLon: Math.min(lon1, lon2),
    maxLat: Math.max(lat1, lat2),
    maxLon: Math.max(lon1, lon2)
  };
}

function buildCleanBBoxYad2Url_(coords, maxPrice) {
  const bboxValue = [
    coords.minLat.toFixed(6),
    coords.minLon.toFixed(6),
    coords.maxLat.toFixed(6),
    coords.maxLon.toFixed(6)
  ].join('%2C');

  let url = 'https://www.yad2.co.il/realestate/rent?bBox=' + bboxValue + '&zoom=11';
  if (maxPrice && maxPrice > 0) {
    url = applyPriceParamsToYad2Url_(url, 0, maxPrice);
  }
  return url;
}

/**
 * מאחד את כל החיפושים הפעילים (או חיפושים נבחרים) בגיליון:
 * 1. אם יש מספר חיפושי מפה (bBox) -> מאחד אותם לריבוע גיאוגרפי (Bounding Box) אחד רחב ונקי (ללא עיר/אזור)!
 * 2. מסיר חיפושים כפולים או חיפושי עיר ספציפית שכבר מכוסים ע"י החיפוש האזורי הרחב שלהם (למשל עיר 1034 שכבר כלולה ב-area=99).
 * 3. אם המשתמש ביקש איחוד מלא ל-bBox מאוחד אחד (mode === 'BBOX_ALL'), ממיר את כל האזורים לריבוע מפה מאוחד אחד שסורק הכל בריצה אחת מהירה!
 */
function mergeActiveSearchesInSheet_(ss, mode) {
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SEARCHES);
  const activeSearches = getActiveSearchUrls_(ss);

  if (activeSearches.length <= 1 && mode !== 'BBOX_ALL') {
    return {
      merged: false,
      message: 'יש כרגע רק חיפוש פעיל אחד, לכן אין צורך באיחוד.'
    };
  }

  const globalLimits = getGlobalPriceLimits_();
  let maxPriceToKeep = globalLimits.maxPrice || 0;
  for (let i = 0; i < activeSearches.length; i++) {
    if (activeSearches[i].maxPrice > 0 && (!maxPriceToKeep || activeSearches[i].maxPrice < maxPriceToKeep)) {
      maxPriceToKeep = activeSearches[i].maxPrice;
    }
  }

  // מצב 1: איחוד כל החיפושים לחיפוש מפה (bBox) אחד גדול ונקי (ללא עיר ואזור) שמכסה את כל אזור גדרה, יבנה, חצב, קריית מלאכי ובאר טוביה!
  if (mode === 'BBOX_ALL') {
    let combinedBox = {
      minLat: 31.680000, // דרומית לקריית מלאכי ובאר טוביה
      minLon: 34.620000, // מערבית ליבנה/אשדוד
      maxLat: 31.900000, // צפונית ליבנה
      maxLon: 34.900000  // מזרחית לגדרה/חצב
    };

    for (let i = 0; i < activeSearches.length; i++) {
      const c = parseBBoxCoordsFromTextOrUrl_(activeSearches[i].rawUrl || activeSearches[i].url);
      if (c) {
        combinedBox.minLat = Math.min(combinedBox.minLat, c.minLat);
        combinedBox.minLon = Math.min(combinedBox.minLon, c.minLon);
        combinedBox.maxLat = Math.max(combinedBox.maxLat, c.maxLat);
        combinedBox.maxLon = Math.max(combinedBox.maxLon, c.maxLon);
      }
      // השבתת החיפושים הישנים שאוחדו
      sheet.getRange(activeSearches[i].rowIndex, 1).setValue('לא');
    }

    const unifiedUrl = buildCleanBBoxYad2Url_(combinedBox, maxPriceToKeep);
    const unifiedName = 'חיפוש מפה מאוחד (bBox נקי ללא עיר/אזור: גדרה, יבנה, חצב, קריית מלאכי והסביבה)';
    sheet.appendRow([
      'כן',
      unifiedName,
      unifiedUrl,
      '',
      'נוצר מאיחוד חיפושים',
      '',
      'מאחד את כל האזורים לסריקת מפה אחת מהירה ללא הגבלת עיר/אזור',
      maxPriceToKeep > 0 ? maxPriceToKeep : ''
    ]);

    logEvent_('MERGE_BBOX_ALL', 'אוחדו ' + activeSearches.length + ' חיפושים לחיפוש bBox אחד: ' + unifiedUrl);
    return {
      merged: true,
      message: '✅ *כל ' + activeSearches.length + ' החיפושים אוחדו לחיפוש מפה (bBox) אחד רחב ונקי (ללא נעילת עיר או אזור)!*\n' +
        '🔗 הקישור המאוחד החדש:\n' + unifiedUrl
    };
  }

  // מצב 2: איחוד חכם (מאחד קישורי bBox לקישור bBox נקי אחד + מאחד קישורי ערים לתוך האזור המלא שלהן)
  const bboxSearches = [];
  const areaMap = {};
  let deactivatedCount = 0;

  for (let i = 0; i < activeSearches.length; i++) {
    const s = activeSearches[i];
    const rawU = s.rawUrl || s.url;

    if (rawU.indexOf('bBox=') !== -1) {
      bboxSearches.push(s);
      continue;
    }

    const areaMatch = rawU.match(/[?&]area=(\d+)/i);
    const cityMatch = rawU.match(/[?&]city=(\d+)/i);
    if (areaMatch) {
      const areaCode = areaMatch[1];
      if (!areaMap[areaCode]) areaMap[areaCode] = [];
      areaMap[areaCode].push({ search: s, hasCity: Boolean(cityMatch) });
    }
  }

  // א. אם באותו אזור (למשל area=99) יש גם חיפוש אזורי מלא וגם חיפוש עם city=, נשבית את הכפולים
  const areaCodes = Object.keys(areaMap);
  for (let a = 0; a < areaCodes.length; a++) {
    const list = areaMap[areaCodes[a]];
    if (list.length > 1) {
      // נשאיר שורה אחת שתהיה כל האזור (ללא city=)
      const keepEntry = list[0].search;
      const cleanAreaUrl = 'https://www.yad2.co.il/realestate/rent/south?area=' + areaCodes[a];
      sheet.getRange(keepEntry.rowIndex, 3).setValue(cleanAreaUrl);
      if (areaCodes[a] === '99') {
        sheet.getRange(keepEntry.rowIndex, 2).setValue('אזור השפלה - קריית מלאכי, חצב, באר טוביה והמושבים (אזור 99)');
      } else if (areaCodes[a] === '52') {
        sheet.getRange(keepEntry.rowIndex, 2).setValue('אזור גדרה - יבנה והסביבה (אזור 52)');
      }
      for (let k = 1; k < list.length; k++) {
        sheet.getRange(list[k].search.rowIndex, 1).setValue('לא');
        deactivatedCount++;
      }
    }
  }

  // ב. איחוד וניקוי כל חיפושי ה-bBox לריבוע מפה אחד נקי (ללא עיר ואזור!)
  if (bboxSearches.length >= 1) {
    let mergedCoords = null;
    for (let b = 0; b < bboxSearches.length; b++) {
      const coords = parseBBoxCoordsFromTextOrUrl_(bboxSearches[b].rawUrl || bboxSearches[b].url);
      if (coords) {
        if (!mergedCoords) {
          mergedCoords = coords;
        } else {
          mergedCoords.minLat = Math.min(mergedCoords.minLat, coords.minLat);
          mergedCoords.minLon = Math.min(mergedCoords.minLon, coords.minLon);
          mergedCoords.maxLat = Math.max(mergedCoords.maxLat, coords.maxLat);
          mergedCoords.maxLon = Math.max(mergedCoords.maxLon, coords.maxLon);
        }
      }
    }

    const primaryBBox = bboxSearches[0];
    const cleanUrl = mergedCoords
      ? buildCleanBBoxYad2Url_(mergedCoords, primaryBBox.maxPrice)
      : sanitizeBBoxUrl_(primaryBBox.rawUrl || primaryBBox.url);

    sheet.getRange(primaryBBox.rowIndex, 2).setValue('חיפוש מפה (bBox נקי - ללא עיר/אזור)');
    sheet.getRange(primaryBBox.rowIndex, 3).setValue(cleanUrl);

    for (let b = 1; b < bboxSearches.length; b++) {
      sheet.getRange(bboxSearches[b].rowIndex, 1).setValue('לא');
      deactivatedCount++;
    }
  }

  logEvent_('SMART_MERGE', 'בוצע איחוד חכם וניקוי bBox. הושבתו ' + deactivatedCount + ' חיפושים כפולים.');
  return {
    merged: true,
    message: '✅ *בוצע איחוד וניקוי חכם של החיפושים!*\n' +
      '• כל חיפושי ה-`bBox` נוקו מפרמטרים של עיר ואזור (`area`/`city`) ואוחדו.\n' +
      '• הוסרו/אוחדו *' + deactivatedCount + '* שורות חיפוש כפולות או מצומצמות.'
  };
}

// ============================================================================
// ☁️ הפעלה אוטומטית של GitHub Actions מתוך Google Apps Script
// ============================================================================

function triggerGitHubActionsWorkflow_() {
  const props = PropertiesService.getScriptProperties();
  const repo = (props.getProperty('GITHUB_REPO') || CONFIG.GITHUB_REPO || '').trim();
  const ghToken = (props.getProperty('GITHUB_TOKEN') || CONFIG.GITHUB_TOKEN || '').trim();
  const workflowFile = (props.getProperty('GITHUB_WORKFLOW_FILE') || CONFIG.GITHUB_WORKFLOW_FILE || 'yad2_scanner.yml').trim();

  if (!repo || !ghToken) {
    return { triggered: false, reason: 'NO_GITHUB_CREDENTIALS' };
  }

  const apiUrl = 'https://api.github.com/repos/' + repo + '/actions/workflows/' + workflowFile + '/dispatches';
  const res = UrlFetchApp.fetch(apiUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + ghToken,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Google-Apps-Script-Yad2-Bot'
    },
    payload: JSON.stringify({ ref: 'main' }),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code === 204 || code === 200) {
    logEvent_('GITHUB_DISPATCH', 'הופעלה סריקת ענן ב-GitHub Actions (' + repo + ').');
    return { triggered: true };
  }

  if (code === 422) {
    const resMaster = UrlFetchApp.fetch(apiUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + ghToken,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Google-Apps-Script-Yad2-Bot'
      },
      payload: JSON.stringify({ ref: 'master' }),
      muteHttpExceptions: true
    });
    if (resMaster.getResponseCode() === 204 || resMaster.getResponseCode() === 200) {
      logEvent_('GITHUB_DISPATCH', 'הופעלה סריקת ענן ב-GitHub Actions (' + repo + ' [master]).');
      return { triggered: true };
    }
  }

  logEvent_('GITHUB_ERR', 'שגיאה בהפעלת GitHub Actions (' + code + '): ' + res.getContentText());
  return { triggered: false, reason: 'HTTP_' + code, details: res.getContentText() };
}

// ============================================================================
// 🌐 נקודות קצה (doGet / doPost) לתקשורת מול GitHub Actions וטלגרם
// ============================================================================

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'searches';
    const ss = getSpreadsheet_();
    initSheets_(ss);

    if (action === 'searches') {
      const searches = getActiveSearchUrls_(ss);
      const globalLimits = getGlobalPriceLimits_();
      return ContentService.createTextOutput(JSON.stringify({
        ok: true,
        minIntervalMinutes: CONFIG.MIN_INTERVAL_MINUTES,
        maxIntervalMinutes: CONFIG.MAX_INTERVAL_MINUTES,
        globalMinPrice: globalLimits.minPrice,
        globalMaxPrice: globalLimits.maxPrice,
        searches: searches
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, status: 'Yad2 Bot Active' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Empty payload' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const payload = JSON.parse(e.postData.contents);

    // א. קליטת תוצאות סריקה מ-GitHub Actions:
    if (payload.type === 'yad2_ingest') {
      const ingestResult = processIngestedYad2Payload_(payload);
      return ContentService.createTextOutput(JSON.stringify(ingestResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ב. קליטת הודעות ולחיצות כפתורים מטלגרם:
    if (payload.update_id || payload.message || payload.callback_query || payload.my_chat_member) {
      handleTelegramUpdateObject_(payload);
    }
  } catch (err) {
    logEvent_('POST_ERR', err.message);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput('OK');
}

/**
 * מעבד את נתוני הדירות שהגיעו מ-GitHub Actions, מאחד תוצאות מכל החיפושים (מונע כפילויות בין אזורים ו-bBox),
 * מסנן לפי תקרת מחיר ושולח לקבוצה!
 */
function processIngestedYad2Payload_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const ss = getSpreadsheet_();
    initSheets_(ss);

    const seenTokensMap = getSeenTokensMap_(ss);
    const isInitialDatabaseEmpty = Object.keys(seenTokensMap).length === 0;
    const mergedListingsByToken = {};
    const searchStats = [];
    const activeSearches = getActiveSearchUrls_(ss);
    const globalPriceLimits = getGlobalPriceLimits_();
    const globalRoomsLimits = getGlobalRoomsLimits_();

    let totalFilteredOutByPrice = 0;
    const pages = Array.isArray(payload.pages) ? payload.pages : [payload];

    for (let i = 0; i < pages.length; i++) {
      const pageEntry = pages[i];
      const sourceUrl = pageEntry.url || 'https://www.yad2.co.il/realestate/rent';
      const matchingSearch = findSearchRowByUrl_(activeSearches, sourceUrl);
      const searchName = pageEntry.name || (matchingSearch ? matchingSearch.name : findSearchNameByUrl_(activeSearches, sourceUrl));

      const effectiveLimits = resolveEffectivePriceLimits_(sourceUrl, matchingSearch, pageEntry, globalPriceLimits);

      let extractedRaw = [];
      if (pageEntry.nextData) {
        const obj = typeof pageEntry.nextData === 'string' ? JSON.parse(pageEntry.nextData) : pageEntry.nextData;
        extractedRaw = extractListingsFromNextDataObject_(obj, sourceUrl);
      } else if (pageEntry.html) {
        extractedRaw = parseListingsFromHtmlOrJson_(pageEntry.html, sourceUrl);
      } else if (Array.isArray(pageEntry.listings)) {
        extractedRaw = pageEntry.listings.map(function(raw) {
          return normalizeYad2ListingItem_(raw, sourceUrl);
        }).filter(Boolean);
      }

      const extracted = [];
      let pageFilteredByPrice = 0;

      for (let r = 0; r < extractedRaw.length; r++) {
        const candidate = extractedRaw[r];
        if (!candidate || !candidate.token) continue;

        if (isListingMatchingPriceLimits_(candidate, effectiveLimits) && isListingMatchingRoomsLimits_(candidate, globalRoomsLimits)) {
          extracted.push(candidate);
        } else {
          pageFilteredByPrice++;
          totalFilteredOutByPrice++;
        }
      }

      if (matchingSearch) {
        searchStats.push({
          rowIndex: matchingSearch.rowIndex,
          name: matchingSearch.name,
          status: pageEntry.error ? ('ERROR: ' + pageEntry.error) : 'OK (GitHub Actions)',
          totalFound: extracted.length,
          filteredByPrice: pageFilteredByPrice,
          error: pageEntry.error || ''
        });
      }

      for (let j = 0; j < extracted.length; j++) {
        const item = extracted[j];
        if (!item || !item.token) continue;

        if (!mergedListingsByToken[item.token]) {
          item.matchedSearches = [searchName];
          mergedListingsByToken[item.token] = item;
        } else {
          if (mergedListingsByToken[item.token].matchedSearches.indexOf(searchName) === -1) {
            mergedListingsByToken[item.token].matchedSearches.push(searchName);
          }
          mergedListingsByToken[item.token] = mergeListingObjects_(mergedListingsByToken[item.token], item);
        }
      }
    }

    const allCurrentTokens = Object.keys(mergedListingsByToken);
    const newListings = [];

    for (let k = 0; k < allCurrentTokens.length; k++) {
      const token = allCurrentTokens[k];
      if (!seenTokensMap[token]) {
        newListings.push(mergedListingsByToken[token]);
        seenTokensMap[token] = true;
      }
    }

    if (newListings.length > 0) {
      saveNewListingsToSheet_(ss, newListings);
    }

    const shouldNotify = !isInitialDatabaseEmpty || CONFIG.NOTIFY_ON_INITIAL_SEED;
    let notifiedCount = 0;
    const chatId = getChatId_();

    if (newListings.length > 0 && shouldNotify) {
      notifiedCount = sendNewListingsToTelegram_(newListings);
    } else if (newListings.length > 0 && !shouldNotify && chatId) {
      sendTelegramText_(
        chatId,
        '✅ *סריקה ראשונית מ-GitHub Actions הושלמה בהצלחה!*\n' +
        'נמצאו ונשמרו בגיליון *' + newListings.length + '* דירות קיימות מתוך החיפושים שלכם' +
        (totalFilteredOutByPrice > 0 ? ' (סוננו *' + totalFilteredOutByPrice + '* דירות שחרגו מתקרת המחיר)' : '') + '.\n' +
        'מעתה תקבלו לכאן התראה מידית בכל פעם שתעלה דירה חדשה!'
      );
    }

    if (searchStats.length > 0) {
      updateSearchSheetStats_(ss, searchStats, newListings);
    }

    logEvent_(
      'GITHUB_INGEST_OK',
      'נקלטו מ-GitHub Actions סה"כ ' + allCurrentTokens.length + ' דירות תואמות | סוננו במחיר: ' + totalFilteredOutByPrice + ' | חדשות: ' + newListings.length + ' | נשלחו בטלגרם: ' + notifiedCount
    );

    return {
      ok: true,
      totalScanned: allCurrentTokens.length,
      filteredByPrice: totalFilteredOutByPrice,
      newCount: newListings.length,
      notifiedCount: notifiedCount
    };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// 💰 מנגנון חילוץ, הזרקה וסינון מחירים (URL + Google Sheets + כפתורי טלגרם)
// ============================================================================

function getGlobalPriceLimits_() {
  const props = PropertiesService.getScriptProperties();
  const minProp = parseInt(props.getProperty('GLOBAL_MIN_PRICE') || '', 10);
  const maxProp = parseInt(props.getProperty('GLOBAL_MAX_PRICE') || '', 10);

  return {
    minPrice: (!isNaN(minProp) && minProp > 0) ? minProp : (CONFIG.DEFAULT_MIN_PRICE || 0),
    maxPrice: (!isNaN(maxProp) && maxProp > 0) ? maxProp : (CONFIG.DEFAULT_MAX_PRICE || 0)
  };
}

function setGlobalPriceLimits_(minPrice, maxPrice) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('GLOBAL_MIN_PRICE', String(minPrice > 0 ? minPrice : 0));
  props.setProperty('GLOBAL_MAX_PRICE', String(maxPrice > 0 ? maxPrice : 0));
}

function extractPriceLimitsFromYad2Url_(url) {
  let minPrice = 0;
  let maxPrice = 0;
  if (!url) return { minPrice: 0, maxPrice: 0 };

  const decoded = decodeURIComponent(String(url));

  const minMatch = decoded.match(/[?&](?:minPrice|fromPrice)=(\d+)/i);
  if (minMatch) {
    const val = parseInt(minMatch[1], 10);
    if (!isNaN(val) && val > 0) minPrice = val;
  }

  const maxMatch = decoded.match(/[?&](?:maxPrice|toPrice)=(\d+)/i);
  if (maxMatch) {
    const val = parseInt(maxMatch[1], 10);
    if (!isNaN(val) && val > 0) maxPrice = val;
  }

  const rangeMatch = decoded.match(/[?&]price=(-?\d+)-(-?\d+)/i);
  if (rangeMatch) {
    const rMin = parseInt(rangeMatch[1], 10);
    const rMax = parseInt(rangeMatch[2], 10);
    if (!isNaN(rMin) && rMin > 0 && !minPrice) minPrice = rMin;
    if (!isNaN(rMax) && rMax > 0 && !maxPrice) maxPrice = rMax;
  } else {
    const singlePriceMatch = decoded.match(/[?&]price=(\d+)(?:&|$)/i);
    if (singlePriceMatch && !maxPrice) {
      const sMax = parseInt(singlePriceMatch[1], 10);
      if (!isNaN(sMax) && sMax > 0) maxPrice = sMax;
    }
  }

  return { minPrice: minPrice, maxPrice: maxPrice };
}

function applyPriceParamsToYad2Url_(rawUrl, minPrice, maxPrice) {
  let url = String(rawUrl || '').trim();
  if (!url) return url;

  // אם זה חיפוש מפה bBox, נוודא קודם כל שאין בו area= או city=
  if (url.indexOf('bBox=') !== -1) {
    url = sanitizeBBoxUrl_(url);
  }

  const urlLimits = extractPriceLimitsFromYad2Url_(url);
  const effMin = minPrice > 0 ? minPrice : urlLimits.minPrice;
  const effMax = maxPrice > 0 ? maxPrice : urlLimits.maxPrice;

  if (!effMin && !effMax) return url;

  const sep = url.indexOf('?') === -1 ? '?' : '&';
  const extraParams = [];

  if (effMin > 0 && !/[?&]minPrice=/i.test(url)) {
    extraParams.push('minPrice=' + effMin);
  }
  if (effMax > 0 && !/[?&]maxPrice=/i.test(url)) {
    extraParams.push('maxPrice=' + effMax);
  }
  if ((effMin > 0 || effMax > 0) && !/[?&]price=/i.test(url)) {
    const pMin = effMin > 0 ? effMin : -1;
    const pMax = effMax > 0 ? effMax : -1;
    extraParams.push('price=' + pMin + '-' + pMax);
  }

  if (extraParams.length > 0) {
    url = url + sep + extraParams.join('&');
  }
  return url;
}

function resolveEffectivePriceLimits_(sourceUrl, matchingSearch, pageEntry, globalPriceLimits) {
  const urlLimits = extractPriceLimitsFromYad2Url_(sourceUrl);

  let minPrice = urlLimits.minPrice || 0;
  let maxPrice = urlLimits.maxPrice || 0;

  if (pageEntry) {
    if (!minPrice && pageEntry.minPrice > 0) minPrice = Number(pageEntry.minPrice);
    if (!maxPrice && pageEntry.maxPrice > 0) maxPrice = Number(pageEntry.maxPrice);
  }

  if (matchingSearch) {
    if (!minPrice && matchingSearch.minPrice > 0) minPrice = Number(matchingSearch.minPrice);
    if (!maxPrice && matchingSearch.maxPrice > 0) maxPrice = Number(matchingSearch.maxPrice);
  }

  if (!minPrice && globalPriceLimits && globalPriceLimits.minPrice > 0) {
    minPrice = globalPriceLimits.minPrice;
  }
  if (!maxPrice && globalPriceLimits && globalPriceLimits.maxPrice > 0) {
    maxPrice = globalPriceLimits.maxPrice;
  }

  return { minPrice: minPrice, maxPrice: maxPrice };
}

function isListingMatchingPriceLimits_(item, limits) {
  if (!limits || (!limits.minPrice && !limits.maxPrice)) return true;

  const numericPrice = item.numericPrice;
  if (numericPrice === null || numericPrice === undefined || isNaN(numericPrice) || numericPrice <= 0) {
    return !CONFIG.EXCLUDE_UNPRICED_WHEN_MAX_SET;
  }

  if (limits.minPrice > 0 && numericPrice < limits.minPrice) {
    return false;
  }
  if (limits.maxPrice > 0 && numericPrice > limits.maxPrice) {
    return false;
  }
  return true;
}

function formatPriceFilterSummary_(limits) {
  if (!limits || (!limits.minPrice && !limits.maxPrice)) {
    return 'ללא הגבלה גלובלית';
  }
  if (limits.minPrice > 0 && limits.maxPrice > 0) {
    return '₪' + limits.minPrice.toLocaleString('en-US') + ' עד ₪' + limits.maxPrice.toLocaleString('en-US');
  }
  if (limits.maxPrice > 0) {
    return 'עד ₪' + limits.maxPrice.toLocaleString('en-US');
  }
  return 'מ-₪' + limits.minPrice.toLocaleString('en-US');
}

// ============================================================================
// 🛏️ סינון גלובלי לפי מספר חדרים (מ-עד), חל על כל החיפושים
// ============================================================================

function getGlobalRoomsLimits_() {
  const props = PropertiesService.getScriptProperties();
  const minProp = parseFloat(props.getProperty('GLOBAL_MIN_ROOMS') || '');
  const maxProp = parseFloat(props.getProperty('GLOBAL_MAX_ROOMS') || '');
  return {
    minRooms: (!isNaN(minProp) && minProp > 0) ? minProp : 0,
    maxRooms: (!isNaN(maxProp) && maxProp > 0) ? maxProp : 0
  };
}

function setGlobalRoomsLimits_(minRooms, maxRooms) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('GLOBAL_MIN_ROOMS', String(minRooms > 0 ? minRooms : 0));
  props.setProperty('GLOBAL_MAX_ROOMS', String(maxRooms > 0 ? maxRooms : 0));
}

function applyRoomsParamToYad2Url_(rawUrl, limits) {
  let url = String(rawUrl || '');
  if (!url || !limits || (!limits.minRooms && !limits.maxRooms)) return url;
  url = url.replace(/([?&])rooms=[^&]*&?/i, '$1').replace(/[?&]$/, '');
  const minR = limits.minRooms > 0 ? limits.minRooms : 1;
  const maxR = limits.maxRooms > 0 ? limits.maxRooms : 12;
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'rooms=' + minR + '-' + maxR;
}

function isListingMatchingRoomsLimits_(item, limits) {
  if (!limits || (!limits.minRooms && !limits.maxRooms)) return true;
  const m = String(item.rooms === undefined || item.rooms === null ? '' : item.rooms).match(/\d+(?:\.\d+)?/);
  if (!m) return true; // מספר חדרים לא ידוע - לא מסננים
  const rooms = parseFloat(m[0]);
  if (limits.minRooms > 0 && rooms < limits.minRooms) return false;
  if (limits.maxRooms > 0 && rooms > limits.maxRooms) return false;
  return true;
}

function formatRoomsFilterSummary_(limits) {
  if (!limits || (!limits.minRooms && !limits.maxRooms)) return 'ללא הגבלה';
  if (limits.minRooms > 0 && limits.maxRooms > 0) return limits.minRooms + ' עד ' + limits.maxRooms + ' חדרים';
  if (limits.maxRooms > 0) return 'עד ' + limits.maxRooms + ' חדרים';
  return 'מ-' + limits.minRooms + ' חדרים';
}

function sendRoomsMenu_(chatId) {
  const text =
    '🛏️ *סינון לפי מספר חדרים*\n\n' +
    'טווח נוכחי: *' + escapeMarkdown_(formatRoomsFilterSummary_(getGlobalRoomsLimits_())) + '*\n\n' +
    'בחרו טווח מוכן, או הקלידו טווח משלכם (למשל `2.5-3.5`). הטווח יחול על כל החיפושים:';
  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '2 – 3', callback_data: 'SET_ROOMS_2_3' },
        { text: '2.5 – 3.5', callback_data: 'SET_ROOMS_2.5_3.5' },
        { text: '3 – 4', callback_data: 'SET_ROOMS_3_4' }
      ],
      [
        { text: '3.5 – 4.5', callback_data: 'SET_ROOMS_3.5_4.5' },
        { text: '4 – 5', callback_data: 'SET_ROOMS_4_5' },
        { text: '5+', callback_data: 'SET_ROOMS_5_0' }
      ],
      [
        { text: '✍️ טווח מותאם אישית', callback_data: 'ROOMS_CUSTOM_PROMPT' },
        { text: '🔓 ללא הגבלה', callback_data: 'SET_ROOMS_0_0' }
      ],
      [
        { text: '🔙 חזרה לתפריט הראשי', callback_data: 'MENU_MAIN' }
      ]
    ]
  };
  return sendTelegramText_(chatId, text, inlineKeyboard);
}

function handleRoomsCommandFromTelegram_(chatId, arg) {
  arg = String(arg || '').trim().replace(/,/g, '.');
  if (!arg) { sendRoomsMenu_(chatId); return; }
  if (/^(off|0|clear|ללא|בטל)$/i.test(arg)) {
    setGlobalRoomsLimits_(0, 0);
    sendInteractiveMainMenu_(chatId, '✅ *סינון החדרים בוטל!*');
    return;
  }
  const range = arg.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const mn = parseFloat(range[1]), mx = parseFloat(range[2]);
    if (mx >= mn) {
      setGlobalRoomsLimits_(mn, mx);
      logEvent_('ROOMS_LIMIT', 'עודכן טווח חדרים: ' + mn + '-' + mx);
      sendInteractiveMainMenu_(chatId, '✅ *טווח החדרים עודכן: ' + mn + ' – ' + mx + ' חדרים (חל על כל החיפושים)!*');
      return;
    }
  }
  const single = arg.match(/^(\d+(?:\.\d+)?)$/);
  if (single) {
    const v = parseFloat(single[1]);
    setGlobalRoomsLimits_(v, v);
    sendInteractiveMainMenu_(chatId, '✅ *סינון החדרים עודכן: ' + v + ' חדרים בלבד!*');
    return;
  }
  sendRoomsMenu_(chatId);
}

// ============================================================================
// 🔄 הפונקציה הראשית שרצה בכל מועד סריקה (מתזמנת 20±10 דקות ומפעילה את הסורק)
// ============================================================================

function runYad2Scanner(isScheduledTrigger) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    logEvent_('SKIP', 'סריקה אחרת כבר רצה כעת. מדלג על ריצה זו.');
    return;
  }

  try {
    const ss = getSpreadsheet_();
    initSheets_(ss);

    pollTelegramUpdates_();

    const ghDispatch = triggerGitHubActionsWorkflow_();
    if (ghDispatch.triggered) {
      return;
    }

    logEvent_('WAIT_GITHUB', 'ממתין לקבלת נתוני סריקה מ-GitHub Actions בכתובת ה-Web App.');
  } catch (globalErr) {
    logEvent_('CRITICAL', 'שגיאה כללית: ' + globalErr.stack);
  } finally {
    scheduleNextRun_();
    lock.releaseLock();
  }
}

function triggeredScannerHandler() {
  runYad2Scanner(true);
}

// ============================================================================
// ⏱️ מנגנון תזמון אקראי (20 דקות בממוצע ± 10 דקות = 10 עד 30 דקות)
// ============================================================================

function scheduleNextRun_() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'triggeredScannerHandler') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    const minMs = CONFIG.MIN_INTERVAL_MINUTES * 60 * 1000;
    const maxMs = CONFIG.MAX_INTERVAL_MINUTES * 60 * 1000;
    const randomDelayMs = Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
    const nextRunDate = new Date(Date.now() + randomDelayMs);
    const delayMinutes = (randomDelayMs / 60000).toFixed(1);

    ScriptApp.newTrigger('triggeredScannerHandler')
      .timeBased()
      .at(nextRunDate)
      .create();

    PropertiesService.getScriptProperties().setProperty('NEXT_RUN_TIME', nextRunDate.toISOString());
    logEvent_('SCHEDULE', 'הסריקה הבאה תוזמנה לעוד ' + delayMinutes + ' דקות (' + formatIsraelTime_(nextRunDate) + ')');
  } catch (err) {
    logEvent_('SCHEDULE_ERR', 'שגיאה ביצירת טריגר המשך: ' + err.message);
  }
}

function stopBotSchedule() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  for (let i = 0; i < triggers.length; i++) {
    const fn = triggers[i].getHandlerFunction();
    if (fn === 'triggeredScannerHandler' || fn === 'checkTelegramCommandsTrigger') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  logEvent_('STOP', 'בוטלו ' + removed + ' טריגרים מתוזמנים.');
}

// ============================================================================
// 🌐 פענוח ונרמול נתוני יד 2 (__NEXT_DATA__ JSON / HTML)
// ============================================================================

function parseListingsFromHtmlOrJson_(content, sourceUrl) {
  if (!content) return [];
  const trimmed = content.trim();

  if (trimmed.charAt(0) === '{') {
    try {
      const jsonObj = JSON.parse(trimmed);
      const fromJson = extractListingsFromNextDataObject_(jsonObj, sourceUrl);
      if (fromJson.length > 0) return fromJson;
    } catch (e) {}
  }

  const nextDataMatch = content.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch && nextDataMatch[1]) {
    try {
      const nextData = JSON.parse(nextDataMatch[1].trim());
      const listings = extractListingsFromNextDataObject_(nextData, sourceUrl);
      if (listings.length > 0) {
        return listings;
      }
    } catch (err) {
      logEvent_('PARSE_WARN', 'שגיאה בפענוח __NEXT_DATA__: ' + err.message);
    }
  }

  return extractListingsFromRawHtmlFallback_(content, sourceUrl);
}

function extractListingsFromNextDataObject_(rootObj, sourceUrl) {
  if (!rootObj || typeof rootObj !== 'object') return [];

  const rawItems = [];
  const seenRawTokens = {};

  function addRawItem(item, defaultSpot) {
    if (!item || typeof item !== 'object') return;
    const token = String(
      item.token ||
      item.id ||
      (item.metaData && (item.metaData.token || item.metaData.id || item.metaData.code)) ||
      item.orderId ||
      ''
    ).trim();

    if (!token || token === 'undefined' || token === 'null') return;
    if (item.type === 'ad' || item.type === 'banner' || item.adType === 'banner') return;

    if (!seenRawTokens[token]) {
      seenRawTokens[token] = true;
      if (defaultSpot && !item._spotType) {
        item._spotType = defaultSpot;
      }
      rawItems.push(item);
    }
  }

  function extractFromFeedContainer(feedObj) {
    if (!feedObj || typeof feedObj !== 'object') return;

    const feedBuckets = ['yad2', 'platinum', 'booster', 'trio', 'kingOfTheBar', 'leadingBroker', 'private', 'agency', 'feed_items', 'feed_list', 'items', 'listings'];
    for (let i = 0; i < feedBuckets.length; i++) {
      const key = feedBuckets[i].trim();
      const bucket = feedObj[key];
      if (Array.isArray(bucket)) {
        for (let j = 0; j < bucket.length; j++) {
          addRawItem(bucket[j], key);
        }
      }
    }

    if (Array.isArray(feedObj)) {
      for (let k = 0; k < feedObj.length; k++) {
        addRawItem(feedObj[k], 'feed');
      }
    }
  }

  const pageProps = (rootObj.props && rootObj.props.pageProps) ? rootObj.props.pageProps : (rootObj.pageProps || rootObj);
  if (pageProps && pageProps.feed) {
    extractFromFeedContainer(pageProps.feed);
  }

  const dehydrated = pageProps && pageProps.dehydratedState;
  if (dehydrated && Array.isArray(dehydrated.queries)) {
    for (let q = 0; q < dehydrated.queries.length; q++) {
      const queryObj = dehydrated.queries[q];
      const stateData = queryObj && queryObj.state && queryObj.state.data;
      if (!stateData) continue;

      if (stateData.feed) {
        extractFromFeedContainer(stateData.feed);
      }
      extractFromFeedContainer(stateData);
      if (stateData.data && stateData.data.feed) {
        extractFromFeedContainer(stateData.data.feed);
      }
    }
  }

  if (rootObj.data) {
    if (rootObj.data.feed) extractFromFeedContainer(rootObj.data.feed);
    extractFromFeedContainer(rootObj.data);
  }
  if (rootObj.feed) {
    extractFromFeedContainer(rootObj.feed);
  }

  const normalizedListings = [];
  for (let m = 0; m < rawItems.length; m++) {
    const norm = normalizeYad2ListingItem_(rawItems[m], sourceUrl);
    if (norm && norm.token) {
      normalizedListings.push(norm);
    }
  }

  return normalizedListings;
}

function normalizeYad2ListingItem_(raw, sourceUrl) {
  const token = String(
    raw.token ||
    raw.id ||
    (raw.metaData && (raw.metaData.token || raw.metaData.id || itemTokenFallback_(raw.metaData))) ||
    raw.orderId ||
    ''
  ).trim();

  if (!token) return null;

  const addr = raw.address || {};
  const details = raw.additionalDetails || {};
  const meta = raw.metaData || {};
  const cust = raw.customer || raw.contact || {};

  const city = extractFieldText_(addr.city) || extractFieldText_(addr.cityName) || extractFieldText_(raw.city);
  const neighborhood = extractFieldText_(addr.neighborhood) || extractFieldText_(addr.neighborhoodName) || extractFieldText_(raw.neighborhood);
  const streetName = extractFieldText_(addr.street) || extractFieldText_(addr.streetName) || extractFieldText_(raw.street) || extractFieldText_(raw.Line_1);
  const houseNumber = extractFieldText_(addr.house && addr.house.number) || extractFieldText_(addr.houseNumber) || extractFieldText_(addr.number) || extractFieldText_(raw.address_home_number);

  let fullStreet = streetName;
  if (houseNumber && fullStreet && fullStreet.indexOf(houseNumber) === -1) {
    fullStreet += ' ' + houseNumber;
  }

  const areaText = extractFieldText_(addr.area) || extractFieldText_(addr.region);
  const fallbackLocation = extractFieldText_(raw.location) || extractFieldText_(addr.displayText) || extractFieldText_(addr.fullAddress) || extractFieldText_(raw.Line_2);

  const propertyType =
    extractFieldText_(details.property) ||
    extractFieldText_(details.propertyType) ||
    extractFieldText_(raw.propertyType) ||
    extractFieldText_(raw.property_type) ||
    'דירה';

  const roomsVal =
    details.roomsCount !== undefined ? details.roomsCount :
    details.rooms !== undefined ? details.rooms :
    raw.rooms !== undefined ? raw.rooms :
    raw.Rooms !== undefined ? raw.Rooms :
    raw.rooms_text || '';
  const rooms = extractFieldText_(roomsVal);

  let floorVal =
    (addr.house && addr.house.floor !== undefined) ? addr.house.floor :
    details.floor !== undefined ? details.floor :
    raw.floor !== undefined ? raw.floor :
    raw.Floor !== undefined ? raw.Floor : '';
  const floor = (floorVal === 0 || floorVal === '0' || floorVal === 'קרקע') ? 'קרקע' : extractFieldText_(floorVal);

  const sqmVal =
    details.squareMeter !== undefined ? details.squareMeter :
    details.squareMeters !== undefined ? details.squareMeters :
    meta.squareMeterBuild !== undefined ? meta.squareMeterBuild :
    raw.squareMeters !== undefined ? raw.squareMeters :
    raw.square_meters !== undefined ? raw.square_meters :
    raw.SquareMeter !== undefined ? raw.SquareMeter : '';
  const squareMeters = extractFieldText_(sqmVal);

  const rawPrice = (raw.price !== undefined && raw.price !== null) ? raw.price : details.price;
  const numericPrice = parseNumericPrice_(rawPrice);
  const formattedPrice = formatPriceIls_(rawPrice);

  let coverImage = '';
  if (meta.coverImage) {
    coverImage = meta.coverImage;
  } else if (Array.isArray(meta.images) && meta.images.length > 0) {
    coverImage = typeof meta.images[0] === 'string' ? meta.images[0] : (meta.images[0].url || meta.images[0].src || '');
  } else if (Array.isArray(raw.images) && raw.images.length > 0) {
    coverImage = typeof raw.images[0] === 'string' ? raw.images[0] : (raw.images[0].url || raw.images[0].src || '');
  } else if (raw.img_url) {
    coverImage = raw.img_url;
  }

  const agencyName = extractFieldText_(cust.agencyName || raw.agency);
  const adTypeRaw = extractFieldText_(raw.adType || meta.adType);
  const isAgency = Boolean(agencyName || adTypeRaw === 'commercial' || adTypeRaw === 'agency' || meta.isAgency);
  const publisherType = isAgency ? ('תיווך' + (agencyName ? ' (' + agencyName + ')' : '')) : 'פרטי (ללא תיווך)';

  const description = extractFieldText_(raw.description || details.description);
  let tagsList = [];
  if (Array.isArray(raw.tags)) {
    tagsList = raw.tags.map(function(t) {
      return extractFieldText_(t);
    }).filter(Boolean);
  }

  const dateUpdated = extractFieldText_(
    raw.dateUpdated ||
    raw.updatedAt ||
    raw.dateAdded ||
    raw.date ||
    meta.updatedAt
  );

  let itemUrl = 'https://www.yad2.co.il/realestate/item/' + token;
  if (raw.link && typeof raw.link === 'string') {
    itemUrl = raw.link.indexOf('http') === 0 ? raw.link : 'https://www.yad2.co.il' + raw.link;
  } else if (raw.url && typeof raw.url === 'string') {
    itemUrl = raw.url.indexOf('http') === 0 ? raw.url : 'https://www.yad2.co.il' + raw.url;
  }

  const addressParts = [];
  if (fullStreet) addressParts.push(fullStreet);
  if (neighborhood && neighborhood !== fullStreet && neighborhood !== city) addressParts.push(neighborhood);
  if (city && addressParts.indexOf(city) === -1) addressParts.push(city);
  const displayAddress = addressParts.length > 0 ? addressParts.join(', ') : (fallbackLocation || areaText || 'לא צוינה כתובת');

  return {
    token: token,
    price: formattedPrice,
    rawPrice: rawPrice,
    numericPrice: numericPrice,
    propertyType: propertyType,
    rooms: rooms,
    floor: floor,
    squareMeters: squareMeters,
    city: city || fallbackLocation,
    neighborhood: neighborhood,
    street: fullStreet,
    area: areaText,
    displayAddress: displayAddress,
    publisherType: publisherType,
    description: description,
    tags: tagsList.join(', '),
    coverImage: coverImage,
    itemUrl: itemUrl,
    dateUpdated: dateUpdated,
    sourceUrl: sourceUrl,
    matchedSearches: []
  };
}

function itemTokenFallback_(meta) {
  return meta ? (meta.code || meta.itemId || '') : '';
}

function mergeListingObjects_(existing, incoming) {
  const keys = ['price', 'numericPrice', 'propertyType', 'rooms', 'floor', 'squareMeters', 'city', 'neighborhood', 'street', 'displayAddress', 'coverImage', 'description'];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if ((!existing[k] || existing[k] === 'לא צוין' || existing[k] === 'לא צוין מחיר') && incoming[k]) {
      existing[k] = incoming[k];
    }
  }
  return existing;
}

function extractListingsFromRawHtmlFallback_(html, sourceUrl) {
  const results = [];
  const seen = {};
  const linkRegex = /href=["']([^"']*\/realestate\/item\/(?:[^"']*\/)?([a-zA-Z0-9]{6,12}))["']/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const relativeOrFullUrl = match[1];
    const token = match[2];
    if (seen[token]) continue;
    seen[token] = true;

    const itemUrl = relativeOrFullUrl.indexOf('http') === 0
      ? relativeOrFullUrl
      : 'https://www.yad2.co.il' + relativeOrFullUrl;

    results.push({
      token: token,
      price: 'ראה במודעה',
      numericPrice: null,
      propertyType: 'נכס להשכרה',
      rooms: '',
      floor: '',
      squareMeters: '',
      city: '',
      neighborhood: '',
      street: '',
      area: '',
      displayAddress: 'לחץ על הקישור לצפייה בפרטי הדירה',
      publisherType: '',
      description: '',
      tags: '',
      coverImage: '',
      itemUrl: itemUrl,
      dateUpdated: '',
      sourceUrl: sourceUrl,
      matchedSearches: []
    });
  }
  return results;
}

// ============================================================================
// 📊 ניהול Google Sheets (הקמת גיליונות, שמירת קישורים, שמירת דירות ולוגים)
// ============================================================================

function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.trim() !== '') {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID.trim());
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  const savedId = PropertiesService.getScriptProperties().getProperty('CREATED_SPREADSHEET_ID');
  if (savedId) {
    return SpreadsheetApp.openById(savedId);
  }
  const newSs = SpreadsheetApp.create('בוט דירות יד 2 - מעקב והתראות');
  PropertiesService.getScriptProperties().setProperty('CREATED_SPREADSHEET_ID', newSs.getId());
  return newSs;
}

function initSheets_(ss) {
  let searchesSheet = ss.getSheetByName(CONFIG.SHEETS.SEARCHES);
  if (!searchesSheet) {
    searchesSheet = ss.insertSheet(CONFIG.SHEETS.SEARCHES);
    searchesSheet.setRightToLeft(true);
    const headers = [
      'פעיל (כן/לא)',
      'שם החיפוש',
      'קישור חיפוש ביד 2',
      'סריקה אחרונה',
      'סטטוס אחרון',
      'מספר דירות בעמוד',
      'הערות',
      'מחיר מקסימלי (₪)'
    ];
    searchesSheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold')
      .setBackground('#1a73e8')
      .setFontColor('#ffffff');
    searchesSheet.setFrozenRows(1);

    for (let i = 0; i < CONFIG.DEFAULT_SEARCH_URLS.length; i++) {
      const def = CONFIG.DEFAULT_SEARCH_URLS[i];
      const cleanedDefaultUrl = def.url.indexOf('bBox=') !== -1 ? sanitizeBBoxUrl_(def.url) : def.url;
      const urlPriceLimits = extractPriceLimitsFromYad2Url_(cleanedDefaultUrl);
      searchesSheet.appendRow([
        'כן',
        def.name,
        cleanedDefaultUrl,
        '',
        'ממתין לסריקה מ-GitHub Actions',
        '',
        'נוסף אוטומטית בהתקנה',
        urlPriceLimits.maxPrice > 0 ? urlPriceLimits.maxPrice : ''
      ]);
    }
    searchesSheet.autoResizeColumns(1, headers.length);
  }

  let aptSheet = ss.getSheetByName(CONFIG.SHEETS.APARTMENTS);
  if (!aptSheet) {
    aptSheet = ss.insertSheet(CONFIG.SHEETS.APARTMENTS);
    aptSheet.setRightToLeft(true);
    const headers = [
      'תאריך קליטה',
      'מזהה מודעה (Token)',
      'מחיר',
      'חדרים',
      'קומה',
      'מ"ר',
      'סוג נכס',
      'כתובת / מיקום',
      'עיר / יישוב',
      'מפרסם',
      'חיפוש מתאים',
      'קישור למודעה',
      'תמונה ראשית',
      'תיאור ותגיות'
    ];
    aptSheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold')
      .setBackground('#0f9d58')
      .setFontColor('#ffffff');
    aptSheet.setFrozenRows(1);
  }

  let logSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
  if (!logSheet) {
    logSheet = ss.insertSheet(CONFIG.SHEETS.LOGS);
    logSheet.setRightToLeft(true);
    const headers = ['תאריך ושעה', 'סוג אירוע', 'פירוט'];
    logSheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold')
      .setBackground('#5f6368')
      .setFontColor('#ffffff');
    logSheet.setFrozenRows(1);
  }
}

function getActiveSearchUrls_(ss) {
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SEARCHES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const maxCols = Math.max(8, sheet.getLastColumn());
  const values = sheet.getRange(2, 1, lastRow - 1, maxCols).getValues();
  const activeSearches = [];
  const globalLimits = getGlobalPriceLimits_();

  for (let i = 0; i < values.length; i++) {
    const isActiveRaw = String(values[i][0] || '').trim().toLowerCase();
    const name = String(values[i][1] || 'חיפוש ' + (i + 1)).trim();
    let rawUrl = String(values[i][2] || '').trim();
    const sheetMaxPrice = parseNumericPrice_(values[i][7]);

    const isActive = (isActiveRaw === 'כן' || isActiveRaw === 'true' || isActiveRaw === '1' || isActiveRaw === 'yes' || isActiveRaw === 'v');
    if (isActive && rawUrl.indexOf('yad2.co.il') !== -1) {
      // אם החיפוש הוא חיפוש bBox, ננקה ממנו אוטומטית כל זכר ל-area= או city=
      if (rawUrl.indexOf('bBox=') !== -1) {
        rawUrl = sanitizeBBoxUrl_(rawUrl);
      }

      const urlLimits = extractPriceLimitsFromYad2Url_(rawUrl);
      const minPrice = urlLimits.minPrice > 0 ? urlLimits.minPrice : (globalLimits.minPrice > 0 ? globalLimits.minPrice : 0);
      const maxPrice = (sheetMaxPrice && sheetMaxPrice > 0)
        ? sheetMaxPrice
        : (urlLimits.maxPrice > 0 ? urlLimits.maxPrice : (globalLimits.maxPrice > 0 ? globalLimits.maxPrice : 0));

      const finalUrl = applyRoomsParamToYad2Url_(applyPriceParamsToYad2Url_(rawUrl, minPrice, maxPrice), getGlobalRoomsLimits_());

      activeSearches.push({
        rowIndex: i + 2,
        name: name,
        url: finalUrl,
        rawUrl: rawUrl,
        minPrice: minPrice,
        maxPrice: maxPrice
      });
    }
  }
  return activeSearches;
}

function findSearchNameByUrl_(activeSearches, targetUrl) {
  const found = findSearchRowByUrl_(activeSearches, targetUrl);
  return found ? found.name : buildSearchNameFromUrl_(targetUrl);
}

function findSearchRowByUrl_(activeSearches, targetUrl) {
  if (!targetUrl) return null;
  const cleanTarget = decodeURIComponent(targetUrl).trim();
  for (let i = 0; i < activeSearches.length; i++) {
    const cleanCandidate = decodeURIComponent(activeSearches[i].url).trim();
    const cleanRawCandidate = decodeURIComponent(activeSearches[i].rawUrl || activeSearches[i].url).trim();
    if (
      cleanCandidate === cleanTarget ||
      cleanRawCandidate === cleanTarget ||
      cleanTarget.indexOf(cleanRawCandidate) !== -1 ||
      cleanRawCandidate.indexOf(cleanTarget) !== -1
    ) {
      return activeSearches[i];
    }
  }
  return null;
}

function getSeenTokensMap_(ss) {
  const sheet = ss.getSheetByName(CONFIG.SHEETS.APARTMENTS);
  const lastRow = sheet.getLastRow();
  const seen = {};

  if (lastRow >= 2) {
    const tokenValues = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (let i = 0; i < tokenValues.length; i++) {
      const t = String(tokenValues[i][0] || '').trim();
      if (t) seen[t] = true;
    }
  }
  return seen;
}

function saveNewListingsToSheet_(ss, listings) {
  const sheet = ss.getSheetByName(CONFIG.SHEETS.APARTMENTS);
  const nowStr = formatIsraelTime_(new Date());

  const rows = listings.map(function(item) {
    const matchedStr = (item.matchedSearches || []).join(' + ');
    const extraInfo = [item.description, item.tags].filter(Boolean).join(' | ');
    return [
      nowStr,
      item.token,
      item.price,
      item.rooms || '-',
      item.floor || '-',
      item.squareMeters || '-',
      item.propertyType || 'דירה',
      item.displayAddress,
      item.city || '-',
      item.publisherType || '-',
      matchedStr,
      item.itemUrl,
      item.coverImage || '',
      extraInfo
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function updateSearchSheetStats_(ss, statsArray, newListings) {
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SEARCHES);
  const nowStr = formatIsraelTime_(new Date());

  for (let i = 0; i < statsArray.length; i++) {
    const st = statsArray[i];
    const priceNote = st.filteredByPrice > 0 ? (' | סוננו במחיר: ' + st.filteredByPrice) : '';
    sheet.getRange(st.rowIndex, 4, 1, 4).setValues([[
      nowStr,
      st.status,
      st.totalFound,
      st.error ? st.error : ('תקין (סה"כ חדשות בריצה זו: ' + newListings.length + priceNote + ')')
    ]]);
  }
}

// ============================================================================
// 📲 ממשק כפתורים אינטראקטיבי מלא בטלגרם (Inline Buttons + Reply Keyboard)
// ============================================================================

/**
 * מחזיר את מקלדת הכפתורים הקבועה בתחתית הצ'אט כך שלא צריך להקליד פקודות כלל
 */
function getPersistentReplyKeyboard_() {
  return {
    keyboard: [
      [{ text: REPLY_BTN.SCAN }, { text: REPLY_BTN.SEARCHES }],
      [{ text: REPLY_BTN.BBOX }, { text: REPLY_BTN.PRICE }],
      [{ text: REPLY_BTN.STATUS }, { text: REPLY_BTN.MENU }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

/**
 * מחזיר את כפתורי הפעולה המהירים שמופיעים מתחת להודעת התפריט הראשי (Inline Keyboard)
 */
function getMainMenuInlineKeyboard_() {
  return {
    inline_keyboard: [
      [
        { text: '🚀 הפעל סריקה עכשיו', callback_data: 'ACT_SCAN' },
        { text: '📊 סטטוס וגיליון', callback_data: 'MENU_STATUS' }
      ],
      [
        { text: '📋 ניהול ואיחוד חיפושים', callback_data: 'MENU_SEARCHES' },
        { text: '🗺 חיפוש מפה (bBox נקי)', callback_data: 'MENU_BBOX' }
      ],
      [
        { text: '💰 הגדרת מחיר מקסימלי', callback_data: 'MENU_PRICE' },
        { text: '➕ הוספת אזור בלחיצה', callback_data: 'MENU_PRESETS' }
      ],
      [
        { text: '🛏️ סינון לפי מספר חדרים', callback_data: 'MENU_ROOMS' }
      ],
      [
        { text: '👥 קבע צ\'אט זה להתראות', callback_data: 'ACT_SETGROUP' }
      ]
    ]
  };
}

function sendInteractiveMainMenu_(chatId, introText) {
  const ss = getSpreadsheet_();
  const searches = getActiveSearchUrls_(ss);
  const globalLimits = getGlobalPriceLimits_();
  const activeTarget = getChatId_() || chatId;
  const isTargetGroup = String(activeTarget).indexOf('-') === 0;

  const header = introText || '🏠 *לוח הבקרה האינטראקטיבי - בוט דירות יד 2*';
  const body =
    header + '\n\n' +
    '📍 *יעד התראות:* ' + (isTargetGroup ? 'קבוצה משותפת' : 'צ\'אט פרטי') + '\n' +
    '🔍 *חיפושים פעילים:* ' + searches.length + '\n' +
    '💰 *תקרת מחיר:* ' + escapeMarkdown_(formatPriceFilterSummary_(globalLimits)) + '\n\n' +
    '👇 *בחרו פעולה בלחיצה על הכפתורים (ללא צורך בפקודות):*';

  // שולח גם את מקלדת הכפתורים התחתונה הקבועה וגם את התפריט עם כפתורי ה-Inline
  sendTelegramText_(chatId, '⌨️ מקלדת הכפתורים המהירה הופעלה בתחתית המסך.', getPersistentReplyKeyboard_());
  return sendTelegramText_(chatId, body, getMainMenuInlineKeyboard_());
}

function sendSearchesManagementMenu_(chatId) {
  const ss = getSpreadsheet_();
  const searches = getActiveSearchUrls_(ss);
  const globalLimits = getGlobalPriceLimits_();

  let text = '📋 *ניהול ואיחוד חיפושים פעילים (' + searches.length + '):*\n';
  text += '💰 *תקרת מחיר גלובלית:* ' + escapeMarkdown_(formatPriceFilterSummary_(globalLimits)) + '\n\n';

  const inlineRows = [];

  if (searches.length === 0) {
    text += '📭 אין כרגע חיפושים פעילים.\nלחצו על הכפתורים למטה כדי להוסיף אזור או חיפוש מפה (bBox)!';
  } else {
    for (let i = 0; i < searches.length; i++) {
      const s = searches[i];
      const isBBox = s.url.indexOf('bBox=') !== -1;
      const badge = isBBox ? '🗺 [bBox נקי]' : '📍 [אזור]';
      const limitStr = s.maxPrice > 0 ? (' | עד ₪' + s.maxPrice.toLocaleString('en-US')) : '';
      text += (i + 1) + '. ' + badge + ' *' + escapeMarkdown_(s.name) + '*' + limitStr + '\n';

      const shortName = s.name.length > 22 ? s.name.substring(0, 20) + '..' : s.name;
      const rowBtns = [
        { text: '🗑 הסר #' + (i + 1) + ' (' + shortName + ')', callback_data: 'DEL_ROW_' + s.rowIndex }
      ];
      if (s.rawUrl && s.rawUrl.indexOf('bBox=') !== -1 && (s.rawUrl.indexOf('area=') !== -1 || s.rawUrl.indexOf('city=') !== -1)) {
        rowBtns.push({ text: '🧹 נקה עיר/אזור מ-bBox #' + (i + 1), callback_data: 'CLEAN_BBOX_' + s.rowIndex });
      }
      inlineRows.push(rowBtns);
    }

    text += '\n💡 *אפשרויות איחוד חיפושים:*\n' +
      '• *איחוד חכם וניקוי כפילויות:* מאחד חיפושי מפה ומסיר חיפושי עיר שכבר כלולים באזור רחב.\n' +
      '• *איחוד הכל ל-bBox אחד:* מאחד את כל האזורים לריבוע מפה אחד (ללא הגבלת עיר/אזור) שסורק הכל בריצה אחת!';
  }

  inlineRows.push([
    { text: '🔗 איחוד חכם וניקוי כפילויות', callback_data: 'ACT_MERGE_SMART' }
  ]);
  inlineRows.push([
    { text: '🗺 אחד את כל החיפושים ל-bBox אחד נקי', callback_data: 'ACT_MERGE_BBOX_ALL' }
  ]);
  inlineRows.push([
    { text: '➕ הוספת אזור מוכן', callback_data: 'MENU_PRESETS' },
    { text: '🗺 הגדרת bBox', callback_data: 'MENU_BBOX' }
  ]);
  inlineRows.push([
    { text: '🔙 חזרה לתפריט הראשי', callback_data: 'MENU_MAIN' }
  ]);

  return sendTelegramText_(chatId, text, { inline_keyboard: inlineRows });
}

function sendBBoxMenu_(chatId) {
  const text =
    '🗺 *חיפוש מפה (bBox) נקי – ללא נעילת עיר או אזור!*\n\n' +
    'כאשר מחפשים ביד 2 לפי מפה (`bBox`), אם משאירים בקישור `area=` או `city=`, יד 2 מסנן החוצה מושבים ויישובים שלא רשומים תחת אותה עיר.\n' +
    'לכן הבוט שלנו **מנקה אוטומטית** את `area` ו-`city` מכל קישור מפה כדי שתקבלו 100% מהדירות שבתוך הריבוע הגיאוגרפי!\n\n' +
    '👇 *בחרו אזור מפה מוכן בלחיצת כפתור, או הדביקו בצ\'אט כל קישור מפה מיד 2:*';

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '🗺 מפה רחבה: גדרה, יבנה, חצב, קריית מלאכי ובאר טוביה', callback_data: 'BBOX_PRESET_WIDE' }
      ],
      [
        { text: '🗺 מפת דרום גדרה, חצב, בני עי"ש, כנות וקריית מלאכי', callback_data: 'BBOX_PRESET_SOUTH_GEDERA' }
      ],
      [
        { text: '🗺 מפת גדרה - יבנה ומושבי הסביבה', callback_data: 'BBOX_PRESET_GEDERA_YAVNE' }
      ],
      [
        { text: '🧹 נקה עיר/אזור מכל חיפושי ה-bBox הקיימים', callback_data: 'ACT_CLEAN_ALL_BBOX' }
      ],
      [
        { text: '✍️ הזנת קואורדינטות / קישור bBox ידני', callback_data: 'BBOX_CUSTOM_PROMPT' }
      ],
      [
        { text: '🔙 חזרה לתפריט הראשי', callback_data: 'MENU_MAIN' }
      ]
    ]
  };

  return sendTelegramText_(chatId, text, inlineKeyboard);
}

function sendPresetAreasMenu_(chatId) {
  const text =
    '➕ *הוספת אזורי חיפוש מהירה בלחיצת כפתור:*\n\n' +
    'בחרו איזה אזור תרצו להוסיף למעקב (או הדביקו כל קישור מיד 2 ישירות בצ\'אט):';

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '📍 אזור השפלה המלא (area=99: קריית מלאכי, חצב והמושבים)', callback_data: 'ADD_PRESET_AREA99' }
      ],
      [
        { text: '📍 אזור גדרה - יבנה והסביבה המלא (area=52)', callback_data: 'ADD_PRESET_AREA52' }
      ],
      [
        { text: '📍 אזור אשדוד - אשקלון והמושבים (area=21)', callback_data: 'ADD_PRESET_AREA21' }
      ],
      [
        { text: '🗺 מעבר לתפריט מפה (bBox ללא עיר/אזור)', callback_data: 'MENU_BBOX' }
      ],
      [
        { text: '🔙 חזרה לתפריט הראשי', callback_data: 'MENU_MAIN' }
      ]
    ]
  };

  return sendTelegramText_(chatId, text, inlineKeyboard);
}

function sendPriceMenu_(chatId) {
  const currentLimits = getGlobalPriceLimits_();
  const text =
    '💰 *הגדרת תקרת מחיר בלחיצת כפתור*\n\n' +
    'תקרת מחיר נוכחית: *' + escapeMarkdown_(formatPriceFilterSummary_(currentLimits)) + '*\n\n' +
    'בחרו את המחיר המקסימלי הרצוי מהכפתורים למטה (הבוט גם יזריק את המחיר לקישורי יד 2 וגם יסנן בעצמו כל דירה שחורגת מהתקרה):';

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: 'עד ₪4,000', callback_data: 'SET_PRICE_4000' },
        { text: 'עד ₪4,500', callback_data: 'SET_PRICE_4500' },
        { text: 'עד ₪5,000', callback_data: 'SET_PRICE_5000' }
      ],
      [
        { text: 'עד ₪5,500', callback_data: 'SET_PRICE_5500' },
        { text: 'עד ₪6,000', callback_data: 'SET_PRICE_6000' },
        { text: 'עד ₪6,500', callback_data: 'SET_PRICE_6500' }
      ],
      [
        { text: 'עד ₪7,000', callback_data: 'SET_PRICE_7000' },
        { text: 'עד ₪7,500', callback_data: 'SET_PRICE_7500' },
        { text: 'עד ₪8,500', callback_data: 'SET_PRICE_8500' }
      ],
      [
        { text: '✍️ הקלדת מחיר או טווח מותאם אישית', callback_data: 'PRICE_CUSTOM_PROMPT' },
        { text: '🔓 ללא הגבלת מחיר', callback_data: 'SET_PRICE_0' }
      ],
      [
        { text: '🛏️ סינון לפי מספר חדרים', callback_data: 'MENU_ROOMS' }
      ],
      [
        { text: '🔙 חזרה לתפריט הראשי', callback_data: 'MENU_MAIN' }
      ]
    ]
  };

  return sendTelegramText_(chatId, text, inlineKeyboard);
}

function sendStatusMessageWithButtons_(chatId) {
  const ss = getSpreadsheet_();
  const searches = getActiveSearchUrls_(ss);
  const seenCount = Object.keys(getSeenTokensMap_(ss)).length;
  const nextRunIso = PropertiesService.getScriptProperties().getProperty('NEXT_RUN_TIME');
  const nextRunText = nextRunIso ? formatIsraelTime_(new Date(nextRunIso)) : 'טרם נקבע';
  const globalLimits = getGlobalPriceLimits_();
  const activeTarget = getChatId_() || chatId;
  const isTargetGroup = String(activeTarget).indexOf('-') === 0;

  const text =
    '📊 *סטטוס בוט יד 2:*\n' +
    '• יעד התראות: *' + (isTargetGroup ? 'קבוצה משותפת (' + activeTarget + ')' : 'צ\'אט פרטי (' + activeTarget + ')') + '*\n' +
    '• חיפושים פעילים: *' + searches.length + '*\n' +
    '• סינון מחיר גלובלי: *' + escapeMarkdown_(formatPriceFilterSummary_(globalLimits)) + '*\n' +
    '• דירות מתועדות בגיליון: *' + seenCount + '*\n' +
    '• הסריקה האוטומטית הבאה: *' + nextRunText + '*\n' +
    '• טווח תזמון אקראי: כל *' + CONFIG.MIN_INTERVAL_MINUTES + '-' + CONFIG.MAX_INTERVAL_MINUTES + ' דקות*';

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '📊 פתח גיליון Google Sheets', url: ss.getUrl() }
      ],
      [
        { text: '🚀 הפעל סריקה עכשיו', callback_data: 'ACT_SCAN' },
        { text: '📋 ניהול חיפושים', callback_data: 'MENU_SEARCHES' }
      ],
      [
        { text: '🔙 חזרה לתפריט הראשי', callback_data: 'MENU_MAIN' }
      ]
    ]
  };

  return sendTelegramText_(chatId, text, inlineKeyboard);
}

// ============================================================================
// 🔄 משיכת עדכונים מטלגרם וטיפול בלחיצות כפתורים (callback_query) ובהודעות
// ============================================================================

function pollTelegramUpdates_() {
  const token = getBotToken_();
  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') return;

  const props = PropertiesService.getScriptProperties();
  const lastUpdateId = parseInt(props.getProperty('TELEGRAM_LAST_UPDATE_ID') || '0', 10);
  const url = 'https://api.telegram.org/bot' + token + '/getUpdates?offset=' + (lastUpdateId + 1) + '&timeout=1';

  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() === 409) {
      UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/deleteWebhook', { muteHttpExceptions: true });
      return;
    }
    if (res.getResponseCode() !== 200) return;

    const data = JSON.parse(res.getContentText());
    if (!data.ok || !Array.isArray(data.result) || data.result.length === 0) return;

    let maxUpdateId = lastUpdateId;
    for (let i = 0; i < data.result.length; i++) {
      if (data.result[i].update_id > maxUpdateId) {
        maxUpdateId = data.result[i].update_id;
      }
    }
    props.setProperty('TELEGRAM_LAST_UPDATE_ID', String(maxUpdateId));

    for (let j = 0; j < data.result.length; j++) {
      handleTelegramUpdateObject_(data.result[j]);
    }
  } catch (e) {}
}

function handleTelegramUpdateObject_(update) {
  // 1. קודם כל: טיפול בלחיצות על כפתורים אינטראקטיביים (Inline Keyboard Callback Query)
  if (update.callback_query) {
    handleTelegramCallbackQuery_(update.callback_query);
    return;
  }

  // 2. זיהוי אוטומטי כאשר מצרפים את הבוט לקבוצת הטלגרם הזוגית
  if (update.my_chat_member && update.my_chat_member.chat) {
    const memberChat = update.my_chat_member.chat;
    const newStatus = update.my_chat_member.new_chat_member && update.my_chat_member.new_chat_member.status;
    if ((memberChat.type === 'group' || memberChat.type === 'supergroup') && (newStatus === 'member' || newStatus === 'administrator')) {
      const groupChatId = String(memberChat.id);
      PropertiesService.getScriptProperties().setProperty('TELEGRAM_CHAT_ID', groupChatId);
      logEvent_('GROUP_JOIN', 'הבוט צורף לקבוצה "' + (memberChat.title || groupChatId) + '" והוגדר לשלוח אליה התראות.');
      sendInteractiveMainMenu_(
        groupChatId,
        '🎉 *הבוט חובר בהצלחה לקבוצה "' + escapeMarkdown_(memberChat.title || 'שלכם') + '"!*\n' +
        'מעתה כל הדירות החדשות יישלחו לכאן, וניתן לשלוט בהכל ישירות דרך הכפתורים למטה:'
      );
      return;
    }
  }

  const msg = update.message || update.edited_message || update.channel_post;
  if (!msg || !msg.chat) return;

  const chatId = String(msg.chat.id);
  const chatType = String(msg.chat.type || 'private');
  const isGroupChat = (chatType === 'group' || chatType === 'supergroup');

  if (isGroupChat && Array.isArray(msg.new_chat_members) && msg.new_chat_members.length > 0) {
    PropertiesService.getScriptProperties().setProperty('TELEGRAM_CHAT_ID', chatId);
  }

  const savedChatId = getChatId_();
  if (!savedChatId || (isGroupChat && String(savedChatId).indexOf('-') !== 0)) {
    PropertiesService.getScriptProperties().setProperty('TELEGRAM_CHAT_ID', chatId);
  }

  if (!msg.text) return;
  const rawText = String(msg.text).trim();
  const props = PropertiesService.getScriptProperties();
  const awaitingInput = props.getProperty('AWAITING_INPUT_' + chatId) || '';

  // 3. טיפול בלחיצה על כפתורי המקלדת התחתונה הקבועה (Reply Keyboard)
  if (rawText === REPLY_BTN.MENU || rawText === 'תפריט' || rawText === 'כפתורים') {
    props.deleteProperty('AWAITING_INPUT_' + chatId);
    sendInteractiveMainMenu_(chatId);
    return;
  }
  if (rawText === REPLY_BTN.SCAN) {
    props.deleteProperty('AWAITING_INPUT_' + chatId);
    triggerScanAndReply_(chatId);
    return;
  }
  if (rawText === REPLY_BTN.SEARCHES) {
    props.deleteProperty('AWAITING_INPUT_' + chatId);
    sendSearchesManagementMenu_(chatId);
    return;
  }
  if (rawText === REPLY_BTN.BBOX) {
    props.deleteProperty('AWAITING_INPUT_' + chatId);
    sendBBoxMenu_(chatId);
    return;
  }
  if (rawText === REPLY_BTN.PRICE) {
    props.deleteProperty('AWAITING_INPUT_' + chatId);
    sendPriceMenu_(chatId);
    return;
  }
  if (rawText === REPLY_BTN.STATUS) {
    props.deleteProperty('AWAITING_INPUT_' + chatId);
    sendStatusMessageWithButtons_(chatId);
    return;
  }

  // 4. אם המשתמש הדביק קישור של יד 2 בצ'אט/קבוצה
  const yad2UrlMatch = rawText.match(/https?:\/\/(?:www\.)?yad2\.co\.il\/realestate\/[^\s]+/i);
  if (yad2UrlMatch && rawText.indexOf('/remove') !== 0) {
    props.deleteProperty('AWAITING_INPUT_' + chatId);
    let newUrl = yad2UrlMatch[0];
    const isBBoxLink = newUrl.indexOf('bBox=') !== -1;
    if (isBBoxLink) {
      newUrl = sanitizeBBoxUrl_(newUrl);
    }
    const customName = rawText
      .replace(yad2UrlMatch[0], '')
      .replace(/^\/add(@\S+)?\s*/i, '')
      .trim() || buildSearchNameFromUrl_(newUrl);
    addSearchUrlFromTelegram_(chatId, newUrl, customName, isBBoxLink);
    return;
  }

  // 5. אם הבוט ממתין לקלט לאחר לחיצה על כפתור "הקלדת מחיר מותאם אישית" או "הזנת קואורדינטות bBox"
  if (awaitingInput === 'PRICE' && rawText.indexOf('/') !== 0) {
    props.deleteProperty('AWAITING_INPUT_' + chatId);
    handlePriceCommandFromTelegram_(chatId, '/price ' + rawText);
    return;
  }
  if (awaitingInput === 'ROOMS' && rawText.indexOf('/') !== 0) {
    props.deleteProperty('AWAITING_INPUT_' + chatId);
    handleRoomsCommandFromTelegram_(chatId, rawText);
    return;
  }
  if (awaitingInput === 'BBOX' && rawText.indexOf('/') !== 0) {
    const coords = parseBBoxCoordsFromTextOrUrl_(rawText);
    if (coords) {
      props.deleteProperty('AWAITING_INPUT_' + chatId);
      const globalLimits = getGlobalPriceLimits_();
      const cleanUrl = buildCleanBBoxYad2Url_(coords, globalLimits.maxPrice);
      addSearchUrlFromTelegram_(chatId, cleanUrl, 'חיפוש מפה מותאם אישית (bBox נקי ללא עיר/אזור)', true);
      return;
    }
  }

  // 6. תמיכה גם בפקודות רגילות (כולל בקבוצה עם @BotName או עם תווים נסתרים)
  const cmdMatch = rawText.match(/^\/([a-zA-Z0-9_]+)(?:@\S+)?\s*([\s\S]*)$/);
  if (cmdMatch) {
    props.deleteProperty('AWAITING_INPUT_' + chatId);
    const cmd = cmdMatch[1].toLowerCase();
    const arg = (cmdMatch[2] || '').trim();

    if (cmd === 'start' || cmd === 'help' || cmd === 'menu') {
      sendInteractiveMainMenu_(chatId);
      return;
    }
    if (cmd === 'list' || cmd === 'searches' || cmd === 'merge') {
      sendSearchesManagementMenu_(chatId);
      return;
    }
    if (cmd === 'bbox') {
      if (arg) {
        const coords = parseBBoxCoordsFromTextOrUrl_(arg);
        if (coords) {
          const globalLimits = getGlobalPriceLimits_();
          const cleanUrl = buildCleanBBoxYad2Url_(coords, globalLimits.maxPrice);
          addSearchUrlFromTelegram_(chatId, cleanUrl, 'חיפוש מפה (bBox נקי ללא עיר/אזור)', true);
          return;
        }
      }
      sendBBoxMenu_(chatId);
      return;
    }
    if (cmd === 'price') {
      if (arg) {
        handlePriceCommandFromTelegram_(chatId, '/price ' + arg);
      } else {
        sendPriceMenu_(chatId);
      }
      return;
    }
    if (cmd === 'rooms') {
      handleRoomsCommandFromTelegram_(chatId, arg);
      return;
    }
    if (cmd === 'scan') {
      triggerScanAndReply_(chatId);
      return;
    }
    if (cmd === 'status') {
      sendStatusMessageWithButtons_(chatId);
      return;
    }
    if (cmd === 'setgroup') {
      PropertiesService.getScriptProperties().setProperty('TELEGRAM_CHAT_ID', chatId);
      sendInteractiveMainMenu_(chatId, '✅ *הקבוצה הנוכחית הוגדרה כיעד ההתראות הקבוע של הבוט!*');
      return;
    }
    if (cmd === 'remove' && arg) {
      const idx = parseInt(arg, 10);
      const ss = getSpreadsheet_();
      const searches = getActiveSearchUrls_(ss);
      if (!isNaN(idx) && idx >= 1 && idx <= searches.length) {
        const target = searches[idx - 1];
        ss.getSheetByName(CONFIG.SHEETS.SEARCHES).getRange(target.rowIndex, 1).setValue('לא');
        sendTelegramText_(chatId, '🗑️ החיפוש *' + escapeMarkdown_(target.name) + '* הושבת בהצלחה.');
      }
      sendSearchesManagementMenu_(chatId);
      return;
    }
    if (cmd === 'github') {
      const parts = arg.split(/\s+/);
      if (parts.length >= 2) {
        props.setProperty('GITHUB_REPO', parts[0].trim());
        props.setProperty('GITHUB_TOKEN', parts[1].trim());
        sendTelegramText_(chatId, '✅ חיבור GitHub Actions (`' + parts[0].trim() + '`) נשמר! מפעיל כעת סריקת בדיקה...');
        triggerGitHubActionsWorkflow_();
      } else {
        sendTelegramText_(chatId, 'ℹ️ שלח `/github owner/repo ghp_your_token` כדי לחבר הפעלה ישירה של GitHub Actions.');
      }
      return;
    }
  }
}

/**
 * מטפל בכל הלחיצות על הכפתורים האינטראקטיביים (Inline Keyboard)
 */
function handleTelegramCallbackQuery_(cb) {
  const token = getBotToken_();
  const callbackId = cb.id;
  const data = String(cb.data || '').trim();
  const msg = cb.message;
  if (!msg || !msg.chat) return;

  const chatId = String(msg.chat.id);
  const props = PropertiesService.getScriptProperties();

  // שמירה אוטומטית של מזהה הקבוצה ברגע שלוחצים בה על כפתור
  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    props.setProperty('TELEGRAM_CHAT_ID', chatId);
  }

  // מענה מהיר לטלגרם כדי להעלים את אנימציית הטעינה על הכפתור
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/answerCallbackQuery', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ callback_query_id: callbackId }),
      muteHttpExceptions: true
    });
  } catch (e) {}

  // ניווט בין תפריטים
  if (data === 'MENU_MAIN') {
    props.deleteProperty('AWAITING_INPUT_' + chatId);
    sendInteractiveMainMenu_(chatId);
    return;
  }
  if (data === 'MENU_SEARCHES') {
    sendSearchesManagementMenu_(chatId);
    return;
  }
  if (data === 'MENU_BBOX') {
    sendBBoxMenu_(chatId);
    return;
  }
  if (data === 'MENU_PRESETS') {
    sendPresetAreasMenu_(chatId);
    return;
  }
  if (data === 'MENU_PRICE') {
    sendPriceMenu_(chatId);
    return;
  }
  if (data === 'MENU_ROOMS') {
    sendRoomsMenu_(chatId);
    return;
  }
  if (data.indexOf('SET_ROOMS_') === 0) {
    const parts = data.replace('SET_ROOMS_', '').split('_');
    const mn = parseFloat(parts[0]) || 0;
    const mx = parseFloat(parts[1]) || 0;
    setGlobalRoomsLimits_(mn, mx);
    sendInteractiveMainMenu_(chatId, (mn || mx)
      ? '✅ *טווח החדרים עודכן: ' + escapeMarkdown_(formatRoomsFilterSummary_({ minRooms: mn, maxRooms: mx })) + ' (חל על כל החיפושים)!*'
      : '✅ *סינון החדרים בוטל!*');
    return;
  }
  if (data === 'ROOMS_CUSTOM_PROMPT') {
    props.setProperty('AWAITING_INPUT_' + chatId, 'ROOMS');
    sendTelegramText_(chatId, '✍️ כתבו עכשיו טווח חדרים, למשל `2.5-3.5` (או מספר בודד, או `0` לביטול):');
    return;
  }
  if (data === 'MENU_STATUS') {
    sendStatusMessageWithButtons_(chatId);
    return;
  }

  // הפעלת סריקה
  if (data === 'ACT_SCAN') {
    triggerScanAndReply_(chatId);
    return;
  }

  // קיבוע הקבוצה כיעד התראות
  if (data === 'ACT_SETGROUP') {
    props.setProperty('TELEGRAM_CHAT_ID', chatId);
    sendInteractiveMainMenu_(chatId, '✅ *הצ\'אט הנוכחי (`' + chatId + '`) הוגדר כיעד ההתראות הקבוע!*');
    return;
  }

  // כפתורי הגדרת מחיר מהירה
  if (data.indexOf('SET_PRICE_') === 0) {
    const priceVal = parseInt(data.replace('SET_PRICE_', ''), 10);
    setGlobalPriceLimits_(0, priceVal > 0 ? priceVal : 0);
    const note = priceVal > 0
      ? '✅ *תקרת המחיר עודכנה לעד ₪' + priceVal.toLocaleString('en-US') + '!*'
      : '✅ *מגבלת המחיר הגלובלית בוטלה!*';
    sendInteractiveMainMenu_(chatId, note);
    return;
  }

  if (data === 'PRICE_CUSTOM_PROMPT') {
    props.setProperty('AWAITING_INPUT_' + chatId, 'PRICE');
    sendTelegramText_(
      chatId,
      '✍️ *הקלדת מחיר מותאם אישית:*\n' +
      'כתבו עכשיו בצ\'אט את המחיר המקסימלי הרצוי (למשל `5800`) או טווח מחירים (למשל `3500-6200`):'
    );
    return;
  }

  // כפתורי איחוד חיפושים
  if (data === 'ACT_MERGE_SMART') {
    const ss = getSpreadsheet_();
    const res = mergeActiveSearchesInSheet_(ss, 'SMART');
    sendTelegramText_(chatId, res.message);
    sendSearchesManagementMenu_(chatId);
    return;
  }

  if (data === 'ACT_MERGE_BBOX_ALL') {
    const ss = getSpreadsheet_();
    const res = mergeActiveSearchesInSheet_(ss, 'BBOX_ALL');
    sendTelegramText_(chatId, res.message);
    sendSearchesManagementMenu_(chatId);
    return;
  }

  // כפתורי מחיקת חיפוש ספציפי לפי שורה בגיליון
  if (data.indexOf('DEL_ROW_') === 0) {
    const rowIdx = parseInt(data.replace('DEL_ROW_', ''), 10);
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.SEARCHES);
    if (sheet && !isNaN(rowIdx) && rowIdx >= 2 && rowIdx <= sheet.getLastRow()) {
      const removedName = String(sheet.getRange(rowIdx, 2).getValue() || 'חיפוש');
      sheet.getRange(rowIdx, 1).setValue('לא');
      sendTelegramText_(chatId, '🗑️ החיפוש *' + escapeMarkdown_(removedName) + '* הוסר.');
    }
    sendSearchesManagementMenu_(chatId);
    return;
  }

  // ניקוי עיר/אזור משורת bBox ספציפית
  if (data.indexOf('CLEAN_BBOX_') === 0) {
    const rowIdx = parseInt(data.replace('CLEAN_BBOX_', ''), 10);
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.SEARCHES);
    if (sheet && !isNaN(rowIdx) && rowIdx >= 2 && rowIdx <= sheet.getLastRow()) {
      const oldUrl = String(sheet.getRange(rowIdx, 3).getValue() || '');
      const cleanUrl = sanitizeBBoxUrl_(oldUrl);
      sheet.getRange(rowIdx, 3).setValue(cleanUrl);
      sendTelegramText_(chatId, '🧹 הקישור נוקה מפרמטרים של עיר/אזור וכעת סורק לפי ה-bBox בלבד!\n' + cleanUrl);
    }
    sendSearchesManagementMenu_(chatId);
    return;
  }

  // ניקוי כל חיפושי ה-bBox בגיליון מפרמטרים של עיר/אזור
  if (data === 'ACT_CLEAN_ALL_BBOX') {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.SEARCHES);
    const searches = getActiveSearchUrls_(ss);
    let cleanedCount = 0;
    for (let i = 0; i < searches.length; i++) {
      const rawU = searches[i].rawUrl || searches[i].url;
      if (rawU.indexOf('bBox=') !== -1) {
        const cleaned = sanitizeBBoxUrl_(rawU);
        sheet.getRange(searches[i].rowIndex, 3).setValue(cleaned);
        cleanedCount++;
      }
    }
    sendTelegramText_(chatId, '✅ נוקו *' + cleanedCount + '* חיפושי מפה (`bBox`) מכל הגבלה של עיר או אזור!');
    sendSearchesManagementMenu_(chatId);
    return;
  }

  // כפתורי הוספת חיפוש מפה (bBox נקי ללא עיר ואזור) מוכנים מראש
  if (data === 'BBOX_PRESET_WIDE') {
    const globalLimits = getGlobalPriceLimits_();
    const url = buildCleanBBoxYad2Url_(
      { minLat: 31.680000, minLon: 34.660000, maxLat: 31.890000, maxLon: 34.895000 },
      globalLimits.maxPrice
    );
    addSearchUrlFromTelegram_(chatId, url, 'חיפוש מפה רחב (bBox נקי: גדרה, יבנה, חצב, קריית מלאכי ובאר טוביה)', true);
    return;
  }

  if (data === 'BBOX_PRESET_SOUTH_GEDERA') {
    const globalLimits = getGlobalPriceLimits_();
    const url = buildCleanBBoxYad2Url_(
      { minLat: 31.690000, minLon: 34.700000, maxLat: 31.810000, maxLon: 34.860000 },
      globalLimits.maxPrice
    );
    addSearchUrlFromTelegram_(chatId, url, 'חיפוש מפה: דרום גדרה, מושב חצב, כנות, בני עי"ש וקריית מלאכי (bBox נקי)', true);
    return;
  }

  if (data === 'BBOX_PRESET_GEDERA_YAVNE') {
    const globalLimits = getGlobalPriceLimits_();
    const url = buildCleanBBoxYad2Url_(
      { minLat: 31.747122, minLon: 34.682888, maxLat: 31.862425, maxLon: 34.894362 },
      globalLimits.maxPrice
    );
    addSearchUrlFromTelegram_(chatId, url, 'חיפוש מפה: גדרה - יבנה והמושבים (bBox נקי ללא עיר/אזור)', true);
    return;
  }

  if (data === 'BBOX_CUSTOM_PROMPT') {
    props.setProperty('AWAITING_INPUT_' + chatId, 'BBOX');
    sendTelegramText_(
      chatId,
      '🗺 *הוספת חיפוש מפה (bBox) נקי:*\n' +
      'הדביקו עכשיו בצ\'אט כל קישור מפה מיד 2 (גם אם יש בו עיר או אזור – הבוט ינקה אותם אוטומטית וישאיר רק את ה-`bBox`),\n' +
      'או שלחו 4 קואורדינטות בפורמט: `31.70, 34.68, 31.86, 34.89`'
    );
    return;
  }

  // כפתורי הוספת אזורים מוכנים
  if (data === 'ADD_PRESET_AREA99') {
    addSearchUrlFromTelegram_(
      chatId,
      'https://www.yad2.co.il/realestate/rent/south?area=99',
      'אזור השפלה - קריית מלאכי, חצב, באר טוביה והמושבים (אזור 99)',
      false
    );
    return;
  }
  if (data === 'ADD_PRESET_AREA52') {
    addSearchUrlFromTelegram_(
      chatId,
      'https://www.yad2.co.il/realestate/rent/south?area=52',
      'אזור גדרה - יבנה והסביבה (אזור 52)',
      false
    );
    return;
  }
  if (data === 'ADD_PRESET_AREA21') {
    addSearchUrlFromTelegram_(
      chatId,
      'https://www.yad2.co.il/realestate/rent/south?area=21',
      'אזור אשדוד - אשקלון והמושבים (אזור 21)',
      false
    );
    return;
  }
}

function triggerScanAndReply_(chatId) {
  const ghRes = triggerGitHubActionsWorkflow_();
  if (ghRes.triggered) {
    sendTelegramText_(chatId, '🚀 *סריקת ענן ב-GitHub Actions הופעלה בהצלחה!*\nדירות חדשות יישלחו לכאן תוך כדקה.');
  } else {
    sendTelegramText_(
      chatId,
      'ℹ️ *הסורק ב-GitHub Actions רץ אוטומטית כל ~20 דקות.*\n' +
      'כדי שגם כפתור "סריקה עכשיו" יפעיל את GitHub מידית מהטלגרם, שלחו פעם אחת:\n' +
      '`/github owner/repo ghp_your_token`'
    );
  }
}

function handlePriceCommandFromTelegram_(chatId, commandText) {
  const arg = commandText.replace(/^\/price\s*/i, '').trim();

  if (!arg) {
    sendPriceMenu_(chatId);
    return;
  }

  if (arg === 'off' || arg === '0' || arg === 'clear' || arg === 'ללא' || arg === 'בטל') {
    setGlobalPriceLimits_(0, 0);
    logEvent_('PRICE_LIMIT', 'מגבלת המחיר הגלובלית בוטלה מהטלגרם.');
    sendInteractiveMainMenu_(chatId, '✅ *מגבלת המחיר הגלובלית בוטלה בהצלחה!*');
    return;
  }

  const rangeMatch = arg.match(/^(\d[\d,]*)\s*-\s*(\d[\d,]*)$/);
  if (rangeMatch) {
    const minVal = parseInt(rangeMatch[1].replace(/,/g, ''), 10);
    const maxVal = parseInt(rangeMatch[2].replace(/,/g, ''), 10);
    if (!isNaN(minVal) && !isNaN(maxVal) && maxVal >= minVal) {
      setGlobalPriceLimits_(minVal, maxVal);
      logEvent_('PRICE_LIMIT', 'עודכן טווח מחיר גלובלי: ' + minVal + '-' + maxVal);
      sendInteractiveMainMenu_(
        chatId,
        '✅ *טווח המחירים עודכן בהצלחה: ₪' + minVal.toLocaleString('en-US') + ' – ₪' + maxVal.toLocaleString('en-US') + '!*'
      );
      return;
    }
  }

  const singleVal = parseInt(arg.replace(/[^\d]/g, ''), 10);
  if (!isNaN(singleVal) && singleVal > 0) {
    setGlobalPriceLimits_(0, singleVal);
    logEvent_('PRICE_LIMIT', 'עודכן מחיר מקסימלי גלובלי: עד ' + singleVal);
    sendInteractiveMainMenu_(
      chatId,
      '✅ *תקרת המחיר עודכנה בהצלחה: עד ₪' + singleVal.toLocaleString('en-US') + '!*'
    );
    return;
  }

  sendPriceMenu_(chatId);
}

function addSearchUrlFromTelegram_(chatId, newUrl, customName, wasCleanedBBox) {
  const ss = getSpreadsheet_();
  initSheets_(ss);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SEARCHES);

  const cleanUrl = newUrl.indexOf('bBox=') !== -1 ? sanitizeBBoxUrl_(newUrl) : newUrl;
  const urlLimits = extractPriceLimitsFromYad2Url_(cleanUrl);
  const maxPriceColVal = urlLimits.maxPrice > 0 ? urlLimits.maxPrice : '';

  sheet.appendRow(['כן', customName, cleanUrl, '', 'נוסף מהטלגרם', '', '', maxPriceColVal]);

  let notes = '';
  if (wasCleanedBBox || cleanUrl.indexOf('bBox=') !== -1) {
    notes += '\n🗺 *מצב bBox נקי:* הוסרו אוטומטית הגבלות עיר/אזור כדי לסרוק את כל המרחב הגיאוגרפי!';
  }
  if (urlLimits.minPrice > 0 || urlLimits.maxPrice > 0) {
    notes += '\n💰 *סינון מחיר שזוהה:* ' + escapeMarkdown_(formatPriceFilterSummary_(urlLimits));
  }

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '📋 צפייה ואיחוד חיפושים', callback_data: 'MENU_SEARCHES' },
        { text: '🚀 הפעל סריקה עכשיו', callback_data: 'ACT_SCAN' }
      ],
      [
        { text: '🔙 לתפריט הראשי', callback_data: 'MENU_MAIN' }
      ]
    ]
  };

  sendTelegramText_(
    chatId,
    '✅ *החיפוש נוסף בהצלחה למעקב!*\n' +
    '🏷 שם: *' + escapeMarkdown_(customName) + '*' +
    notes + '\n' +
    '🔗 קישור: ' + cleanUrl,
    inlineKeyboard
  );
  logEvent_('ADD_URL', 'נוסף קישור חדש מהטלגרם: ' + customName);
}

function sendNewListingsToTelegram_(listings) {
  const chatId = getChatId_();
  const token = getBotToken_();
  if (!chatId || !token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    logEvent_('WARN', 'לא הוגדר TELEGRAM_BOT_TOKEN או TELEGRAM_CHAT_ID. הדירות נשמרו בגיליון בלבד.');
    return 0;
  }

  let sentCount = 0;
  const maxToSend = Math.min(listings.length, CONFIG.MAX_NOTIFICATIONS_PER_RUN);

  for (let i = 0; i < maxToSend; i++) {
    const item = listings[i];
    const caption = formatApartmentTelegramMessage_(item);

    const sent = sendTelegramNotificationItem_(token, chatId, caption, item.coverImage, item.itemUrl, item.displayAddress);
    if (sent) sentCount++;

    if (i < maxToSend - 1) {
      Utilities.sleep(500);
    }
  }

  if (listings.length > maxToSend) {
    const remaining = listings.length - maxToSend;
    sendTelegramText_(
      chatId,
      'ℹ️ נמצאו עוד *' + remaining + '* דירות חדשות נוספות שנשמרו בגיליון ה-Google Sheets שלכם.'
    );
  }

  return sentCount;
}

function formatApartmentTelegramMessage_(item) {
  const searchesText = (item.matchedSearches && item.matchedSearches.length > 0)
    ? item.matchedSearches.join(' + ')
    : 'חיפוש יד 2';

  const lines = [
    '🏠 *דירה חדשה להשכרה ביד 2!*',
    '📍 *כתובת:* ' + escapeMarkdown_(item.displayAddress),
    '💰 *מחיר:* ' + escapeMarkdown_(item.price),
    '🛏 *חדרים:* ' + escapeMarkdown_(item.rooms || 'לא צוין') +
      ' | 🏢 *קומה:* ' + escapeMarkdown_(item.floor || 'לא צוין') +
      ' | 📐 *גודל:* ' + escapeMarkdown_(item.squareMeters ? item.squareMeters + ' מ"ר' : 'לא צוין'),
    '🏘 *סוג נכס:* ' + escapeMarkdown_(item.propertyType || 'דירה') +
      (item.publisherType ? ' | 👤 *מפרסם:* ' + escapeMarkdown_(item.publisherType) : '')
  ];

  if (item.description) {
    const shortDesc = item.description.length > 180 ? item.description.substring(0, 177) + '...' : item.description;
    lines.push('📝 *תיאור:* ' + escapeMarkdown_(shortDesc));
  }

  if (item.tags) {
    lines.push('✨ *מאפיינים:* ' + escapeMarkdown_(item.tags));
  }

  lines.push('🔎 *מקור:* ' + escapeMarkdown_(searchesText));
  lines.push('🔗 [לצפייה במודעה המלאה ביד 2](' + item.itemUrl + ')');

  return lines.join('\n');
}

function sendTelegramNotificationItem_(token, chatId, caption, imageUrl, itemUrl, displayAddress) {
  const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(displayAddress || 'ישראל');
  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '🏠 פתח מודעה ביד 2', url: itemUrl },
        { text: '🗺 מיקום במפה', url: mapsUrl }
      ],
      [
        { text: '🎛 תפריט הבוט', callback_data: 'MENU_MAIN' },
        { text: '💰 שינוי תקרת מחיר', callback_data: 'MENU_PRICE' }
      ]
    ]
  };

  if (imageUrl && imageUrl.indexOf('http') === 0) {
    try {
      const photoRes = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendPhoto', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          chat_id: chatId,
          photo: imageUrl,
          caption: caption,
          parse_mode: 'Markdown',
          reply_markup: inlineKeyboard
        }),
        muteHttpExceptions: true
      });
      if (photoRes.getResponseCode() === 200) {
        return true;
      }
    } catch (e) {}
  }

  return sendTelegramText_(chatId, caption, inlineKeyboard);
}

function sendTelegramText_(chatId, text, replyMarkup) {
  const token = getBotToken_();
  if (!token || !chatId) return false;

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  try {
    const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code === 200) {
      return true;
    }

    const bodyText = res.getContentText();
    try {
      const errObj = JSON.parse(bodyText);
      const migratedChatId = errObj && errObj.parameters && errObj.parameters.migrate_to_chat_id;
      if (migratedChatId) {
        const newChatIdStr = String(migratedChatId);
        PropertiesService.getScriptProperties().setProperty('TELEGRAM_CHAT_ID', newChatIdStr);
        payload.chat_id = newChatIdStr;
        const retryRes = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        if (retryRes.getResponseCode() === 200) return true;
      }
    } catch (parseErr) {}

    // ניסיון חוזר ללא Markdown אם תו מיוחד בשם של חיפוש גרם לשגיאת פارسינג בטלגרם
    if (code === 400) {
      delete payload.parse_mode;
      const plainRetry = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      if (plainRetry.getResponseCode() === 200) return true;
    }

    logEvent_('TG_ERR', 'שגיאה משרת טלגרם (' + code + '): ' + bodyText);
    return false;
  } catch (e) {
    logEvent_('TG_ERR', 'שגיאה בשליחת הודעת טלגרם: ' + e.message);
    return false;
  }
}

// ============================================================================
// 🛠️ פונקציות עזר (Utilities & Helpers)
// ============================================================================

function getBotToken_() {
  const propToken = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (propToken && propToken.trim() !== '') return propToken.trim();
  return String(CONFIG.TELEGRAM_BOT_TOKEN || '').trim();
}

function getChatId_() {
  const configChat = String(CONFIG.TELEGRAM_CHAT_ID || '').trim();
  if (configChat !== '') return configChat;

  const propChat = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');
  if (propChat && propChat.trim() !== '') return propChat.trim();
  return '';
}

function normalizeYad2Url_(url) {
  let clean = String(url || '').trim();
  if (clean.indexOf('http') !== 0) {
    clean = 'https://' + clean;
  }
  return clean;
}

function buildSearchNameFromUrl_(url) {
  const limits = extractPriceLimitsFromYad2Url_(url);
  const priceSuffix = limits.maxPrice > 0 ? (' (עד ₪' + limits.maxPrice.toLocaleString('en-US') + ')') : '';

  if (url.indexOf('bBox=') !== -1) return 'חיפוש מפה (bBox נקי ללא עיר/אזור)' + priceSuffix;

  const cityMatch = url.match(/[?&]city=([^&]+)/);
  const areaMatch = url.match(/[?&]area=([^&]+)/);

  const areaNames = {
    '52': 'אזור גדרה - יבנה והסביבה',
    '99': 'אזור השפלה (קריית מלאכי, חצב והסביבה)',
    '21': 'אזור אשדוד - אשקלון והסביבה'
  };

  if (areaMatch && !cityMatch && areaNames[areaMatch[1]]) {
    return areaNames[areaMatch[1]] + priceSuffix;
  }
  if (cityMatch && areaMatch) return 'חיפוש עיר ' + cityMatch[1] + ' (אזור ' + areaMatch[1] + ')' + priceSuffix;
  if (cityMatch) return 'חיפוש עיר ' + cityMatch[1] + priceSuffix;
  if (areaMatch) return 'חיפוש אזור ' + areaMatch[1] + priceSuffix;
  return 'חיפוש יד 2' + priceSuffix;
}

function parseNumericPrice_(priceVal) {
  if (priceVal === undefined || priceVal === null || priceVal === '') return null;
  if (typeof priceVal === 'number') return priceVal > 0 ? priceVal : null;
  const cleaned = String(priceVal).replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const num = parseInt(cleaned, 10);
  return (!isNaN(num) && num > 0) ? num : null;
}

function formatPriceIls_(priceVal) {
  const numeric = parseNumericPrice_(priceVal);
  if (numeric !== null) {
    return '₪ ' + numeric.toLocaleString('en-US');
  }
  if (priceVal === undefined || priceVal === null || priceVal === '') {
    return 'לא צוין מחיר';
  }
  const str = String(priceVal).trim();
  return str || 'לא צוין מחיר';
}

function extractFieldText_(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'object') {
    const inner = val.text !== undefined ? val.text : (val.name !== undefined ? val.name : (val.label !== undefined ? val.label : ''));
    return cleanText_(inner);
  }
  return cleanText_(val);
}

function cleanText_(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'object') return '';
  return String(val).replace(/\s+/g, ' ').trim();
}

function escapeMarkdown_(text) {
  if (!text) return '';
  return String(text).replace(/([_*`\[])/g, '\\$1');
}

function formatIsraelTime_(dateObj) {
  return Utilities.formatDate(dateObj, 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm:ss');
}

function logEvent_(type, details) {
  console.log('[' + type + '] ' + details);
  try {
    const ss = getSpreadsheet_();
    const logSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
    if (logSheet) {
      logSheet.appendRow([formatIsraelTime_(new Date()), type, details]);
      if (logSheet.getLastRow() > 520) {
        logSheet.deleteRows(2, 20);
      }
    }
  } catch (e) {}
}