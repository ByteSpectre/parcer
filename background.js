import { categoryMapping } from "./category_id.js";
import { cityMapping } from "./cities.js";

console.log("Фоновый скрипт для Avito Market Analytics запущен.");

let resultsTable = [];
let totalSteps = 0;
let currentStep = 0;
let stopParsing = false;

function getCategoryId(categoryName) {
  const key = categoryName.trim().toLowerCase();
  return categoryMapping[key] || null;
}

function getCityId(cityName) {
  const key = cityName.trim().toLowerCase();
  return cityMapping[key] || null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay() {
  return Math.floor(Math.random() * 2000) + 1000;
}

function updateProgress() {
  const progressPercent = Math.round((currentStep / totalSteps) * 100);
  chrome.runtime.sendMessage({
    action: 'parsingProgress',
    progress: progressPercent,
    parsedCount: currentStep
  });
}

function getSellerText(sellerType) {
  if (sellerType === 1) return "Частные";
  if (sellerType === 2) return "Компании";
  return "Все продавцы";
}

function buildRequestBody(categoryId, cityId, locationType, locationOption, period, priceFrom, priceTo, sellerType) {
  const filters = {
    nodeId: categoryId,
    locationIds: [cityId],
    districtIds: (locationType === "districts") ? [parseInt(locationOption)] : [],
    metroIds: (locationType === "metro") ? [parseInt(locationOption)] : [],
    sellerType: sellerType
  };
  if (priceFrom !== null) {
    filters.minPrice = priceFrom;
  }
  if (priceTo !== null) {
    filters.maxPrice = priceTo;
  }
  return {
    filters,
    group: period,
    order: "demand",
    direction: "desc",
    splitBy: "category"
  };
}

async function sendMarketRequest(requestBody) {
  try {
    const response = await fetch("https://www.avito.ru/web/1/sellers/analytics/market", {
      method: "POST",
      headers: {
        "accept": "application/json, text/plain, */*",
        "content-type": "application/json",
        "origin": "https://www.avito.ru",
        "referer": "https://www.avito.ru/analytics/market",
        "user-agent": "Mozilla/5.0"
      },
      credentials: "include",
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      return { error: `Ошибка запроса: ${response.status}` };
    }
    return await response.json();
  } catch (error) {
    return { error: error.message };
  }
}

async function startMarketParsing(params) {
  const { categories, cities, locationType, locationOption, period, priceFrom, priceTo, sellerType } = params;
  const validCategories = [];
  for (const catName of categories) {
    const catId = getCategoryId(catName);
    if (catId) {
      validCategories.push({ name: catName, id: catId });
    } else {
      console.warn(`Неизвестная категория: "${catName}" (пропускаем)`);
    }
  }
  const validCities = [];
  for (const cityName of cities) {
    const cId = getCityId(cityName);
    if (cId) {
      validCities.push({ name: cityName, id: cId });
    } else {
      console.warn(`Неизвестный город: "${cityName}" (пропускаем)`);
    }
  }
  totalSteps = validCategories.length * validCities.length;
  currentStep = 0;
  resultsTable = [];
  stopParsing = false;
  let headers = ["Категория", "Город", "Период"];
  if (locationType !== "none") {
    headers.push("Тип локации");
  }
  headers = headers.concat([
    "Цена (от-до руб)",
    "Вид продавца",
    "Уровень спроса",
    "Объявления",
    "Контакты",
    "Всего просмотров",
    "Просмотров на объявление",
    "Доля от всех объявлений в категории",
    "Всего продавцов в категории",
    "Конверсия из просмотра в контакт"
  ]);
  for (const cityObj of validCities) {
    for (const catObj of validCategories) {
      if (stopParsing) break;
      const requestBody = buildRequestBody(catObj.id, cityObj.id, locationType, locationOption, period, priceFrom, priceTo, sellerType);
      console.log("Отправка запроса:", requestBody);
      const data = await sendMarketRequest(requestBody);
      if (data.error) {
        console.error(`Ошибка для категории "${catObj.name}" и города "${cityObj.name}":`, data.error);
        if (data.error.includes("429") || data.error.toLowerCase().includes("бан")) {
          stopParsing = true;
          break;
        }
      } else {
        if (!data.nodes || (Array.isArray(data.nodes) && data.nodes.length === 0)) {
          chrome.runtime.sendMessage({
            action: 'showAlert',
            message: "Не получилось загрузить аналитику, так как статистика отсутствует для выбранного периода. Выберите другой период или измените фильтры."
          });
          currentStep++;
          updateProgress();
          await delay(getRandomDelay());
          continue;
        }
        if (data.summary) {
          let row = [];
          row.push(catObj.name, cityObj.name, period);
          if (locationType !== "none") {
            row.push(locationType === "districts" ? "Районы" : "Метро");
          }
          if (priceFrom !== null && priceTo !== null) {
            row.push(`${priceFrom}-${priceTo}`);
          } else {
            row.push("");
          }
          row.push(getSellerText(sellerType));
          row.push(data.summary.demand ? data.summary.demand.estimate : "");
          row.push(data.summary.countItems);
          row.push(data.summary.contacts);
          row.push(data.summary.views);
          row.push(data.summary.viewsPerItem);
          row.push(data.summary.categoryRateByItems);
          row.push(data.summary.countSellers);
          row.push(data.summary.viewsToContactConversion);
          resultsTable.push(row);
        } else {
          console.warn("Отсутствует summary в ответе", data);
        }
      }
      currentStep++;
      updateProgress();
      await delay(getRandomDelay());
    }
    if (stopParsing) break;
  }
  console.log("Парсинг завершён.");
  exportResultsToCSV(headers, resultsTable);
  chrome.runtime.sendMessage({
    action: 'parsingProgress',
    progress: 100,
    parsedCount: currentStep
  });
}

function exportResultsToCSV(headers, rows) {
  let csvContent = headers.join(",") + "\n";
  rows.forEach(row => {
    const csvRow = row.map(field => {
      const str = String(field);
      return str.includes(",") ? `"${str}"` : str;
    }).join(",");
    csvContent += csvRow + "\n";
  });
  console.log("CSV-содержимое:", csvContent);
  const dataUrl = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
  chrome.downloads.download({
    url: dataUrl,
    filename: "avito_market_results.csv",
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error("Ошибка скачивания:", chrome.runtime.lastError);
    } else {
      console.log("Скачивание начато, downloadId:", downloadId);
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startMarketParsing') {
    startMarketParsing(message.data);
    sendResponse({ status: 'started' });
  }
});
