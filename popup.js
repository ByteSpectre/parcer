window.addEventListener('DOMContentLoaded', () => {
  const locationTypeSelect = document.getElementById('locationType');
  locationTypeSelect.addEventListener('change', () => {
    const value = locationTypeSelect.value;
    const container = document.getElementById('locationOptionsContainer');
    const label = document.getElementById('locationOptionsLabel');
    const select = document.getElementById('locationOptions');
    if (value === "none") {
      container.style.display = "none";
    } else {
      container.style.display = "block";
      select.innerHTML = "";
      if (value === "districts") {
        label.textContent = "Выберите район:";
        const options = [
          { value: "101", text: "Центральный район" },
          { value: "102", text: "Северный район" }
        ];
        options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.text;
          select.appendChild(option);
        });
      } else if (value === "metro") {
        label.textContent = "Выберите метро:";
        const options = [
          { value: "201", text: "Садовая" },
          { value: "202", text: "Арбатская" }
        ];
        options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.text;
          select.appendChild(option);
        });
      }
    }
  });
});

document.getElementById('startButton').addEventListener('click', () => {
  const categoriesText = document.getElementById('categories').value.trim();
  if (!categoriesText) {
    alert("Пожалуйста, укажите хотя бы одну категорию.");
    return;
  }
  const categories = categoriesText.split('\n').map(c => c.trim()).filter(Boolean);
  
  const citiesText = document.getElementById('cities').value.trim();
  if (!citiesText) {
    alert("Пожалуйста, укажите хотя бы один город.");
    return;
  }
  const cities = citiesText.split('\n').map(c => c.trim()).filter(Boolean);
  
  const locationType = document.getElementById('locationType').value;
  let locationOption = null;
  if (locationType !== "none") {
    locationOption = document.getElementById('locationOptions').value;
  }
  
  const period = document.querySelector('input[name="period"]:checked').value;
  
  const priceFromValue = document.getElementById('priceFrom').value.trim();
  const priceToValue = document.getElementById('priceTo').value.trim();
  const priceFrom = priceFromValue ? parseFloat(priceFromValue) : null;
  const priceTo = priceToValue ? parseFloat(priceToValue) : null;
  
  const sellerTypeValue = document.querySelector('input[name="sellerType"]:checked').value;
  const sellerType = (sellerTypeValue === "all") ? null : parseInt(sellerTypeValue);
  
  const requestData = {
    categories,
    cities,
    locationType,
    locationOption,
    period,
    priceFrom,
    priceTo,
    sellerType
  };
  
  updateProgress(0);
  updateParsedCount(0);
  
  chrome.runtime.sendMessage({
    action: 'startMarketParsing',
    data: requestData
  }, (response) => {
    console.log("Ответ фонового скрипта:", response);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'parsingProgress') {
    updateProgress(message.progress);
    updateParsedCount(message.parsedCount);
  }
  if (message.action === 'showAlert') {
    alert(message.message);
  }
});

function updateProgress(progressPercent) {
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  progressBar.value = progressPercent;
  progressText.textContent = progressPercent + '%';
}

function updateParsedCount(count) {
  const parsedCountDiv = document.getElementById('parsedCount');
  parsedCountDiv.textContent = "Спарсено отчетов: " + count;
}
