<?php
$filename = 'text.txt';
$rawText = file_exists($filename) ? file_get_contents($filename) : 'Файл text.txt не найден. Создайте его в той же папке.';

// Разбиваем только для подсчёта слов (для информации)
preg_match_all('/\p{L}+/u', $rawText, $wordMatches);
$totalWords = count($wordMatches[0]);
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Плавный скорочтение</title>
    <style>
        /* ---------- Тёмная тема ---------- */
        * {
            box-sizing: border-box;
            font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        }
        body {
            background: #0b0e14;
            margin: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }
        .wrapper {
            max-width: 820px;
            width: 100%;
            background: #1a1f2b;
            padding: 20px 25px 25px;
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        }
        h1 {
            margin-top: 0;
            font-weight: 600;
            font-size: 24px;
            color: #e2e8f0;
        }
        .controls {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 14px 20px;
            margin-bottom: 18px;
            padding-bottom: 14px;
            border-bottom: 1px solid #2d3548;
        }
        .controls label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 500;
            font-size: 15px;
            color: #cbd5e1;
        }
        .controls input[type="number"] {
            width: 85px;
            padding: 6px 8px;
            border: 1px solid #3d465a;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 500;
            text-align: center;
            background: #0f131c;
            color: #f1f5f9;
        }
        .controls button {
            padding: 8px 22px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 15px;
            cursor: pointer;
            transition: background 0.15s, opacity 0.15s;
        }
        #startBtn {
            background: #3b82f6;
            color: white;
        }
        #startBtn:hover:not(:disabled) {
            background: #2563eb;
        }
        #pauseBtn {
            background: #f59e0b;
            color: #0b0e14;
        }
        #pauseBtn:hover:not(:disabled) {
            background: #d97706;
        }
        #pauseBtn:disabled,
        #startBtn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        #status {
            font-size: 14px;
            color: #94a3b8;
            background: #2d3548;
            padding: 4px 16px;
            border-radius: 30px;
            font-weight: 500;
            margin-left: auto;
        }
        .progress-wrap {
            width: 100%;
            height: 4px;
            background: #2d3548;
            border-radius: 4px;
            margin-bottom: 14px;
            overflow: hidden;
        }
        #progressBar {
            height: 100%;
            width: 0%;
            background: #3b82f6;
            border-radius: 4px;
            transition: width 0.1s linear;
        }
        #text-container {
            height: 480px;
            overflow: auto;
            padding: 18px 22px;
            border: 1px solid #2d3548;
            border-radius: 14px;
            background: #111720;
            color: #f1f5f9;
            line-height: 1.8;
            font-size: 18px;
            position: relative;
            user-select: none;
            scroll-behavior: auto; /* чтобы управлять скроллом сами */
        }
        #text-content {
            white-space: pre-wrap;
            word-break: break-word;
        }
        .info {
            margin-top: 14px;
            font-size: 14px;
            color: #94a3b8;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            background: #0f131c;
            padding: 8px 16px;
            border-radius: 30px;
        }
        .info span {
            background: #1a1f2b;
            padding: 2px 14px;
            border-radius: 20px;
        }
        .footer-note {
            margin-top: 16px;
            font-size: 13px;
            color: #4a5568;
            text-align: center;
        }
        @media (max-width: 600px) {
            #text-container {
                height: 340px;
                font-size: 16px;
                padding: 12px;
            }
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <h1>🌙 Плавное чтение</h1>
        <div class="controls">
            <label>
                Слов/мин
                <input type="number" id="wpmInput" value="250" min="1" step="5">
            </label>
            <button id="startBtn">▶ Старт</button>
            <button id="pauseBtn" disabled>⏸ Пауза</button>
            <span id="status">Остановлено</span>
        </div>
        <div class="progress-wrap">
            <div id="progressBar"></div>
        </div>
        <div id="text-container">
            <div id="text-content">
                <?php echo nl2br(htmlspecialchars($rawText, ENT_QUOTES, 'UTF-8')); ?>
            </div>
        </div>
        <div class="info">
            <span id="wordCounter">Слов: <?php echo $totalWords; ?></span>
            <span id="currentPos">0%</span>
            <span id="progressPercent">0%</span>
        </div>
        <div class="footer-note">На паузе можно скроллить вручную. Текст движется плавно, без рывков.</div>
    </div>

    <script>
        (function() {
            // DOM
            const container = document.getElementById('text-container');
            const content = document.getElementById('text-content');
            const startBtn = document.getElementById('startBtn');
            const pauseBtn = document.getElementById('pauseBtn');
            const wpmInput = document.getElementById('wpmInput');
            const statusSpan = document.getElementById('status');
            const progressBar = document.getElementById('progressBar');
            const currentPosSpan = document.getElementById('currentPos');
            const progressPercentSpan = document.getElementById('progressPercent');

            // Состояние
            let isRunning = false;
            let animationId = null;
            let lastTimestamp = 0;
            let speedPxPerSec = 0;      // пикселей в секунду
            let maxScroll = 0;           // максимальная прокрутка
            let totalWords = <?php echo $totalWords; ?>;

            // Пересчёт размеров (при изменении окна или текста)
            function calcMaxScroll() {
                const containerHeight = container.clientHeight;
                const contentHeight = content.scrollHeight;
                maxScroll = Math.max(0, contentHeight - containerHeight);
                return maxScroll;
            }

            // Вычисление скорости на основе WPM и текущих размеров
            function calcSpeed() {
                const wpm = parseFloat(wpmInput.value) || 250;
                if (totalWords === 0 || wpm === 0) return 0;
                // Время на весь текст в секундах
                const totalTimeSec = totalWords / (wpm / 60);
                if (totalTimeSec <= 0) return 0;
                const scroll = calcMaxScroll();
                if (scroll <= 0) return 0;
                return scroll / totalTimeSec; // пикселей/сек
            }

            // Обновление индикаторов прогресса
            function updateProgress() {
                const scrollTop = container.scrollTop;
                const progress = maxScroll > 0 ? Math.min(100, (scrollTop / maxScroll) * 100) : 0;
                progressBar.style.width = progress + '%';
                const percentStr = Math.round(progress) + '%';
                currentPosSpan.textContent = percentStr;
                progressPercentSpan.textContent = percentStr;
            }

            // Остановка (пауза или завершение)
            function stopReading(completed = false) {
                if (animationId) {
                    cancelAnimationFrame(animationId);
                    animationId = null;
                }
                isRunning = false;
                container.style.overflow = 'auto'; // разблокируем скролл
                startBtn.disabled = false;
                pauseBtn.disabled = true;
                statusSpan.textContent = completed ? '✅ Завершено' : '⏸ На паузе';
                if (completed) {
                    // доскролливаем до конца
                    container.scrollTop = maxScroll;
                    updateProgress();
                } else {
                    updateProgress();
                }
            }

            // Главный цикл анимации
            function step(timestamp) {
                if (!isRunning) return;
                if (lastTimestamp === 0) {
                    lastTimestamp = timestamp;
                    animationId = requestAnimationFrame(step);
                    return;
                }
                const deltaSec = (timestamp - lastTimestamp) / 1000;
                lastTimestamp = timestamp;

                // Плавное смещение
                let newScroll = container.scrollTop + speedPxPerSec * deltaSec;
                if (newScroll >= maxScroll) {
                    container.scrollTop = maxScroll;
                    updateProgress();
                    stopReading(true);
                    return;
                }
                container.scrollTop = newScroll;
                updateProgress();

                // Следующий кадр
                animationId = requestAnimationFrame(step);
            }

            // Запуск чтения
            function startReading() {
                if (isRunning) return;
                // Пересчитываем размеры и скорость
                maxScroll = calcMaxScroll();
                speedPxPerSec = calcSpeed();

                if (speedPxPerSec <= 0 || maxScroll <= 0) {
                    alert('Текст слишком короткий или скорость слишком мала. Проверьте настройки.');
                    return;
                }

                // Если уже дошли до конца, сбрасываем в начало
                if (container.scrollTop >= maxScroll) {
                    container.scrollTop = 0;
                    updateProgress();
                }

                // Блокируем ручной скролл
                container.style.overflow = 'hidden';

                isRunning = true;
                startBtn.disabled = true;
                pauseBtn.disabled = false;
                statusSpan.textContent = '▶ Чтение…';
                lastTimestamp = 0;
                updateProgress();
                animationId = requestAnimationFrame(step);
            }

            // Пауза
            function pauseReading() {
                if (isRunning) {
                    stopReading(false);
                }
            }

            // Обработчики кнопок
            startBtn.addEventListener('click', startReading);
            pauseBtn.addEventListener('click', pauseReading);

            // При изменении размера окна пересчитываем maxScroll (если не читаем)
            let resizeTimeout;
            window.addEventListener('resize', function() {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(function() {
                    if (!isRunning) {
                        maxScroll = calcMaxScroll();
                        updateProgress();
                    }
                }, 300);
            });

            // При ручном скролле на паузе обновляем прогресс
            container.addEventListener('scroll', function() {
                if (!isRunning) {
                    updateProgress();
                }
            });

            // Инициализация
            maxScroll = calcMaxScroll();
            updateProgress();
            console.log('Тренажёр готов. Слов: ' + totalWords);
        })();
    </script>
</body>
</html>