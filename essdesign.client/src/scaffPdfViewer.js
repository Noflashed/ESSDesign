const viewer = document.getElementById('pdfViewer');

if (viewer) {
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
    const previewBase = `${window.location.pathname.replace(/\/$/, '')}/preview`;

    let documentInfo = null;
    let zoom = 1;
    let fitMode = 'page';
    let userRotation = 0;
    let currentPageNumber = 1;
    let renderGeneration = 0;
    let resizeTimer = 0;
    let detailRenderTimer = 0;
    let scrollFrame = 0;
    let geometryUpdateInProgress = false;
    let pinchState = null;
    let pinchFrame = 0;
    let suspended = false;

    const minimumZoom = 1;
    const maximumZoom = 5;
    const pageImageTimeoutMs = 45000;
    const qualityRank = { preview: 1, detail: 2, zoom: 3 };
    const highResolutionZoomThreshold = 1.5;
    const clampZoom = value => Math.min(maximumZoom, Math.max(minimumZoom, value));

    function getPage(pageNumber) {
        return documentInfo?.pages?.[pageNumber - 1] || null;
    }

    function getPageMargins() {
        const tablet = viewer.clientWidth >= 700;
        return {
            horizontal: tablet ? 22 : 12,
            top: tablet ? 72 : 58,
            bottom: tablet ? 64 : 54,
        };
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
        const image = slot.querySelector('.pdf-page');
        const anchor = {
            pageNumber: Number(slot.dataset.pageNumber) || currentPageNumber,
            xRatio: (contentX - slot.offsetLeft) / Math.max(1, slot.offsetWidth),
            yRatio: (contentY - slot.offsetTop) / Math.max(1, slot.offsetHeight),
            clientX,
            clientY,
        };
        if (image) {
            const bounds = image.getBoundingClientRect();
            const viewerBounds = viewer.getBoundingClientRect();
            const pageLeft = viewer.scrollLeft + bounds.left - viewerBounds.left;
            const pageTop = viewer.scrollTop + bounds.top - viewerBounds.top;
            anchor.pageXRatio = (contentX - pageLeft) / Math.max(1, bounds.width);
            anchor.pageYRatio = (contentY - pageTop) / Math.max(1, bounds.height);
        }
        return anchor;
    }

    function restoreViewAnchor(anchor) {
        const pageNumber = Math.min(
            Math.max(anchor?.pageNumber || currentPageNumber, 1),
            documentInfo?.pageCount || 1,
        );
        const slot = pagesElement.querySelector(`[data-page-number="${pageNumber}"]`);
        if (!slot) return;
        const clientX = Number.isFinite(anchor?.clientX) ? anchor.clientX : viewer.clientWidth / 2;
        const clientY = Number.isFinite(anchor?.clientY) ? anchor.clientY : viewer.clientHeight / 2;
        const image = slot.querySelector('.pdf-page');
        const hasPageAnchor = image
            && Number.isFinite(anchor?.pageXRatio)
            && Number.isFinite(anchor?.pageYRatio);
        let contentX;
        let contentY;
        if (hasPageAnchor) {
            const bounds = image.getBoundingClientRect();
            const viewerBounds = viewer.getBoundingClientRect();
            const pageLeft = viewer.scrollLeft + bounds.left - viewerBounds.left;
            const pageTop = viewer.scrollTop + bounds.top - viewerBounds.top;
            contentX = pageLeft + (bounds.width * anchor.pageXRatio);
            contentY = pageTop + (bounds.height * anchor.pageYRatio);
        } else {
            contentX = slot.offsetLeft + (slot.offsetWidth * (Number.isFinite(anchor?.xRatio) ? anchor.xRatio : 0.5));
            contentY = slot.offsetTop + (slot.offsetHeight * (Number.isFinite(anchor?.yRatio) ? anchor.yRatio : 0.5));
        }
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

    function disposeImage(image) {
        if (!image) return;
        image.onload = null;
        image.onerror = null;
        image.removeAttribute('src');
        image.remove();
    }

    function cancelSlotRequest(slot) {
        const requestImage = slot?._requestImage;
        if (!requestImage) return;
        slot._requestId = (slot._requestId || 0) + 1;
        slot._requestImage = null;
        slot._requestPromise = null;
        disposeImage(requestImage);
        slot.dataset.renderRequest = '';
    }

    function replaceSlotContents(slot, child) {
        cancelSlotRequest(slot);
        slot.querySelectorAll('img.pdf-page').forEach(disposeImage);
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
            slot.dataset.renderState = 'idle';
            slot.dataset.imageQuality = '';
            slot.dataset.renderRequest = '';
            replaceSlotContents(slot, createPlaceholder(pageNumber));
            void renderPageImage(pageNumber, renderGeneration, 'preview');
        });
        failure.append(message, retry);
        return failure;
    }

    function calculatePageLayout(page) {
        const margins = getPageMargins();
        const quarterTurn = userRotation % 180 !== 0;
        const rotatedWidth = quarterTurn ? page.height : page.width;
        const rotatedHeight = quarterTurn ? page.width : page.height;
        const availableWidth = Math.max(80, viewer.clientWidth - (margins.horizontal * 2));
        const availableHeight = Math.max(120, viewer.clientHeight - margins.top - margins.bottom);
        const fitScale = fitMode === 'width'
            ? availableWidth / rotatedWidth
            : Math.min(availableWidth / rotatedWidth, availableHeight / rotatedHeight);
        const basePageWidth = rotatedWidth * fitScale;
        const basePageHeight = rotatedHeight * fitScale;
        const baseImageWidth = page.width * fitScale;
        const baseImageHeight = page.height * fitScale;
        const pageWidth = basePageWidth * zoom;
        const pageHeight = basePageHeight * zoom;
        return {
            margins,
            basePageWidth,
            basePageHeight,
            baseImageWidth,
            baseImageHeight,
            pageWidth,
            pageHeight,
            imageWidth: baseImageWidth * zoom,
            imageHeight: baseImageHeight * zoom,
            slotWidth: Math.max(
                viewer.clientWidth,
                Math.ceil(pageWidth + (margins.horizontal * 2)),
            ),
            slotHeight: Math.max(
                viewer.clientHeight,
                Math.ceil(pageHeight + margins.top + margins.bottom),
            ),
        };
    }

    function applyImageGeometry(image, slot) {
        if (!image || !slot) return;
        const baseImageWidth = Number(slot.dataset.baseImageWidth);
        const baseImageHeight = Number(slot.dataset.baseImageHeight);
        if (!Number.isFinite(baseImageWidth) || !Number.isFinite(baseImageHeight)) return;
        image.style.width = `${baseImageWidth * zoom}px`;
        image.style.height = `${baseImageHeight * zoom}px`;
        image.style.maxWidth = 'none';
        image.style.maxHeight = 'none';
        image.style.transform = `rotate(${userRotation}deg)`;
        image.style.transformOrigin = 'center center';
    }

    function updateSlotGeometry(slot, page) {
        const layout = calculatePageLayout(page);
        slot.dataset.basePageWidth = String(layout.basePageWidth);
        slot.dataset.basePageHeight = String(layout.basePageHeight);
        slot.dataset.baseImageWidth = String(layout.baseImageWidth);
        slot.dataset.baseImageHeight = String(layout.baseImageHeight);
        slot.dataset.marginHorizontal = String(layout.margins.horizontal);
        slot.dataset.marginTop = String(layout.margins.top);
        slot.dataset.marginBottom = String(layout.margins.bottom);
        slot.style.width = `${layout.slotWidth}px`;
        slot.style.height = `${layout.slotHeight}px`;
        slot.style.padding = `${layout.margins.top}px ${layout.margins.horizontal}px ${layout.margins.bottom}px`;
        applyImageGeometry(slot.querySelector('.pdf-page'), slot);
    }

    function pageImageUrl(pageNumber, quality) {
        return `${previewBase}/pages/${pageNumber}.webp?quality=${quality}`;
    }

    function renderPageImage(pageNumber, generation = renderGeneration, quality = 'detail') {
        if (generation !== renderGeneration || !documentInfo || suspended) return Promise.resolve(null);
        const slot = pagesElement.querySelector(`[data-page-number="${pageNumber}"]`);
        const page = getPage(pageNumber);
        if (!slot || !page) return Promise.resolve(null);

        const existingImage = slot.querySelector('img.pdf-page');
        const existingQuality = slot.dataset.imageQuality || '';
        if (existingImage && qualityRank[existingQuality] >= qualityRank[quality]) {
            applyImageGeometry(existingImage, slot);
            return Promise.resolve(existingImage);
        }
        if (slot.dataset.renderRequest === quality && slot._requestPromise) {
            return slot._requestPromise;
        }

        cancelSlotRequest(slot);
        const requestId = (slot._requestId || 0) + 1;
        slot._requestId = requestId;
        slot.dataset.renderRequest = quality;
        if (!existingImage) slot.dataset.renderState = 'rendering';

        const image = new Image();
        image.className = 'pdf-page';
        image.alt = `Rendered PDF page ${pageNumber}`;
        image.draggable = false;
        image.decoding = 'async';
        image.dataset.quality = quality;
        slot._requestImage = image;

        slot._requestPromise = new Promise((resolve, reject) => {
            let timeout = window.setTimeout(() => {
                timeout = 0;
                if (slot._requestId !== requestId) return;
                cancelSlotRequest(slot);
                if (!slot.querySelector('.pdf-page')) {
                    slot.dataset.renderState = 'error';
                    slot.replaceChildren(createPageFailure(pageNumber));
                }
                reject(new Error(`Timed out while preparing PDF page ${pageNumber}.`));
            }, pageImageTimeoutMs);

            image.onload = () => {
                if (timeout) window.clearTimeout(timeout);
                if (
                    generation !== renderGeneration
                    || slot._requestId !== requestId
                    || !slot.isConnected
                    || suspended
                ) {
                    disposeImage(image);
                    resolve(null);
                    return;
                }
                slot._requestImage = null;
                slot._requestPromise = null;
                slot.dataset.renderRequest = '';
                applyImageGeometry(image, slot);
                const previousImage = slot.querySelector('img.pdf-page');
                slot.replaceChildren(image);
                disposeImage(previousImage);
                slot.dataset.renderState = 'rendered';
                slot.dataset.imageQuality = quality;
                resolve(image);
            };

            image.onerror = () => {
                if (timeout) window.clearTimeout(timeout);
                if (slot._requestId !== requestId) {
                    resolve(null);
                    return;
                }
                slot._requestImage = null;
                slot._requestPromise = null;
                slot.dataset.renderRequest = '';
                disposeImage(image);
                if (!slot.querySelector('.pdf-page')) {
                    slot.dataset.renderState = 'error';
                    slot.replaceChildren(createPageFailure(pageNumber));
                }
                reject(new Error(`Unable to prepare PDF page ${pageNumber}.`));
            };

            image.src = pageImageUrl(pageNumber, quality);
        });

        return slot._requestPromise;
    }

    function releasePage(slot) {
        const pageNumber = Number(slot.dataset.pageNumber);
        replaceSlotContents(slot, createPlaceholder(pageNumber));
        slot.dataset.renderState = 'idle';
        slot.dataset.imageQuality = '';
        slot.dataset.renderRequest = '';
    }

    function releaseDistantPages(centerPage) {
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            const pageNumber = Number(slot.dataset.pageNumber);
            if (Math.abs(pageNumber - centerPage) <= 1) return;
            releasePage(slot);
        });
    }

    function downgradeAdjacentDetailPages(centerPage) {
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            const pageNumber = Number(slot.dataset.pageNumber);
            if (pageNumber === centerPage || Math.abs(pageNumber - centerPage) > 1) return;
            if ((qualityRank[slot.dataset.imageQuality] || 0) <= qualityRank.preview) return;
            releasePage(slot);
        });
    }

    function scheduleDetailRender(delay = 180) {
        window.clearTimeout(detailRenderTimer);
        detailRenderTimer = window.setTimeout(() => {
            if (!pinchState && !geometryUpdateInProgress) {
                const quality = zoom >= highResolutionZoomThreshold ? 'zoom' : 'detail';
                void renderPageImage(currentPageNumber, renderGeneration, quality)
                    .catch(error => console.warn('Detailed PDF page unavailable:', error));
            }
        }, delay);
    }

    async function renderVisiblePages(pageNumber, generation = renderGeneration) {
        await renderPageImage(pageNumber, generation, 'preview');
        if (generation !== renderGeneration || pageNumber !== currentPageNumber) return;
        releaseDistantPages(pageNumber);
        downgradeAdjacentDetailPages(pageNumber);
        [pageNumber - 1, pageNumber + 1]
            .filter(candidate => candidate >= 1 && candidate <= documentInfo.pageCount)
            .forEach(candidate => {
                void renderPageImage(candidate, generation, 'preview')
                    .catch(error => console.warn(`Adjacent PDF page ${candidate} unavailable:`, error));
            });
        scheduleDetailRender();
    }

    function updateCurrentPage() {
        scrollFrame = 0;
        if (!documentInfo || geometryUpdateInProgress || pinchState) return;
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
        pageIndicator.textContent = `${closestPage} / ${documentInfo.pageCount}`;
        if (closestPage !== currentPageNumber) {
            currentPageNumber = closestPage;
            markCurrentPage(closestPage);
            void renderVisiblePages(closestPage);
        }
    }

    async function renderPages({ preservePosition = true, anchor = null } = {}) {
        if (!documentInfo) return;
        const generation = ++renderGeneration;
        window.clearTimeout(detailRenderTimer);
        const savedAnchor = anchor || (preservePosition ? captureViewAnchor() : null);
        const targetPage = Math.min(
            Math.max(savedAnchor?.pageNumber || currentPageNumber, 1),
            documentInfo.pageCount,
        );

        loadingElement.hidden = false;
        errorElement.hidden = true;
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            cancelSlotRequest(slot);
            slot.querySelectorAll('img.pdf-page').forEach(disposeImage);
        });
        pagesElement.replaceChildren();
        pagesElement.setAttribute('aria-busy', 'true');

        documentInfo.pages.forEach((page, index) => {
            const pageNumber = index + 1;
            const slot = document.createElement('section');
            slot.className = 'pdf-page-slot';
            slot.dataset.pageNumber = String(pageNumber);
            slot.dataset.renderState = 'idle';
            slot.dataset.imageQuality = '';
            slot.dataset.renderRequest = '';
            slot._requestId = 0;
            slot.setAttribute('aria-label', `Page ${pageNumber} of ${documentInfo.pageCount}`);
            updateSlotGeometry(slot, page);
            slot.appendChild(createPlaceholder(pageNumber));
            pagesElement.appendChild(slot);
        });

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
        pageIndicator.textContent = `${targetPage} / ${documentInfo.pageCount}`;
        updateControls();
        await renderVisiblePages(targetPage, generation);
        if (generation !== renderGeneration) return;
        restoreViewAnchor(savedAnchor);
        pagesElement.setAttribute('aria-busy', 'false');
        loadingElement.hidden = true;
    }

    function applyZoomGeometry(nextZoom, anchor = null) {
        const normalizedZoom = clampZoom(nextZoom);
        if (!documentInfo) return;
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
        zoom = normalizedZoom;
        updateControls();
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            const basePageWidth = Number(slot.dataset.basePageWidth);
            const basePageHeight = Number(slot.dataset.basePageHeight);
            const baseImageWidth = Number(slot.dataset.baseImageWidth);
            const baseImageHeight = Number(slot.dataset.baseImageHeight);
            const marginHorizontal = Number(slot.dataset.marginHorizontal);
            const marginTop = Number(slot.dataset.marginTop);
            const marginBottom = Number(slot.dataset.marginBottom);
            if (![basePageWidth, basePageHeight, baseImageWidth, baseImageHeight, marginHorizontal, marginTop, marginBottom].every(Number.isFinite)) return;
            slot.style.width = `${Math.max(viewer.clientWidth, Math.ceil((basePageWidth * zoom) + (marginHorizontal * 2)))}px`;
            slot.style.height = `${Math.max(viewer.clientHeight, Math.ceil((basePageHeight * zoom) + marginTop + marginBottom))}px`;
            const image = slot.querySelector('.pdf-page');
            if (image) {
                image.style.width = `${baseImageWidth * zoom}px`;
                image.style.height = `${baseImageHeight * zoom}px`;
            }
        });
        if (savedAnchor?.pageNumber) currentPageNumber = savedAnchor.pageNumber;
        markCurrentPage(currentPageNumber);
        pageIndicator.textContent = `${currentPageNumber} / ${documentInfo.pageCount}`;
        restoreViewAnchor(savedAnchor);
        clampToCurrentPage();
        if (!pinchState) scheduleDetailRender();
        window.requestAnimationFrame(() => {
            geometryUpdateInProgress = false;
            viewer.classList.remove('is-adjusting');
        });
    }

    zoomOutButton.addEventListener('click', () => applyZoomGeometry(zoom - 0.25));
    zoomFitButton.addEventListener('click', () => applyZoomGeometry(1));
    zoomInButton.addEventListener('click', () => applyZoomGeometry(zoom + 0.25));
    fitModeButton.addEventListener('click', async () => {
        if (!documentInfo) return;
        const anchor = captureViewAnchor();
        fitMode = fitMode === 'page' ? 'width' : 'page';
        zoom = 1;
        updateControls();
        await renderPages({ anchor });
    });
    rotateButton.addEventListener('click', async () => {
        if (!documentInfo) return;
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
        window.clearTimeout(detailRenderTimer);
        const bounds = viewer.getBoundingClientRect();
        const clientX = ((touches[0].clientX + touches[1].clientX) / 2) - bounds.left;
        const clientY = ((touches[0].clientY + touches[1].clientY) / 2) - bounds.top;
        const slot = pagesElement.querySelector(`[data-page-number="${currentPageNumber}"]`);
        if (slot) cancelSlotRequest(slot);
        const image = slot?.querySelector('.pdf-page') || null;
        pinchState = {
            startDistance,
            startZoom: zoom,
            draftZoom: zoom,
            startClientX: clientX,
            startClientY: clientY,
            clientX,
            clientY,
            image,
            anchor: captureViewAnchor(clientX, clientY),
        };
        if (image) image.style.willChange = 'transform';
        viewer.classList.add('is-pinching');
    }

    function applyPinchPreview() {
        pinchFrame = 0;
        if (!pinchState?.image?.isConnected) return;
        const relativeScale = pinchState.draftZoom / pinchState.startZoom;
        const translateX = pinchState.clientX - pinchState.startClientX;
        const translateY = pinchState.clientY - pinchState.startClientY;
        pinchState.image.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) rotate(${userRotation}deg) scale(${relativeScale})`;
        pinchState.image.style.transformOrigin = 'center center';
        zoomIndicator.textContent = `${Math.round(pinchState.draftZoom * 100)}%`;
    }

    function updatePinch(touches) {
        if (!pinchState || touches.length < 2) return;
        const distance = touchDistance(touches);
        pinchState.draftZoom = clampZoom(
            pinchState.startZoom * (distance / pinchState.startDistance),
        );
        const bounds = viewer.getBoundingClientRect();
        pinchState.clientX = ((touches[0].clientX + touches[1].clientX) / 2) - bounds.left;
        pinchState.clientY = ((touches[0].clientY + touches[1].clientY) / 2) - bounds.top;
        if (!pinchFrame) pinchFrame = window.requestAnimationFrame(applyPinchPreview);
    }

    function finishPinch() {
        if (!pinchState) return;
        const completedPinch = pinchState;
        if (pinchFrame) window.cancelAnimationFrame(pinchFrame);
        pinchFrame = 0;
        if (completedPinch.image) {
            completedPinch.image.style.transform = `rotate(${userRotation}deg)`;
            completedPinch.image.style.transformOrigin = 'center center';
            completedPinch.image.style.willChange = '';
        }
        pinchState = null;
        viewer.classList.remove('is-pinching');
        geometryUpdateInProgress = false;
        viewer.classList.remove('is-adjusting');
        applyZoomGeometry(completedPinch.draftZoom, {
            ...completedPinch.anchor,
            clientX: completedPinch.clientX,
            clientY: completedPinch.clientY,
        });
        scheduleDetailRender(80);
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
        if (pinchState) return;
        window.clearTimeout(resizeTimer);
        const anchor = captureViewAnchor();
        resizeTimer = window.setTimeout(() => renderPages({ anchor }), 180);
    });

    function resetNavigationState() {
        document.body.classList.remove('is-leaving-left', 'is-leaving-right');
        document.getElementById('navigationLoading')?.classList.remove('is-visible');
    }

    function suspendDocument() {
        if (pinchState) finishPinch();
        suspended = true;
        renderGeneration += 1;
        window.clearTimeout(detailRenderTimer);
        window.clearTimeout(resizeTimer);
        pagesElement.querySelectorAll('.pdf-page-slot').forEach(slot => {
            cancelSlotRequest(slot);
            slot.querySelectorAll('img.pdf-page').forEach(disposeImage);
        });
    }

    async function loadDocument() {
        suspended = false;
        loadingElement.hidden = false;
        errorElement.hidden = true;
        const response = await fetch(previewBase, {
            cache: 'no-store',
            credentials: 'same-origin',
        });
        if (!response.ok) {
            throw new Error(`PDF preview request failed (${response.status}).`);
        }
        const manifest = await response.json();
        if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
            throw new Error('This PDF has no previewable pages.');
        }
        documentInfo = {
            pageCount: manifest.pages.length,
            pages: manifest.pages.map(page => ({
                width: Math.max(1, Number(page.width) || 1),
                height: Math.max(1, Number(page.height) || 1),
            })),
        };
        pageIndicator.textContent = `1 / ${documentInfo.pageCount}`;
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
        if (documentInfo && !pinchState) {
            releaseDistantPages(currentPageNumber);
        }
    });

    updateControls();
    resetNavigationState();
    loadDocument().catch(error => {
        console.error('Unable to render linked scaffold PDF:', error);
        loadingElement.hidden = true;
        errorElement.hidden = false;
    });
}
