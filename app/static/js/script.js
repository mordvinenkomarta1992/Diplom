async function generateCode() {
    const prompt = document.getElementById("prompt").value;

    if (!prompt) {
        alert("Введите запрос для генерации кода!");
        return;
    }

    // Показать индикатор загрузки
    const loadingIndicator = document.getElementById("loading");
    loadingIndicator.style.display = "block";

    // Очищаем поля перед выполнением нового запроса
    document.getElementById("output").innerText = "";
    document.getElementById("explanation").innerText = "";
    const resources = document.getElementById("resources");
    resources.innerHTML = "";

    try {
        const response = await fetch("/generate-code", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({prompt}),
        });

        if (!response.ok) {
            throw new Error(`Ошибка: ${response.status}`);
        }

        const data = await response.json();
        document.getElementById("output").innerText = data.code || "Код не найден";
        document.getElementById("explanation").innerText = data.explanation || "Объяснение не найдено";

        const resourcesBlock = document.getElementById("resources");
        const links = data.resources || [];

        resourcesBlock.innerHTML = "";

        if (links.length === 0) {
            resourcesBlock.innerHTML = "<p>Источники не найдены.</p>";
        } else {
            links.forEach(link => {
                // поддержка обоих форматов
                const url = typeof link === "string" ? link : link.url;
                const title = typeof link === "string" ? link : (link.title || link.url);

                const li = document.createElement("li");
                li.innerHTML = `<a href="${url}" target="_blank">${title}</a>`;
                resourcesBlock.appendChild(li);
            });
        }
    } catch (error) {
        console.error("Произошла ошибка:", error);
        document.getElementById("output").innerText = "Ошибка при выполнении запроса.";
        document.getElementById("explanation").innerText = "Проверьте подключение к серверу.";
    } finally {
        // Скрыть индикатор загрузки
        loadingIndicator.style.display = "none";
    }
}

function copyCodeToClipboard() {
    const code = document.getElementById("output").innerText;

    if (!code) {
        alert("Нет кода для копирования!");
        return;
    }

    // Копируем текст в буфер обмена
    navigator.clipboard.writeText(code).then(() => {
        showCopyMessage(); // Показываем сообщение об успешном копировании
    }).catch(err => {
        console.error("Ошибка при копировании:", err);
    });
}

function showCopyMessage() {
    const message = document.createElement("div");
    message.className = "copy-message";
    message.innerText = "Код скопирован!";
    document.body.appendChild(message);

    // Показываем сообщение на 2 секунды
    setTimeout(() => {
        message.remove();
    }, 2000);
}

async function checkConnection() {
    const statusElement = document.getElementById("connection-status");

    try {
        const response = await fetch("/check-connection");
        const data = await response.json();

        if (data.status === "online") {
            statusElement.innerText = "Подключение: Онлайн";
            statusElement.style.color = "green";
        } else {
            statusElement.innerText = `Подключение: Оффлайн (${data.detail})`;
            statusElement.style.color = "red";
        }
    } catch (error) {
        console.error("Ошибка при проверке подключения:", error);
        statusElement.innerText = "Подключение: Оффлайн (Ошибка сети)";
        statusElement.style.color = "red";
    }
}

// Проверяем подключение при загрузке страницы
window.onload = checkConnection;

// Периодическая проверка подключения каждые 5 секунд
setInterval(checkConnection, 5000);

document.getElementById('historyBtn').onclick = async function() {
  const modal = document.getElementById('historyModal');
  const list = document.getElementById('historyList');
  list.innerHTML = '<li>Загрузка...</li>';
  modal.style.display = 'flex';

  // Получаем историю с бэкенда
  const resp = await fetch('/history');
  const data = await resp.json();
  if (data.length === 0) {
    list.innerHTML = '<li>История пуста</li>';
  } else {
    list.innerHTML = '';
    data.forEach(item => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.justifyContent = 'space-between';
      li.style.padding = '8px 0';

      // Левая часть — текст запроса
      const left = document.createElement('span');
      left.textContent = item.prompt;
      left.style.flex = '1';
      left.style.cursor = 'pointer';
      left.onclick = () => showHistoryDetails(item);

      // Кнопка удалить
      const delBtn = document.createElement('button');
      delBtn.style.background = 'none';
      delBtn.style.border = 'none';
      delBtn.style.cursor = 'pointer';
      delBtn.style.marginLeft = '16px';
      delBtn.title = 'Удалить запрос';
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        await fetch(`/history/${item.id}`, { method: 'DELETE' });
        li.remove();
      };
      const delImg = document.createElement('img');
      delImg.src = '/static/elements/delete.png';
      delImg.alt = 'Удалить';
      delImg.style.width = '24px';
      delImg.style.height = '24px';
      delImg.style.filter = 'brightness(0) invert(1)';
      delBtn.appendChild(delImg);

      li.appendChild(left);
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  }
};

function closeHistory() {
  document.getElementById('historyModal').style.display = 'none';
}

function showHistoryDetails(item) {
    const details = document.getElementById('historyDetails');
    let response = {};
    try {
        response = JSON.parse(item.response);
    } catch {
        response = { code: item.response, explanation: '', resources: [] };
    }
    details.innerHTML = `
        <div><b>Запрос:</b> ${item.prompt}</div>
        <div style="margin-top:12px;"><b>Код:</b><pre style="background:#111; color:#fff; padding:8px; border-radius:6px; overflow-x:auto;">${response.code || ''}</pre></div>
        <div style="margin-top:12px;"><b>Объяснение:</b><br>${response.explanation || ''}</div>
        <div style="margin-top:12px;"><b>Источники:</b>
            <ul>
                ${(response.resources || []).map(r => `<li><a href="${r.url}" target="_blank">${r.title}</a></li>`).join('')}
            </ul>
        </div>
    `;
    details.style.display = 'block';
}