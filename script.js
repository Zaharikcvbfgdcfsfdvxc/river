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
    if (!freshGrid) return;

    const typeLabels = {
        video: 'Видео',
        demo: 'Демо-ролик'
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

    fetch('/api/videos')
        .then((res) => res.ok ? res.json() : [])
        .then((videos) => {
            const cleaned = videos.filter((item) => item.type !== 'interview');
            const fresh = cleaned.slice(0, 4);

            const freshEmpty = document.getElementById('home-fresh-empty');

            if (freshGrid) {
                freshGrid.innerHTML = '';
                if (fresh.length) {
                    freshEmpty && (freshEmpty.style.display = 'none');
                    fresh.forEach((item) => freshGrid.appendChild(createCard(item)));
                } else {
                    freshEmpty && (freshEmpty.style.display = 'block');
                }
            }
        });
})();
