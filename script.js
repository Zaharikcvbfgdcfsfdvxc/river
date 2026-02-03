(() => {
    const form = document.querySelector('.search');
    if (form) {
        const input = form.querySelector('input');
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const value = input ? input.value.trim() : '';
            const query = value ? `?q=${encodeURIComponent(value)}` : '';
            window.location.href = `index_videos.html${query}`;
        });
    }

    const freshGrid = document.getElementById('home-fresh-grid');
    const demoLink = document.getElementById('hero-demo-link');
    const demoVideo = document.getElementById('hero-demo-video');
    const demoTitle = document.getElementById('hero-demo-title');
    const demoSubtitle = document.getElementById('hero-demo-subtitle');
    const bgWrapper = document.getElementById('video-bg');
    const bgVideo = document.getElementById('video-bg-media');
    if (!freshGrid && !demoLink && !bgVideo) return;

    const typeLabels = {
        video: 'Видео',
        demo: 'Демо-ролик',
        background: 'Фон'
    };

    const formatDate = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('ru-RU');
    };

    const createCard = (item) => {
        const article = document.createElement('article');
        article.className = 'video-card';
        const link = document.createElement('a');
        link.className = 'video-link';
        link.href = `index_player.html?id=${item.id}`;
        const thumbStyle = item.preview_url
            ? `style="background-image: url('${item.preview_url}'); background-size: cover; background-position: center;"`
            : '';
        link.innerHTML = `
            <div class="thumb" ${thumbStyle}>${typeLabels[item.type] || 'Видео'}</div>
            <div class="card-body">
                <h3>${item.title}</h3>
                <p>${typeLabels[item.type] || 'Видео'} • ${formatDate(item.created_at)}</p>
            </div>
        `;
        article.appendChild(link);
        return article;
    };

    const backgroundSettings = {
        enabled: true,
        blur: 18
    };

    const applyBackground = (hasVideo) => {
        if (!bgWrapper || !bgVideo) return;
        const blurValue = Number.isFinite(Number(backgroundSettings.blur))
            ? Math.min(Math.max(Number(backgroundSettings.blur), 0), 32)
            : 18;
        document.documentElement.style.setProperty('--bg-blur', `${blurValue}px`);
        if (!hasVideo || !backgroundSettings.enabled) {
            bgWrapper.classList.remove('is-active');
            bgVideo.pause();
            return;
        }
        bgWrapper.classList.add('is-active');
        const playAttempt = bgVideo.play();
        if (playAttempt && typeof playAttempt.catch === 'function') {
            playAttempt.catch(() => {});
        }
    };

    const settingsRequest = fetch('/api/settings/background')
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
            if (!data) return;
            backgroundSettings.enabled = data.enabled !== false;
            backgroundSettings.blur = data.blur;
        })
        .catch(() => {});

    fetch('/api/videos')
        .then((res) => res.ok ? res.json() : [])
        .then(async (videos) => {
            const cleaned = videos.filter((item) => item.type !== 'interview');

            if (freshGrid) {
                const fresh = cleaned.filter((item) => item.type === 'video').slice(0, 4);
                const freshEmpty = document.getElementById('home-fresh-empty');
                freshGrid.innerHTML = '';
                if (fresh.length) {
                    freshEmpty && (freshEmpty.style.display = 'none');
                    fresh.forEach((item) => freshGrid.appendChild(createCard(item)));
                } else {
                    freshEmpty && (freshEmpty.style.display = 'block');
                }
            }

            if (demoLink) {
                const demos = cleaned
                    .filter((item) => item.type === 'demo')
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                const latest = demos[0];
                if (latest) {
                    demoLink.href = `index_player.html?id=${latest.id}`;
                    if (demoVideo) {
                        demoVideo.src = latest.url;
                        if (latest.preview_url) {
                            demoVideo.poster = latest.preview_url;
                        }
                        demoVideo.load();
                        const playAttempt = demoVideo.play();
                        if (playAttempt && typeof playAttempt.catch === 'function') {
                            playAttempt.catch(() => {});
                        }
                    }
                    demoTitle && (demoTitle.textContent = latest.title);
                    demoSubtitle && (demoSubtitle.textContent = 'Самое свежее демо RiverDub');
                } else {
                    demoLink.href = 'index_videos.html';
                    if (demoVideo) {
                        demoVideo.pause();
                        demoVideo.removeAttribute('src');
                        demoVideo.load();
                        demoVideo.poster = '';
                    }
                    demoTitle && (demoTitle.textContent = 'Демо пока нет');
                    demoSubtitle && (demoSubtitle.textContent = 'Следите за обновлениями');
                }
            }

            if (bgVideo && bgWrapper) {
                const backgrounds = cleaned
                    .filter((item) => item.type === 'background')
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                const latestBg = backgrounds[0];
                if (latestBg) {
                    bgVideo.src = latestBg.url;
                    if (latestBg.preview_url) {
                        bgVideo.poster = latestBg.preview_url;
                    } else {
                        bgVideo.removeAttribute('poster');
                    }
                    bgVideo.load();
                    await settingsRequest;
                    applyBackground(true);
                } else {
                    await settingsRequest;
                    applyBackground(false);
                    bgVideo.pause();
                    bgVideo.removeAttribute('src');
                    bgVideo.load();
                }
            }
        });
})();
