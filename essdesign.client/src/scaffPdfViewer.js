import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

const viewer = document.getElementById('pdfViewer');

if (viewer) {
    const documentUrl = viewer.dataset.pdfUrl || '';
    const brandLogoUrl = viewer.dataset.loaderLogo || '';
    const brandName = viewer.dataset.loaderName || 'company';
    const pagesElement = document.getElementById('pdfPages');
    const loadingElement = document.getElementById('pdfLoading');
    const errorElement = document.getElementById('pdfError');
    const pageIndicator = document.getElementById('pdfPageIndicator');
    const zoomIndicator = document.getElementById('pdfZoomIndicator');
    const zoomOutButton = document.getElementById('pdfZoomOut');
    const zoomFitButton = document.getElementById('pdfZoomFit');
    const zoomInButton = document.getElementById('pdfZoomIn');
    const fitModeButton = document.getElementById('pdfFitMode');
    const rotateButton = document.getElementById('pdfRotate');

    let pdfDocument = null;
    let loadingTask = null;
    let zoom = 1;
    let fitMode = 'page';
    let userRotation = 0;
    let currentPageNumber = 1;
    let renderGeneration = 0;
    let resizeTimer = 0;
    let sharpRenderTimer = 0;
    let scrollFrame = 0;
    let geometryUpdateInProgress = false;
    let pinchState = null;
    let documentGeneration = 0;
    let resumeTimer = 0;
    const pageCache = new Map();
    const pageRenderTasks = new Map();

    const minimumZoom = 1;
    const maximumZoom = 5;
    const pageLoadTimeoutMs = 10000;
    const pageRenderTimeoutMs = 10000;
    const documentLoadTimeoutMs = 25000;
    const sharpCanvasPixelBudget = 8_000_000;
    const previewCanvasPixelBudget = 1_500_000;
    const maximumCanvasDimension = 4096;
    const canvasSentinel = [17, 19, 23, 255];
    const clampZoom = value => Math.min(maximumZoom, Math.max(minimumZoom, value));

    function waitFor(promise, timeoutMs, message, onTimeout = null) {
        let timeout = 0;
        const timeoutPromise = new Promise((_resolve, reject) => {
            timeout = window.setTimeout(() => {
                try {
                    onTimeout?.();
                } finally {
                    reject(new Error(message));
                }
            }, timeoutMs);
        });
        return Promise.race([promise, timeoutPromise])
            .finally(() => window.clearTimeout(timeout));
    }

    async function getPage(pageNumber) {
        if (!pageCache.has(pageNumber)) {
            pageCache.set(pageNumber, pdfDocument.getPage(pageNumber));
        }
        try {
            return await waitFor(
                pageCache.get(pageNumber),
                pageLoadTimeoutMs,
                `Timed out while loading PDF page ${pageNumber}.`,
            );
        } catch (error) {
            pageCache.delete(pageNumber);
            throw error;
        }
    }

    function isRenderCancellation(error) {
        return error?.name === 'RenderingCancelledException';
    }

    function cancelPageRender(pageNumber) {
        const activeRender = pageRenderTasks.get(pageNumber);
        if (!activeRender) return;
        pageRenderTasks.delete(pageNumber);
        try {
            activeRender.task.cancel();
        } catch {
            // PDF.js may already have completed the task between lookup and cancellation.
        }
        const canvas = activeRender.canvas;
        if (canvas && !canvas.isConnected) {
            canvas.width = 1;
            canvas.height = 1;
        }
    }

    function cancelAllPageRenders() {
        Array.from(pageRenderTasks.keys()).forEach(cancelPageRender);
    }

    function getPageMargins() {
        const tablet = viewer.clientWidth >= 700;
        return {
            horizontal: tablet ? 22 : 12,
            top: tablet ? 72 : 58,
            bottom: tablet ? 64 : 54,
        };
    }

    function getRenderPixelRatio(cssViewport, pixelBudget) {
        const deviceRatio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
        const dimensionLimit = Math.min(
            maximumCanvasDimension / Math.max(1, cssViewport.width),
            maximumCanvasDimension / Math.max(1, cssViewport.height),
        );
        const pixelLimit = Math.sqrt(
            pixelBudget / Math.max(1, cssViewport.width * cssViewport.height),
        );
        // Ratios below one are intentional at extreme zoom. They keep Safari below
        // its canvas backing-store limit while CSS still provides fluid pinch zoom.
        return Math.max(0.25, Math.min(deviceRatio, dimensionLimit, pixelLimit));
    }

    function updateControls() {
        zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
        zoomOutButton.disabled = zoom <= minimumZoom;
        zoomInButton.disabled = zoom >= maximumZoom;
        fitModeButton.textContent = fitMode === 'page' ? 'Page' : 'Width';
        fitModeButton.setAttribute(
            'aria-label',
            fitMode === 'page' ? 'Fit PDF to screen width' : 'Fit whole PDF page',
        );
        fitModeButton.title = fitMode === 'page' ? 'Fit width' : 'Fit page';
        viewer.classList.toggle('is-zoomed', zoom > 1.001);
        viewer.classList.toggle('is-fit-width', fitMode === 'width');
    }

    function markCurrentPage(pageNumber) {
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            slot.classList.toggle(
                'is-current-page',
                Number(slot.dataset.pageNumber) === pageNumber,
            );
        });
    }

    function clampToCurrentPage() {
        if (zoom <= 1.001 && !pinchState) return false;
        const slot = pagesElement.querySelector(`[data-page-number="${currentPageNumber}"]`);
        if (!slot) return true;
        const minimumTop = slot.offsetTop;
        const maximumTop = Math.max(minimumTop, slot.offsetTop + slot.offsetHeight - viewer.clientHeight);
        const clampedTop = Math.min(maximumTop, Math.max(minimumTop, viewer.scrollTop));
        if (Math.abs(clampedTop - viewer.scrollTop) > 0.5) {
            viewer.scrollTo({ left: viewer.scrollLeft, top: clampedTop, behavior: 'auto' });
        }
        return true;
    }

    function getSlotAtPoint(contentX, contentY) {
        const slots = Array.from(pagesElement.querySelectorAll('.pdf-page-slot'));
        return slots.find(slot => (
            contentY >= slot.offsetTop
            && contentY <= slot.offsetTop + slot.offsetHeight
            && contentX >= slot.offsetLeft
            && contentX <= slot.offsetLeft + slot.offsetWidth
        )) || slots.find(slot => Number(slot.dataset.pageNumber) === currentPageNumber) || slots[0];
    }

    function captureViewAnchor(clientX = viewer.clientWidth / 2, clientY = viewer.clientHeight / 2) {
        const contentX = viewer.scrollLeft + clientX;
        const contentY = viewer.scrollTop + clientY;
        const slot = getSlotAtPoint(contentX, contentY);
        if (!slot) return null;
        const canvas = slot.querySelector('.pdf-page');
        const anchor = {
            pageNumber: Number(slot.dataset.pageNumber) || currentPageNumber,
            xRatio: (contentX - slot.offsetLeft) / Math.max(1, slot.offsetWidth),
            yRatio: (contentY - slot.offsetTop) / Math.max(1, slot.offsetHeight),
            clientX,
            clientY,
        };
        if (canvas) {
            const pageLeft = slot.offsetLeft + canvas.offsetLeft;
            const pageTop = slot.offsetTop + canvas.offsetTop;
            anchor.pageXRatio = (contentX - pageLeft) / Math.max(1, canvas.offsetWidth);
            anchor.pageYRatio = (contentY - pageTop) / Math.max(1, canvas.offsetHeight);
        }
        return anchor;
    }

    function restoreViewAnchor(anchor) {
        const pageNumber = Math.min(
            Math.max(anchor?.pageNumber || currentPageNumber, 1),
            pdfDocument.numPages,
        );
        const slot = pagesElement.querySelector(`[data-page-number="${pageNumber}"]`);
        if (!slot) return;
        const clientX = Number.isFinite(anchor?.clientX) ? anchor.clientX : viewer.clientWidth / 2;
        const clientY = Number.isFinite(anchor?.clientY) ? anchor.clientY : viewer.clientHeight / 2;
        const canvas = slot.querySelector('.pdf-page');
        const hasPageAnchor = canvas
            && Number.isFinite(anchor?.pageXRatio)
            && Number.isFinite(anchor?.pageYRatio);
        const contentX = hasPageAnchor
            ? slot.offsetLeft + canvas.offsetLeft + (canvas.offsetWidth * anchor.pageXRatio)
            : slot.offsetLeft + (slot.offsetWidth * (Number.isFinite(anchor?.xRatio) ? anchor.xRatio : 0.5));
        const contentY = hasPageAnchor
            ? slot.offsetTop + canvas.offsetTop + (canvas.offsetHeight * anchor.pageYRatio)
            : slot.offsetTop + (slot.offsetHeight * (Number.isFinite(anchor?.yRatio) ? anchor.yRatio : 0.5));
        viewer.scrollTo({
            left: Math.max(0, contentX - clientX),
            top: Math.max(0, contentY - clientY),
            behavior: 'auto',
        });
    }

    function createPlaceholder(pageNumber) {
        const placeholder = document.createElement('div');
        placeholder.className = 'pdf-page-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.dataset.pageNumber = String(pageNumber);
        const loader = document.createElement('span');
        loader.className = 'brand-loader compact';
        const ring = document.createElement('span');
        ring.className = 'brand-loader-ring';
        const core = document.createElement('span');
        core.className = 'brand-loader-core';
        const logo = document.createElement('img');
        logo.className = 'brand-loader-logo';
        logo.src = brandLogoUrl;
        logo.alt = '';
        logo.setAttribute('aria-label', `${brandName} loading`);
        core.appendChild(logo);
        loader.append(ring, core);
        placeholder.appendChild(loader);
        return placeholder;
    }

    function disposeCanvas(canvas) {
        if (!canvas) return;
        // Explicitly release the backing store; waiting for GC is unreliable on iOS.
        canvas.width = 1;
        canvas.height = 1;
        canvas.remove();
    }

    function replaceSlotContents(slot, child) {
        slot.querySelectorAll('canvas.pdf-page').forEach(disposeCanvas);
        slot.replaceChildren(child);
    }

    function createPageFailure(pageNumber) {
        const failure = document.createElement('div');
        failure.className = 'pdf-page-failure';
        const message = document.createElement('span');
        message.textContent = 'Page preview paused';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Retry page';
        retry.addEventListener('click', () => {
            const slot = pagesElement.querySelector(`[data-page-number="${pageNumber}"]`);
            if (!slot) return;
            pageCache.delete(pageNumber);
            slot.dataset.renderState = 'idle';
            slot.dataset.renderSignature = '';
            slot.dataset.renderRequest = '';
            replaceSlotContents(slot, createPlaceholder(pageNumber));
            void renderPageCanvas(pageNumber, renderGeneration, 'sharp', 0);
        });
        failure.append(message, retry);
        return failure;
    }

    async function calculatePageLayout(page) {
        const margins = getPageMargins();
        const rotation = (page.rotate + userRotation + 360) % 360;
        const naturalViewport = page.getViewport({ scale: 1, rotation });
        const availableWidth = Math.max(80, viewer.clientWidth - (margins.horizontal * 2));
        const availableHeight = Math.max(120, viewer.clientHeight - margins.top - margins.bottom);
        const fitScale = fitMode === 'width'
            ? availableWidth / naturalViewport.width
            : Math.min(
                availableWidth / naturalViewport.width,
                availableHeight / naturalViewport.height,
            );
        const cssViewport = page.getViewport({ scale: fitScale * zoom, rotation });
        const baseViewport = page.getViewport({ scale: fitScale, rotation });
        return {
            baseViewport,
            cssViewport,
            margins,
            slotWidth: Math.max(
                viewer.clientWidth,
                Math.ceil(cssViewport.width + (margins.horizontal * 2)),
            ),
            slotHeight: Math.max(
                viewer.clientHeight,
                Math.ceil(cssViewport.height + margins.top + margins.bottom),
            ),
        };
    }

    function renderSignature(page, layout, quality) {
        const rotation = (page.rotate + userRotation + 360) % 360;
        return [
            quality,
            fitMode,
            rotation,
            zoom.toFixed(4),
            Math.round(layout.cssViewport.width),
            Math.round(layout.cssViewport.height),
            viewer.clientWidth,
            viewer.clientHeight,
        ].join(':');
    }

    function recoverLostCanvas(pageNumber, canvas) {
        window.setTimeout(() => {
            if (!canvas.isConnected || !pdfDocument) return;
            const slot = canvas.closest('.pdf-page-slot');
            if (!slot) return;
            cancelPageRender(pageNumber);
            slot.dataset.renderState = 'idle';
            slot.dataset.renderSignature = '';
            slot.dataset.renderRequest = '';
            replaceSlotContents(slot, createPlaceholder(pageNumber));
            if (pageNumber === currentPageNumber) {
                void renderPageCanvas(pageNumber, renderGeneration, 'sharp', 0);
            }
        }, 0);
    }

    function stampCanvas(canvas, context) {
        context.save();
        context.fillStyle = `rgb(${canvasSentinel[0]},${canvasSentinel[1]},${canvasSentinel[2]})`;
        context.fillRect(canvas.width - 1, canvas.height - 1, 1, 1);
        context.restore();
    }

    function canvasIsIntact(canvas) {
        try {
            const context = canvas.getContext('2d');
            if (!context || context.isContextLost?.()) return false;
            const pixel = context.getImageData(canvas.width - 1, canvas.height - 1, 1, 1).data;
            return canvasSentinel.every((value, index) => pixel[index] === value);
        } catch {
            return false;
        }
    }

    function scheduleCanvasIntegrityCheck(pageNumber, canvas, delay) {
        window.setTimeout(() => {
            if (!canvas.isConnected) return;
            if (!canvasIsIntact(canvas)) {
                recoverLostCanvas(pageNumber, canvas);
                return;
            }
            if (pageNumber === currentPageNumber) {
                scheduleCanvasIntegrityCheck(pageNumber, canvas, 3000);
            }
        }, delay);
    }

    async function renderPageCanvas(
        pageNumber,
        generation = renderGeneration,
        quality = 'sharp',
        attempt = 0,
    ) {
        if (generation !== renderGeneration || !pdfDocument) return;
        const slot = pagesElement.querySelector(`[data-page-number="${pageNumber}"]`);
        if (!slot) return;
        let ownedRenderTask = null;
        let ownedCanvas = null;
        let requestedSignature = '';

        try {
            const page = await getPage(pageNumber);
            if (generation !== renderGeneration || !slot.isConnected) return;
            const layout = await calculatePageLayout(page);
            const signature = renderSignature(page, layout, quality);
            requestedSignature = signature;
            if (slot.dataset.renderSignature === signature || slot.dataset.renderRequest === signature) return;
            cancelPageRender(pageNumber);
            const existingCanvas = slot.querySelector('.pdf-page');
            slot.dataset.renderRequest = signature;
            if (!existingCanvas) slot.dataset.renderState = 'rendering';
            const pixelBudget = quality === 'sharp'
                ? sharpCanvasPixelBudget
                : previewCanvasPixelBudget;
            const pixelRatio = getRenderPixelRatio(layout.cssViewport, pixelBudget);
            const rotation = (page.rotate + userRotation + 360) % 360;
            const renderViewport = page.getViewport({
                scale: layout.cssViewport.scale * pixelRatio,
                rotation,
            });
            const canvas = document.createElement('canvas');
            ownedCanvas = canvas;
            canvas.className = 'pdf-page';
            canvas.width = Math.max(1, Math.floor(renderViewport.width));
            canvas.height = Math.max(1, Math.floor(renderViewport.height));
            canvas.style.width = `${layout.cssViewport.width}px`;
            canvas.style.height = `${layout.cssViewport.height}px`;
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', `Rendered PDF page ${pageNumber}`);
            const context = canvas.getContext('2d', { alpha: false });
            if (!context) throw new Error(`Unable to create a canvas for PDF page ${pageNumber}.`);
            const renderTask = page.render({
                canvasContext: context,
                viewport: renderViewport,
                background: '#ffffff',
            });
            ownedRenderTask = renderTask;
            pageRenderTasks.set(pageNumber, { task: renderTask, canvas, signature });
            await waitFor(
                renderTask.promise,
                pageRenderTimeoutMs,
                `Timed out while rendering PDF page ${pageNumber}.`,
                () => renderTask.cancel(),
            );
            stampCanvas(canvas, context);
            const activeRender = pageRenderTasks.get(pageNumber);
            if (activeRender?.task === renderTask) pageRenderTasks.delete(pageNumber);
            if (pinchState && existingCanvas) {
                if (slot.dataset.renderRequest === signature) slot.dataset.renderRequest = '';
                disposeCanvas(canvas);
                return;
            }
            if (
                generation !== renderGeneration
                || !slot.isConnected
                || slot.dataset.renderRequest !== signature
            ) {
                disposeCanvas(canvas);
                return;
            }
            canvas.addEventListener('contextlost', event => {
                event.preventDefault();
                recoverLostCanvas(pageNumber, canvas);
            });
            slot.replaceChildren(canvas);
            disposeCanvas(existingCanvas);
            slot.dataset.renderState = 'rendered';
            slot.dataset.renderSignature = signature;
            slot.dataset.renderRequest = '';
            scheduleCanvasIntegrityCheck(pageNumber, canvas, 800);
        } catch (error) {
            const activeRender = pageRenderTasks.get(pageNumber);
            if (activeRender?.task === ownedRenderTask) {
                pageRenderTasks.delete(pageNumber);
            }
            if (ownedCanvas && !ownedCanvas.isConnected) disposeCanvas(ownedCanvas);
            if (generation !== renderGeneration || isRenderCancellation(error)) return;
            if (slot.dataset.renderRequest === requestedSignature) slot.dataset.renderRequest = '';
            if (attempt < 1 && slot.isConnected) {
                pageCache.delete(pageNumber);
                await new Promise(resolve => window.setTimeout(resolve, 180));
                if (generation === renderGeneration) {
                    return renderPageCanvas(pageNumber, generation, quality, attempt + 1);
                }
                return;
            }
            if (!slot.querySelector('.pdf-page')) {
                slot.dataset.renderState = 'error';
                replaceSlotContents(slot, createPageFailure(pageNumber));
            }
            console.error(`Unable to render PDF page ${pageNumber}:`, error);
        }
    }

    function releaseDistantPages(centerPage) {
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            const pageNumber = Number(slot.dataset.pageNumber);
            if (Math.abs(pageNumber - centerPage) <= 1 || slot.dataset.renderState !== 'rendered') return;
            cancelPageRender(pageNumber);
            replaceSlotContents(slot, createPlaceholder(pageNumber));
            slot.dataset.renderState = 'idle';
            slot.dataset.renderSignature = '';
            slot.dataset.renderRequest = '';
        });
    }

    async function renderVisiblePages(pageNumber, generation = renderGeneration) {
        await renderPageCanvas(pageNumber, generation, 'sharp');
        if (generation !== renderGeneration || pageNumber !== currentPageNumber) return;
        releaseDistantPages(pageNumber);
        [pageNumber - 1, pageNumber + 1]
            .filter(candidate => candidate >= 1 && candidate <= pdfDocument.numPages)
            .forEach(candidate => { void renderPageCanvas(candidate, generation, 'preview'); });
    }

    function updateCurrentPage() {
        scrollFrame = 0;
        if (!pdfDocument || geometryUpdateInProgress || pinchState) return;
        const slots = Array.from(pagesElement.querySelectorAll('.pdf-page-slot'));
        if (slots.length === 0) return;
        const viewerCenter = viewer.scrollTop + (viewer.clientHeight / 2);
        let closestPage = 1;
        let closestDistance = Number.POSITIVE_INFINITY;
        slots.forEach(slot => {
            const slotCenter = slot.offsetTop + (slot.offsetHeight / 2);
            const distance = Math.abs(slotCenter - viewerCenter);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestPage = Number(slot.dataset.pageNumber) || 1;
            }
        });
        pageIndicator.textContent = `${closestPage} / ${pdfDocument.numPages}`;
        if (closestPage !== currentPageNumber) {
            currentPageNumber = closestPage;
            markCurrentPage(closestPage);
            void renderVisiblePages(closestPage);
        }
    }

    async function renderPages({ preservePosition = true, anchor = null } = {}) {
        if (!pdfDocument) return;
        const generation = ++renderGeneration;
        cancelAllPageRenders();
        const savedAnchor = anchor || (preservePosition ? captureViewAnchor() : null);
        const targetPage = Math.min(
            Math.max(savedAnchor?.pageNumber || currentPageNumber, 1),
            pdfDocument.numPages,
        );

        loadingElement.hidden = false;
        errorElement.hidden = true;
        pagesElement.querySelectorAll('canvas.pdf-page').forEach(disposeCanvas);
        pagesElement.replaceChildren();
        pagesElement.setAttribute('aria-busy', 'true');

        try {
            for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
                if (generation !== renderGeneration) return;
                const page = await getPage(pageNumber);
                const layout = await calculatePageLayout(page);
                const slot = document.createElement('section');
                slot.className = 'pdf-page-slot';
                slot.dataset.pageNumber = String(pageNumber);
                slot.dataset.renderState = 'idle';
                slot.dataset.basePageWidth = String(layout.baseViewport.width);
                slot.dataset.basePageHeight = String(layout.baseViewport.height);
                slot.dataset.marginHorizontal = String(layout.margins.horizontal);
                slot.dataset.marginTop = String(layout.margins.top);
                slot.dataset.marginBottom = String(layout.margins.bottom);
                slot.setAttribute('aria-label', `Page ${pageNumber} of ${pdfDocument.numPages}`);
                slot.style.width = `${layout.slotWidth}px`;
                slot.style.height = `${layout.slotHeight}px`;
                slot.style.padding = `${layout.margins.top}px ${layout.margins.horizontal}px ${layout.margins.bottom}px`;
                slot.appendChild(createPlaceholder(pageNumber));
                pagesElement.appendChild(slot);
            }

            if (generation !== renderGeneration) return;
            currentPageNumber = targetPage;
            markCurrentPage(targetPage);
            restoreViewAnchor(savedAnchor || {
                pageNumber: targetPage,
                xRatio: 0.5,
                yRatio: 0.5,
                clientX: viewer.clientWidth / 2,
                clientY: viewer.clientHeight / 2,
            });
            pageIndicator.textContent = `${targetPage} / ${pdfDocument.numPages}`;
            updateControls();
            await renderVisiblePages(targetPage, generation);
            if (generation !== renderGeneration) return;
            restoreViewAnchor(savedAnchor);
            pagesElement.setAttribute('aria-busy', 'false');
            loadingElement.hidden = true;
        } catch (error) {
            if (generation !== renderGeneration) return;
            throw error;
        }
    }

    function scheduleSharpRender(delay = 140) {
        window.clearTimeout(sharpRenderTimer);
        sharpRenderTimer = window.setTimeout(() => {
            void renderVisiblePages(currentPageNumber);
        }, delay);
    }

    function applyZoomGeometry(nextZoom, anchor = null) {
        const normalizedZoom = clampZoom(nextZoom);
        if (!pdfDocument) return;
        if (Math.abs(normalizedZoom - zoom) < 0.001) {
            if (anchor) {
                restoreViewAnchor(anchor);
                clampToCurrentPage();
            }
            return;
        }
        const savedAnchor = anchor || captureViewAnchor();
        geometryUpdateInProgress = true;
        viewer.classList.add('is-adjusting');
        cancelAllPageRenders();
        zoom = normalizedZoom;
        updateControls();
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            const baseWidth = Number(slot.dataset.basePageWidth);
            const baseHeight = Number(slot.dataset.basePageHeight);
            const marginHorizontal = Number(slot.dataset.marginHorizontal);
            const marginTop = Number(slot.dataset.marginTop);
            const marginBottom = Number(slot.dataset.marginBottom);
            if (![baseWidth, baseHeight, marginHorizontal, marginTop, marginBottom].every(Number.isFinite)) return;
            const pageWidth = baseWidth * zoom;
            const pageHeight = baseHeight * zoom;
            slot.style.width = `${Math.max(viewer.clientWidth, Math.ceil(pageWidth + (marginHorizontal * 2)))}px`;
            slot.style.height = `${Math.max(viewer.clientHeight, Math.ceil(pageHeight + marginTop + marginBottom))}px`;
            const canvas = slot.querySelector('.pdf-page');
            if (canvas) {
                canvas.style.width = `${pageWidth}px`;
                canvas.style.height = `${pageHeight}px`;
            }
            slot.dataset.renderRequest = '';
        });
        if (savedAnchor?.pageNumber) currentPageNumber = savedAnchor.pageNumber;
        markCurrentPage(currentPageNumber);
        pageIndicator.textContent = `${currentPageNumber} / ${pdfDocument.numPages}`;
        restoreViewAnchor(savedAnchor);
        clampToCurrentPage();
        if (!pinchState) scheduleSharpRender();
        window.requestAnimationFrame(() => {
            geometryUpdateInProgress = false;
            viewer.classList.remove('is-adjusting');
        });
    }

    zoomOutButton.addEventListener('click', () => applyZoomGeometry(zoom - 0.25));
    zoomFitButton.addEventListener('click', () => applyZoomGeometry(1));
    zoomInButton.addEventListener('click', () => applyZoomGeometry(zoom + 0.25));
    fitModeButton.addEventListener('click', async () => {
        if (!pdfDocument) return;
        const anchor = captureViewAnchor();
        fitMode = fitMode === 'page' ? 'width' : 'page';
        zoom = 1;
        updateControls();
        await renderPages({ anchor });
    });
    rotateButton.addEventListener('click', async () => {
        if (!pdfDocument) return;
        const anchor = captureViewAnchor();
        userRotation = (userRotation + 90) % 360;
        zoom = 1;
        rotateButton.setAttribute('aria-label', `Rotate PDF clockwise. Current rotation ${userRotation} degrees`);
        await renderPages({ anchor });
    });

    viewer.addEventListener('scroll', () => {
        if (clampToCurrentPage()) return;
        if (scrollFrame) return;
        scrollFrame = window.requestAnimationFrame(updateCurrentPage);
    }, { passive: true });

    const touchDistance = touches => Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
    );

    function beginPinch(touches) {
        if (pinchState || touches.length < 2) return;
        const startDistance = touchDistance(touches);
        if (startDistance <= 0) return;
        window.clearTimeout(sharpRenderTimer);
        cancelAllPageRenders();
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            if (slot.querySelector('.pdf-page')) slot.dataset.renderRequest = '';
        });
        const bounds = viewer.getBoundingClientRect();
        const clientX = ((touches[0].clientX + touches[1].clientX) / 2) - bounds.left;
        const clientY = ((touches[0].clientY + touches[1].clientY) / 2) - bounds.top;
        pinchState = {
            startDistance,
            startZoom: zoom,
            draftZoom: zoom,
            anchor: captureViewAnchor(clientX, clientY),
        };
        viewer.classList.add('is-pinching');
    }

    function updatePinch(touches) {
        if (!pinchState || touches.length < 2) return;
        const distance = touchDistance(touches);
        pinchState.draftZoom = clampZoom(
            pinchState.startZoom * (distance / pinchState.startDistance),
        );
        const bounds = viewer.getBoundingClientRect();
        const clientX = ((touches[0].clientX + touches[1].clientX) / 2) - bounds.left;
        const clientY = ((touches[0].clientY + touches[1].clientY) / 2) - bounds.top;
        applyZoomGeometry(pinchState.draftZoom, {
            ...pinchState.anchor,
            clientX,
            clientY,
        });
    }

    function finishPinch() {
        if (!pinchState) return;
        pinchState = null;
        viewer.classList.remove('is-pinching');
        geometryUpdateInProgress = false;
        viewer.classList.remove('is-adjusting');
        updateControls();
        scheduleSharpRender(60);
    }

    document.addEventListener('touchstart', event => {
        if (event.touches.length < 2) return;
        event.preventDefault();
        beginPinch(event.touches);
    }, { passive: false, capture: true });

    document.addEventListener('touchmove', event => {
        if (event.touches.length < 2) return;
        event.preventDefault();
        if (!pinchState) beginPinch(event.touches);
        updatePinch(event.touches);
    }, { passive: false, capture: true });

    const endTouchGesture = event => {
        if (pinchState && event.touches.length < 2) finishPinch();
    };
    document.addEventListener('touchend', endTouchGesture, { capture: true });
    document.addEventListener('touchcancel', endTouchGesture, { capture: true });

    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        const anchor = captureViewAnchor();
        resizeTimer = window.setTimeout(() => renderPages({ anchor }), 180);
    });

    function resetNavigationState() {
        document.body.classList.remove('is-leaving-left', 'is-leaving-right');
        document.getElementById('navigationLoading')?.classList.remove('is-visible');
    }

    function invalidateRenderedCanvases() {
        if (!pdfDocument) return;
        cancelAllPageRenders();
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            const pageNumber = Number(slot.dataset.pageNumber);
            if (!slot.querySelector('.pdf-page')) return;
            replaceSlotContents(slot, createPlaceholder(pageNumber));
            slot.dataset.renderState = 'idle';
            slot.dataset.renderSignature = '';
            slot.dataset.renderRequest = '';
        });
        void renderVisiblePages(currentPageNumber);
    }

    function suspendDocument() {
        documentGeneration += 1;
        renderGeneration += 1;
        window.clearTimeout(sharpRenderTimer);
        window.clearTimeout(resizeTimer);
        window.clearTimeout(resumeTimer);
        cancelAllPageRenders();
        pageCache.clear();
        pagesElement.querySelectorAll('canvas.pdf-page').forEach(disposeCanvas);
        const task = loadingTask;
        loadingTask = null;
        pdfDocument = null;
        if (task) {
            void task.destroy().catch(() => {
                // Navigation teardown can race a worker that has already stopped.
            });
        }
    }

    async function loadDocument() {
        if (!documentUrl) throw new Error('No PDF URL was supplied.');
        const generation = ++documentGeneration;
        loadingElement.hidden = false;
        errorElement.hidden = true;
        const task = pdfjsLib.getDocument({
            url: documentUrl,
            disableAutoFetch: false,
            isEvalSupported: false,
        });
        loadingTask = task;
        const loadedDocument = await waitFor(
            task.promise,
            documentLoadTimeoutMs,
            'Timed out while opening this PDF.',
            () => {
                void task.destroy().catch(() => {
                    // The worker may already be stopping when the timeout wins.
                });
            },
        );
        if (generation !== documentGeneration) {
            void loadedDocument.destroy().catch(() => {
                // A superseded loading task may already have released its worker.
            });
            return;
        }
        pdfDocument = loadedDocument;
        pageIndicator.textContent = `1 / ${pdfDocument.numPages}`;
        await renderPages({ preservePosition: false });
    }

    window.addEventListener('pagehide', suspendDocument);
    window.addEventListener('pageshow', event => {
        resetNavigationState();
        if (!event.persisted) return;
        loadDocument().catch(error => {
            console.error('Unable to restore linked scaffold PDF:', error);
            loadingElement.hidden = true;
            errorElement.hidden = false;
        });
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        resetNavigationState();
        window.clearTimeout(resumeTimer);
        resumeTimer = window.setTimeout(() => {
            if (pdfDocument) invalidateRenderedCanvases();
        }, 120);
    });

    updateControls();
    resetNavigationState();
    loadDocument().catch(error => {
        console.error('Unable to render linked scaffold PDF:', error);
        loadingElement.hidden = true;
        errorElement.hidden = false;
    });
}
