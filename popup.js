// Переключение вкладок
const tabQueries = document.getElementById('tabQueries');
const tabCategories = document.getElementById('tabCategories');
const queriesSection = document.getElementById('queriesSection');
const categoriesSection = document.getElementById('categoriesSection');

tabQueries.addEventListener('click', () => {
  tabQueries.classList.add('active');
  tabCategories.classList.remove('active');
  queriesSection.style.display = 'block';
  categoriesSection.style.display = 'none';
});

tabCategories.addEventListener('click', () => {
  tabCategories.classList.add('active');
  tabQueries.classList.remove('active');
  categoriesSection.style.display = 'block';
  queriesSection.style.display = 'none';
});

// Обработка формы "Аналитика по запросам"
document.getElementById('startQueriesButton').addEventListener('click', () => {
  const queriesText = document.getElementById('queries').value.trim();
  const regionsText = document.getElementById('regions').value.trim();
  const period = document.getElementById('periodQueries').value;

  if (!queriesText || !regionsText) {
    alert("Пожалуйста, заполните поля для запросов и регионов.");
    return;
  }

  const queries = queriesText.split('\n').map(q => q.trim()).filter(Boolean);
  const regions = regionsText.split('\n').map(r => r.trim()).filter(Boolean);

  updateQueriesProgress(0);
  updateQueriesParsedCount(0);

  chrome.runtime.sendMessage({
    action: 'startParsing',
    data: { queries, regions, period }
  }, (response) => {
    console.log("Ответ (запросы) от background:", response);
  });
});

// Обработка формы "Аналитика по категориям"
document.getElementById('startCategoriesButton').addEventListener('click', () => {
  const categoriesText = document.getElementById('categories').value.trim();
  const citiesText = document.getElementById('cities').value.trim();
  const locationType = document.getElementById('locationType').value;
  const period = document.getElementById('periodCategories').value;
  const priceFromValue = document.getElementById('priceFrom').value.trim();
  const priceToValue = document.getElementById('priceTo').value.trim();
  const sellerTypeValue = document.querySelector('input[name="sellerType"]:checked').value;

  if (!categoriesText || !citiesText) {
    alert("Пожалуйста, заполните поля категорий и городов.");
    return;
  }

  const categories = categoriesText.split('\n').map(c => c.trim()).filter(Boolean);
  const cities = citiesText.split('\n').map(c => c.trim()).filter(Boolean);
  const priceFrom = priceFromValue ? parseFloat(priceFromValue) : null;
  const priceTo = priceToValue ? parseFloat(priceToValue) : null;
  const sellerType = (sellerTypeValue === "all") ? null : parseInt(sellerTypeValue);

  updateCategoriesProgress(0);
  updateCategoriesParsedCount(0);

  chrome.runtime.sendMessage({
    action: 'startMarketParsing',
    data: { categories, cities, locationType, period, priceFrom, priceTo, sellerType }
  }, (response) => {
    console.log("Ответ (категории) от background:", response);
  });
});

// Прием сообщений о прогрессе
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'parsingProgress') {
    if (message.mode === 'queries') {
      updateQueriesProgress(message.progress);
      updateQueriesParsedCount(message.parsedCount);
    } else if (message.mode === 'categories') {
      updateCategoriesProgress(message.progress);
      updateCategoriesParsedCount(message.parsedCount);
    } else {
      // Если mode не указан, обновляем оба
      updateQueriesProgress(message.progress);
      updateQueriesParsedCount(message.parsedCount);
      updateCategoriesProgress(message.progress);
      updateCategoriesParsedCount(message.parsedCount);
    }
  }
  if (message.action === 'showAlert') {
    alert(message.message);
  }
});

function updateQueriesProgress(progress) {
  const progressBar = document.getElementById('progressBarQueries');
  const progressText = document.getElementById('progressTextQueries');
  progressBar.value = progress;
  progressText.textContent = progress + '%';
}

function updateQueriesParsedCount(count) {
  const parsedCountDiv = document.getElementById('parsedCountQueries');
  parsedCountDiv.textContent = "Спарсено отчетов: " + count;
}

function updateCategoriesProgress(progress) {
  const progressBar = document.getElementById('progressBarCategories');
  const progressText = document.getElementById('progressTextCategories');
  progressBar.value = progress;
  progressText.textContent = progress + '%';
}

function updateCategoriesParsedCount(count) {
  const parsedCountDiv = document.getElementById('parsedCountCategories');
  parsedCountDiv.textContent = "Спарсено отчетов: " + count;
}
