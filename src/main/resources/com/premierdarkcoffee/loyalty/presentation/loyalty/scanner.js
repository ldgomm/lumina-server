'use strict';
(() => {
    let active = null;

    function stop() {
        const scan = active;
        if (!scan) return;
        active = null;
        clearTimeout(scan.timer);
        scan.stream?.getTracks().forEach(track => track.stop());
        scan.video.srcObject = null;
        scan.mount.replaceChildren();
        if (scan.trigger) {
            scan.trigger.disabled = false;
            scan.trigger.setAttribute('aria-expanded', 'false');
        }
    }
    function cameraMessage(error) {
        if (['NotAllowedError','SecurityError'].includes(error?.name)) return 'Permite el acceso a la cámara en los ajustes de este sitio o busca al cliente por cédula.';
        if (['NotFoundError','OverconstrainedError'].includes(error?.name)) return 'Este equipo no tiene una cámara disponible. Puedes usar la búsqueda manual.';
        if (['NotReadableError','AbortError'].includes(error?.name)) return 'La cámara está ocupada o se desconectó. Cierra la aplicación que la usa y vuelve a intentarlo.';
        return 'No pudimos iniciar la cámara. Vuelve a intentarlo o busca al cliente por cédula.';
    }
    window.stopComebackScanner = stop;
    window.startComebackScanner = async (mount, onCode, {trigger, manual} = {}) => {
        if (!mount?.isConnected || active?.mount === mount) return;
        stop();
        const video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.playsInline = true;
        video.setAttribute('aria-label', 'Vista de la cámara');
        const frame = document.createElement('div');
        frame.className = 'counter-camera-frame'; frame.hidden = true; frame.append(video);
        const hint = document.createElement('p'); hint.setAttribute('role', 'status');
        hint.textContent = 'Esperando permiso para abrir la cámara…';
        const cancel = document.createElement('button');
        cancel.type = 'button'; cancel.className = 'scan-close'; cancel.textContent = 'Cerrar cámara';
        cancel.onclick = () => { stop(); trigger?.focus(); };
        const scan = {mount, trigger, video, stream:null, timer:null};
        active = scan; mount.replaceChildren(hint, frame, cancel);
        if (trigger) { trigger.disabled = true; trigger.setAttribute('aria-expanded', 'true'); }
        cancel.focus({preventScroll:true});
        function fail(message) {
            if (active !== scan) return;
            stop();
            if (!mount.isConnected || document.hidden) return;
            const warning = document.createElement('div'); warning.className = 'counter-camera-help';
            const note = document.createElement('p'); note.setAttribute('role', 'alert'); note.textContent = message;
            warning.append(note);
            if (manual) {
                const fallback = document.createElement('button'); fallback.type = 'button'; fallback.textContent = 'Buscar por cédula';
                fallback.onclick = () => { mount.replaceChildren(); manual(); }; warning.append(fallback);
            }
            mount.replaceChildren(warning);
            trigger?.focus({preventScroll:true});
        }
        if (!window.isSecureContext) { fail('Abre Lúmina mediante HTTPS para usar la cámara. También puedes buscar por cédula.'); return; }
        if (!navigator.mediaDevices?.getUserMedia) { fail('Este navegador no ofrece acceso a la cámara. Busca al cliente por cédula o por nombre.'); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:'environment'}, width:{ideal:960}}});
            if (active !== scan || !mount.isConnected || document.hidden) {
                stream.getTracks().forEach(track => track.stop());
                if (active === scan) stop();
                return;
            }
            scan.stream = stream;
            for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => fail('La cámara se desconectó. Conéctala de nuevo o continúa por cédula.'), {once:true});
            video.srcObject = stream; frame.hidden = false;
            await video.play();
            if (active !== scan) return;
            hint.textContent = 'Centra el QR de la tarjeta en el recuadro.';
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', {willReadFrequently:true});
            const tick = () => {
                if (active !== scan) return;
                if (!mount.isConnected || document.hidden) { stop(); return; }
                try {
                    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
                        const scale = Math.min(1, 640 / video.videoWidth);
                        const width = Math.round(video.videoWidth * scale), height = Math.round(video.videoHeight * scale);
                        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
                        context.drawImage(video, 0, 0, width, height);
                        const pixels = context.getImageData(0, 0, width, height);
                        const result = window.jsQR(pixels.data, width, height, {inversionAttempts:'attemptBoth'});
                        if (result) {
                            if (/^[A-Za-z0-9_-]{43}$/.test(result.data)) { stop(); onCode(result.data); return; }
                            const message = 'Ese QR no corresponde a una tarjeta de cliente. Enfoca el QR que aparece en Wallet.';
                            if (hint.textContent !== message) hint.textContent = message;
                        }
                    }
                } catch { fail('No se pudo leer la imagen. Vuelve a abrir la cámara o usa la búsqueda manual.'); return; }
                scan.timer = setTimeout(tick, 180);
            };
            tick();
        } catch (issue) { fail(cameraMessage(issue)); }
    };
    new MutationObserver(() => { if (active && !active.mount.isConnected) stop(); }).observe(document.body, {childList:true, subtree:true});
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    window.addEventListener('pagehide', stop);
})();
