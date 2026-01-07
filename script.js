let canvas;
let images = [];
let firstImageFile = null;
let firstImageDataUrl = null;
const CANVAS_ASPECT_RATIO = 4 / 3; // 4:3 aspect ratio

// PDF.jsのワーカー設定
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// 1枚目の画像選択
document.getElementById('fileInput').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);

    if (files.length === 0) {
        return;
    }

    if (files.length >= 2) {
        // 2枚同時に選択された場合
        loadImages(files.slice(0, 2));
    } else {
        // 1枚だけ選択された場合
        firstImageFile = files[0];
        showPreview(firstImageFile);
    }
});

// 2枚目の画像選択
document.getElementById('fileInput2').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);

    if (files.length === 0) {
        return;
    }

    const secondImageFile = files[0];
    loadImages([firstImageFile, secondImageFile]);
});

function showPreview(file) {
    const isPDF = file.type === 'application/pdf';

    if (isPDF) {
        loadPDFAsImage(file).then(dataUrl => {
            firstImageDataUrl = dataUrl;
            displayPreview(dataUrl);
        });
    } else {
        const reader = new FileReader();
        reader.onload = function(event) {
            firstImageDataUrl = event.target.result;
            displayPreview(event.target.result);
        };
        reader.readAsDataURL(file);
    }
}

function displayPreview(dataUrl) {
    document.getElementById('initialScreen').classList.add('hidden');
    document.getElementById('previewScreen').classList.remove('hidden');
    document.getElementById('previewImage').src = dataUrl;
}

function loadImages(files) {
    const loadPromises = files.map(file => {
        return new Promise((resolve) => {
            const isPDF = file.type === 'application/pdf';

            if (isPDF) {
                loadPDFAsImage(file).then(imgUrl => {
                    fabric.Image.fromURL(imgUrl, function(img) {
                        resolve(img);
                    });
                });
            } else {
                const reader = new FileReader();
                reader.onload = function(event) {
                    fabric.Image.fromURL(event.target.result, function(img) {
                        resolve(img);
                    });
                };
                reader.readAsDataURL(file);
            }
        });
    });

    Promise.all(loadPromises).then(loadedImages => {
        images = loadedImages;
        initCanvas();
    });
}

function loadPDFAsImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const typedArray = new Uint8Array(event.target.result);

            pdfjsLib.getDocument(typedArray).promise.then(pdf => {
                pdf.getPage(1).then(page => {
                    const scale = 2;
                    const viewport = page.getViewport({ scale: scale });

                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };

                    page.render(renderContext).promise.then(() => {
                        resolve(canvas.toDataURL());
                    });
                });
            });
        };
        reader.readAsArrayBuffer(file);
    });
}

function calculateCanvasSize() {
    const canvasWrapper = document.querySelector('.canvas-wrapper');
    const wrapperRect = canvasWrapper.getBoundingClientRect();

    // canvas-wrapperのpaddingを考慮（2rem = 32px）
    const availableWidth = wrapperRect.width - 64;
    const availableHeight = wrapperRect.height - 64;

    let canvasWidth, canvasHeight;

    // アスペクト比を維持しながらサイズを計算
    if (availableWidth / availableHeight > CANVAS_ASPECT_RATIO) {
        // 高さに合わせる
        canvasHeight = availableHeight;
        canvasWidth = canvasHeight * CANVAS_ASPECT_RATIO;
    } else {
        // 幅に合わせる
        canvasWidth = availableWidth;
        canvasHeight = canvasWidth / CANVAS_ASPECT_RATIO;
    }

    return { width: canvasWidth, height: canvasHeight };
}

function initCanvas() {
    document.getElementById('initialScreen').classList.add('hidden');
    document.getElementById('previewScreen').classList.add('hidden');
    document.getElementById('editorScreen').classList.remove('hidden');

    const { width: canvasWidth, height: canvasHeight } = calculateCanvasSize();

    canvas = new fabric.Canvas('canvas', {
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: '#ffffff'
    });

    // 画像1: 幅50%とCanvas高さのうち、小さい方に合わせる
    const img1WidthScale = (canvasWidth * 0.5) / images[0].width;
    const img1HeightScale = canvasHeight / images[0].height;
    const img1Scale = Math.min(img1WidthScale, img1HeightScale);

    // 画像2: 幅50%とCanvas高さのうち、小さい方に合わせる
    const img2WidthScale = (canvasWidth * 0.5) / images[1].width;
    const img2HeightScale = canvasHeight / images[1].height;
    const img2Scale = Math.min(img2WidthScale, img2HeightScale);

    // スケール適用後の実際の幅を計算
    const img1ActualWidth = images[0].width * img1Scale;
    const img2ActualWidth = images[1].width * img2Scale;

    // 内側寄せ（画像同士がくっついている状態で中央配置）
    const totalWidth = img1ActualWidth + img2ActualWidth;
    const leftMargin = (canvasWidth - totalWidth) / 2;

    images[0].scale(img1Scale);
    images[0].set({
        left: leftMargin,
        top: 0,
        selectable: true,
        hasControls: true
    });

    images[1].scale(img2Scale);
    images[1].set({
        left: leftMargin + img1ActualWidth,
        top: 0,
        selectable: true,
        hasControls: true
    });

    canvas.add(images[0]);
    canvas.add(images[1]);

    canvas.renderAll();

    document.getElementById('downloadBtn').addEventListener('click', function() {
        canvas.discardActiveObject();
        canvas.renderAll();

        // すべての画像オブジェクトのバウンディングボックスを計算
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        canvas.getObjects().forEach(obj => {
            const bound = obj.getBoundingRect();
            minX = Math.min(minX, bound.left);
            minY = Math.min(minY, bound.top);
            maxX = Math.max(maxX, bound.left + bound.width);
            maxY = Math.max(maxY, bound.top + bound.height);
        });

        const cropWidth = maxX - minX;
        const cropHeight = maxY - minY;

        // 画像が存在する領域のみを高解像度でエクスポート（4倍の解像度）
        const dataURL = canvas.toDataURL({
            format: 'png',
            quality: 1,
            multiplier: 4,
            left: minX,
            top: minY,
            width: cropWidth,
            height: cropHeight
        });

        const link = document.createElement('a');
        link.download = 'connected-image.png';
        link.href = dataURL;
        link.click();
    });
}
