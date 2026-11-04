'use strict';
(() => {
    let active = null;
    function stop() {
        const scan = active;
        active = null;
        if (!scan) return;
        clearTimeout(scan.timer);
        scan.stream?.getTracks().forEach(track => track.stop());
        scan.video.srcObject = null;
        scan.mount.replaceChildren();
    }
    window.stopComebackScanner = stop;
    window.startComebackScanner = async (mount, onCode) => {
        stop();
        if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) throw new Error('La cámara requiere HTTPS o localhost. También puedes usar un lector USB o buscar por cédula.');
        const video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.playsInline = true; video.className = 'qr';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cerrar cámara'; cancel.className = 'quiet'; cancel.onclick = stop;
        const hint = document.createElement('p'); hint.textContent = 'Enfoca el QR personal de Wallet. Las imágenes se procesan en este navegador.';
        mount.replaceChildren(hint, video, cancel);
        const scan = {mount, video, stream: null, timer: null}; active = scan;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 960}}});
            if (active !== scan || !mount.isConnected) { stream.getTracks().forEach(track => track.stop()); return; }
            scan.stream = stream; video.srcObject = stream; await video.play();
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', {willReadFrequently: true});
            const tick = () => {
                if (active !== scan) return;
                if (!mount.isConnected || document.hidden) { stop(); return; }
                try {
                    if (video.readyState >= 2 && video.videoWidth) {
                        const scale = Math.min(1, 640 / video.videoWidth);
                        canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
                        context.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
                        const result = window.jsQR(pixels.data, pixels.width, pixels.height, {inversionAttempts: 'attemptBoth'});
                        if (result) {
                            if (/^[A-Za-z0-9_-]{43}$/.test(result.data)) { stop(); onCode(result.data); return; }
                            hint.textContent = 'Ese QR no es una tarjeta personal de Loyalty. Enfoca el QR de Wallet.';
                        }
                    }
                } catch (_) { stop(); notice('No se pudo leer la cámara. Usa un lector USB o busca por cédula.'); return; }
                scan.timer = setTimeout(tick, 180);
            };
            tick();
        } catch (_) {
            if (active === scan) stop();
            throw new Error('No se pudo abrir la cámara. Comprueba el permiso del navegador o busca por cédula.');
        }
    };
    new MutationObserver(() => { if (active && !active.mount.isConnected) stop(); }).observe(document.body, {childList: true, subtree: true});
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    window.addEventListener('pagehide', stop);
})();
