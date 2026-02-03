(() => {
    const form = document.querySelector('.search');
    if (!form) return;
    const input = form.querySelector('input');
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = input ? input.value.trim() : '';
        const query = value ? `?q=${encodeURIComponent(value)}` : '';
        window.location.href = `index_videos.html${query}`;
    });
})();
