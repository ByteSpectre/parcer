import { categoryMapping } from "./category_id.js";
import { cityMapping } from "./cities.js";

console.log("Combined background script loaded.");

// ------------------------------
// Общие утилиты
// ------------------------------
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay() {
  return Math.floor(Math.random() * 2000) + 1000;
}

function getSellerText(sellerType) {
  if (sellerType === 1) return "Частные";
  if (sellerType === 2) return "Компании";
  return "Все продавцы";
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

// ------------------------------
// Функции для аналитики по запросам (wordstat)
// ------------------------------
let resultsTableQueries = [];
let totalStepsQueries = 0;
let currentStepQueries = 0;
let stopParsingQueries = false;

function getCityId(cityName) {
  const key = cityName.trim().toLowerCase();
  return cityMapping[key] || null;
}

function getRandomBatchSize() {
  return Math.floor(Math.random() * 4) + 2;
}

function updateQueriesProgress() {
  const progress = Math.round((currentStepQueries / totalStepsQueries) * 100);
  chrome.runtime.sendMessage({
    action: 'parsingProgress',
    progress: progress,
    parsedCount: currentStepQueries,
    mode: 'queries'
  });
}

async function sendAnalyticsRequest(singleQuery, region, period) {
  const regionId = getCityId(region);
  console.log(`Sending query "${singleQuery}" for region "${region}" (ID: ${regionId})`);
  try {
    const response = await fetch("https://www.avito.ru/web/1/sellers/analytics/wordstat", {
      method: "POST",
      headers: {
        "accept": "application/json, text/plain, */*",
        "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json",
        "origin": "https://www.avito.ru",
        "referer": "https://www.avito.ru/analytics/wordstat",
        "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\""
      },
      credentials: "include",
      body: JSON.stringify({
        queries: [singleQuery],
        filters: { duration: period, locationId: regionId, categoryId: null },
        strictMode: false
      })
    });
    if (!response.ok) {
      return { error: `Ошибка запроса: ${response.status}` };
    }
    return await response.json();
  } catch (error) {
    return { error: error.message };
  }
}

async function startQueriesParsing({ queries, regions, period }) {
  resultsTableQueries = [];
  stopParsingQueries = false;
  totalStepsQueries = queries.length * regions.length;
  currentStepQueries = 0;
  for (let region of regions) {
    let index = 0;
    while (index < queries.length && !stopParsingQueries) {
      const batchSize = queries.length > 15 ? getRandomBatchSize() : 5;
      const batch = queries.slice(index, index + batchSize);
      index += batchSize;
      try {
        const batchResults = await Promise.all(batch.map(query => sendAnalyticsRequest(query, region, period)));
        for (let i = 0; i < batchResults.length; i++) {
          const data = batchResults[i];
          let totalCount;
          if (data.error) {
            totalCount = data.error;
            if (data.error.includes("429") || data.error.toLowerCase().includes("бан")) {
              stopParsingQueries = true;
              console.error(`Блокировка для запроса "${batch[i]}" в регионе "${region}".`);
              break;
            }
          } else if (data && Array.isArray(data.periodData)) {
            totalCount = 0;
            for (const dayInfo of data.periodData) {
              if (Array.isArray(dayInfo.counts)) {
                const daySum = dayInfo.counts.reduce((acc, val) => acc + Number(val || 0), 0);
                totalCount += daySum;
              }
            }
          } else {
            totalCount = "Неверный формат ответа";
            console.warn("Неверный формат:", data);
          }
          resultsTableQueries.push({
            query: batch[i],
            region: region,
            period: period === "week" ? "7 дней" : "30 дней",
            count: totalCount
          });
          currentStepQueries++;
          updateQueriesProgress();
        }
      } catch (error) {
        console.error(`Ошибка для региона "${region}" и батча: ${batch.join(", ")}`, error);
        currentStepQueries += batch.length;
        updateQueriesProgress();
      }
      if (stopParsingQueries) break;
      await delay(getRandomDelay());
    }
    if (stopParsingQueries) break;
  }
  exportQueriesResults();
  chrome.runtime.sendMessage({
    action: 'parsingProgress',
    progress: 100,
    parsedCount: currentStepQueries,
    mode: 'queries'
  });
}

function exportQueriesResults() {
  const headers = ["Ключевой запрос", "Регион", "Период", "Количество запросов"];
  let csvContent = headers.join(",") + "\n";
  resultsTableQueries.forEach(item => {
    const row = [
      item.query,
      item.region,
      item.period,
      item.count
    ].map(field => {
      const str = String(field);
      return str.includes(",") ? `"${str}"` : str;
    }).join(",");
    csvContent += row + "\n";
  });
  const dataUrl = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
  chrome.downloads.download({
    url: dataUrl,
    filename: "queries_results.csv",
    saveAs: false
  });
}

// ------------------------------
// Функции для аналитики по категориям (Market)
// ------------------------------
let resultsTableCategories = [];
let totalStepsCategories = 0;
let currentStepCategories = 0;
let stopParsingCategories = false;

function getCategoryId(categoryName) {
  const key = categoryName.trim().toLowerCase();
  return categoryMapping[key] || null;
}

function updateCategoriesProgress(progress) {
  chrome.runtime.sendMessage({
    action: 'parsingProgress',
    progress: progress,
    parsedCount: currentStepCategories,
    mode: 'categories'
  });
}

function buildRequestBodyCategory(categoryId, cityId, locationType, locationOption, period, priceFrom, priceTo, sellerType) {
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

async function startMarketParsing({ categories, cities, locationType, locationOption, period, priceFrom, priceTo, sellerType }) {
  let validCategories = [];
  for (const catName of categories) {
    const catId = getCategoryId(catName);
    if (catId) {
      validCategories.push({ name: catName, id: catId });
    } else {
      console.warn(`Неизвестная категория: "${catName}" (пропускаем)`);
    }
  }
  let validCities = [];
  for (const cityName of cities) {
    const cId = getCityId(cityName);
    if (cId) {
      validCities.push({ name: cityName, id: cId });
    } else {
      console.warn(`Неизвестный город: "${cityName}" (пропускаем)`);
    }
  }
  totalStepsCategories = validCategories.length * validCities.length;
  currentStepCategories = 0;
  resultsTableCategories = [];
  stopParsingCategories = false;

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

  for (const catObj of validCategories) {
    for (const cityObj of validCities) {
      if (stopParsingCategories) break;
      const requestBody = buildRequestBodyCategory(catObj.id, cityObj.id, locationType, locationOption, period, priceFrom, priceTo, sellerType);
      console.log("Отправка запроса (категории):", requestBody);
      const data = await sendMarketRequest(requestBody);
      if (data.error) {
        console.error(`Ошибка для категории "${catObj.name}" и города "${cityObj.name}":`, data.error);
        if (data.error.includes("429") || data.error.toLowerCase().includes("бан")) {
          stopParsingCategories = true;
          break;
        }
      } else {
        if (!data.summary) {
          chrome.runtime.sendMessage({
            action: 'showAlert',
            message: `Нет данных для категории "${catObj.name}" в городе "${cityObj.name}".`
          });
          currentStepCategories++;
          updateCategoriesProgress(Math.round((currentStepCategories / totalStepsCategories) * 100));
          await delay(getRandomDelay());
          continue;
        }
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
        resultsTableCategories.push(row);
      }
      currentStepCategories++;
      updateCategoriesProgress(Math.round((currentStepCategories / totalStepsCategories) * 100));
      await delay(getRandomDelay());
    }
    if (stopParsingCategories) break;
  }

  exportCategoriesResults(headers, resultsTableCategories);
  chrome.runtime.sendMessage({
    action: 'parsingProgress',
    progress: 100,
    parsedCount: currentStepCategories,
    mode: 'categories'
  });
}

function exportCategoriesResults(headers, rows) {
  let csvContent = headers.join(",") + "\n";
  rows.forEach(row => {
    const csvRow = row.map(field => {
      const str = String(field);
      return str.includes(",") ? `"${str}"` : str;
    }).join(",");
    csvContent += csvRow + "\n";
  });
  const dataUrl = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
  chrome.downloads.download({
    url: dataUrl,
    filename: "avito_market_results.csv",
    saveAs: false
  });
}

// ------------------------------
// Слушатель сообщений из popup
// ------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startParsing') {
    startQueriesParsing(message.data);
    sendResponse({ status: 'started' });
  } else if (message.action === 'startMarketParsing') {
    startMarketParsing(message.data);
    sendResponse({ status: 'started' });
  }
});
