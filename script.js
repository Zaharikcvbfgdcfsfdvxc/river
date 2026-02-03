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

    const setupAdminGate = () => {
        const adminLinks = Array.from(document.querySelectorAll('a[href="index_admin.html"]'));
        if (!adminLinks.length) return;
        if (document.getElementById('admin-auth')) return;
        if (document.getElementById('site-auth')) return;

        const overlay = document.createElement('div');
        overlay.className = 'admin-auth hidden';
        overlay.id = 'site-auth';
        overlay.innerHTML = `
            <div class="admin-auth-card">
                <button class="admin-auth-close" type="button" id="site-auth-close" aria-label="Закрыть">×</button>
                <p class="eyebrow">Доступ</p>
                <h2>Вход в админ-панель</h2>
                <p class="admin-lead">Введите логин и пароль, чтобы перейти в админку.</p>
                <form class="admin-form" id="site-auth-form">
                    <label>
                        Логин
                        <input type="text" name="login" autocomplete="username" required>
                    </label>
                    <label>
                        Пароль
                        <input type="password" name="password" autocomplete="current-password" required>
                    </label>
                    <button class="primary" type="submit">Войти</button>
                    <p class="admin-note" id="site-auth-error"></p>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);

        const closeBtn = overlay.querySelector('#site-auth-close');
        const authForm = overlay.querySelector('#site-auth-form');
        const authError = overlay.querySelector('#site-auth-error');

        const hide = () => {
            overlay.classList.add('hidden');
            document.body.classList.remove('locked');
            authError.textContent = '';
            authForm.reset();
        };

        const show = () => {
            overlay.classList.remove('hidden');
            document.body.classList.add('locked');
        };

        const openGate = () => {
            fetch('/api/me')
                .then((res) => {
                    if (res.ok) {
                        window.location.href = 'index_admin.html';
                        return;
                    }
                    show();
                })
                .catch(show);
        };

        adminLinks.forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                openGate();
            });
        });

        closeBtn.addEventListener('click', hide);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                hide();
            }
        });

        authForm.addEventListener('submit', (event) => {
            event.preventDefault();
            authError.textContent = '';
            const data = new FormData(authForm);
            const login = String(data.get('login') || '').trim();
            const password = String(data.get('password') || '').trim();
            fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, password })
            })
                .then((res) => {
                    if (!res.ok) {
                        throw new Error('invalid');
                    }
                    window.location.href = 'index_admin.html';
                })
                .catch(() => {
                    authError.textContent = 'Неверный логин или пароль.';
                });
        });
    };

    setupAdminGate();

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
