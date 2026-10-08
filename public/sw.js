importScripts('/uv/uv.bundle.js', '/uv/uv.config.js', '/uv/uv.sw.js');

self.addEventListener('fetch', async (event) => {
    const { request } = event;

    const handleRequest = async () => {
        if (uv.route(event)) {
            return await uv.fetch(event);
        }
        return await fetch(request);
    };

    event.respondWith(handleRequest());
});

const uv = new UVServiceWorker();
