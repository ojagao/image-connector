let stage;
let layer;
let images = [];
let firstImageFile = null;
let firstImageDataUrl = null;
const CANVAS_ASPECT_RATIO = 4 / 3; // 4:3 aspect ratio
const GRID_SIZE = 50; // グリッドのサイズ（ピクセル）
const SNAP_THRESHOLD = 10; // スナップ距離

// PDF.jsのワーカー設定
if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// 1枚目の画像選択
document.getElementById("fileInput").addEventListener("change", function (e) {
  const files = Array.from(e.target.files);

  if (files.length === 0) {
    return;
  }

  if (files.length >= 2) {
    loadImages(files.slice(0, 2));
  } else {
    firstImageFile = files[0];
    showPreview(firstImageFile);
  }
});

// 2枚目の画像選択
document.getElementById("fileInput2").addEventListener("change", function (e) {
  const files = Array.from(e.target.files);

  if (files.length === 0) {
    return;
  }

  const secondImageFile = files[0];
  loadImages([firstImageFile, secondImageFile]);
});

function showPreview(file) {
  const isPDF = file.type === "application/pdf";

  if (isPDF) {
    loadPDFAsImage(file).then((dataUrl) => {
      firstImageDataUrl = dataUrl;
      displayPreview(dataUrl);
    });
  } else {
    const reader = new FileReader();
    reader.onload = function (event) {
      firstImageDataUrl = event.target.result;
      displayPreview(event.target.result);
    };
    reader.readAsDataURL(file);
  }
}

function displayPreview(dataUrl) {
  document.getElementById("initialScreen").classList.add("hidden");
  document.getElementById("previewScreen").classList.remove("hidden");
  document.getElementById("previewImage").src = dataUrl;
}

function loadImages(files) {
  const loadPromises = files.map((file) => {
    return new Promise((resolve) => {
      const isPDF = file.type === "application/pdf";

      if (isPDF) {
        loadPDFAsImage(file).then((imgUrl) => {
          resolve(imgUrl);
        });
      } else {
        const reader = new FileReader();
        reader.onload = function (event) {
          resolve(event.target.result);
        };
        reader.readAsDataURL(file);
      }
    });
  });

  Promise.all(loadPromises).then((loadedImageUrls) => {
    initCanvas(loadedImageUrls);
  });
}

function loadPDFAsImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function (event) {
      const typedArray = new Uint8Array(event.target.result);

      pdfjsLib.getDocument(typedArray).promise.then((pdf) => {
        pdf.getPage(1).then((page) => {
          const scale = 2;
          const viewport = page.getViewport({ scale: scale });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
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
  const canvasWrapper = document.querySelector(".canvas-wrapper");
  const wrapperRect = canvasWrapper.getBoundingClientRect();

  const availableWidth = wrapperRect.width - 64;
  const availableHeight = wrapperRect.height - 64;

  let canvasWidth, canvasHeight;

  if (availableWidth / availableHeight > CANVAS_ASPECT_RATIO) {
    canvasHeight = availableHeight;
    canvasWidth = canvasHeight * CANVAS_ASPECT_RATIO;
  } else {
    canvasWidth = availableWidth;
    canvasHeight = canvasWidth / CANVAS_ASPECT_RATIO;
  }

  return { width: canvasWidth, height: canvasHeight };
}

function initCanvas(imageUrls) {
  document.getElementById("initialScreen").classList.add("hidden");
  document.getElementById("previewScreen").classList.add("hidden");
  document.getElementById("editorScreen").classList.remove("hidden");

  const { width: canvasWidth, height: canvasHeight } = calculateCanvasSize();

  // Konva Stageを作成
  stage = new Konva.Stage({
    container: "canvasContainer",
    width: canvasWidth,
    height: canvasHeight,
  });

  // グリッドレイヤー
  const gridLayer = new Konva.Layer();
  drawGrid(gridLayer, canvasWidth, canvasHeight);
  stage.add(gridLayer);

  // ガイドラインレイヤー（スナップ時に表示）
  const guideLayer = new Konva.Layer();
  stage.add(guideLayer);

  // 画像レイヤー
  layer = new Konva.Layer();
  stage.add(layer);

  // 画像を読み込んで配置
  const img1 = new Image();
  const img2 = new Image();

  let img1Loaded = false;
  let img2Loaded = false;

  img1.onload = function () {
    img1Loaded = true;
    if (img2Loaded) {
      placeImages(img1, img2, canvasWidth, canvasHeight, guideLayer);
    }
  };

  img2.onload = function () {
    img2Loaded = true;
    if (img1Loaded) {
      placeImages(img1, img2, canvasWidth, canvasHeight, guideLayer);
    }
  };

  img1.src = imageUrls[0];
  img2.src = imageUrls[1];

  // ダウンロードボタン
  document.getElementById("downloadBtn").addEventListener("click", function () {
    downloadImage();
  });
}

function placeImages(img1, img2, canvasWidth, canvasHeight, guideLayer) {
  // 画像1: 幅50%とCanvas高さのうち、小さい方に合わせる
  const img1WidthScale = (canvasWidth * 0.5) / img1.width;
  const img1HeightScale = canvasHeight / img1.height;
  const img1Scale = Math.min(img1WidthScale, img1HeightScale);

  // 画像2: 幅50%とCanvas高さのうち、小さい方に合わせる
  const img2WidthScale = (canvasWidth * 0.5) / img2.width;
  const img2HeightScale = canvasHeight / img2.height;
  const img2Scale = Math.min(img2WidthScale, img2HeightScale);

  // スケール適用後の実際の幅を計算
  const img1ActualWidth = img1.width * img1Scale;
  const img2ActualWidth = img2.width * img2Scale;

  // 内側寄せ（画像同士がくっついている状態で中央配置）
  const totalWidth = img1ActualWidth + img2ActualWidth;
  const leftMargin = (canvasWidth - totalWidth) / 2;

  // Konva Image 1
  const konvaImg1 = new Konva.Image({
    image: img1,
    x: leftMargin,
    y: 0,
    scaleX: img1Scale,
    scaleY: img1Scale,
    draggable: true,
  });

  // Konva Image 2
  const konvaImg2 = new Konva.Image({
    image: img2,
    x: leftMargin + img1ActualWidth,
    y: 0,
    scaleX: img2Scale,
    scaleY: img2Scale,
    draggable: true,
  });

  images = [konvaImg1, konvaImg2];

  // スナップ機能を追加
  [konvaImg1, konvaImg2].forEach((img) => {
    addSnapBehavior(img, canvasWidth, canvasHeight, guideLayer);
  });

  layer.add(konvaImg1);
  layer.add(konvaImg2);
  layer.draw();
}

function addSnapBehavior(imgNode, canvasWidth, canvasHeight, guideLayer) {
  imgNode.on("dragmove", function () {
    const pos = imgNode.position();
    const width = imgNode.width() * imgNode.scaleX();
    const height = imgNode.height() * imgNode.scaleY();

    // スナップポイントを計算
    const snapPoints = getSnapPoints(imgNode, canvasWidth, canvasHeight);

    // ガイドラインをクリア
    guideLayer.destroyChildren();

    let snappedPosX = pos.x;
    let snappedPosY = pos.y;

    // X方向のスナップチェック
    for (const point of snapPoints.vertical) {
      const left = pos.x;
      const right = pos.x + width;
      const centerX = pos.x + width / 2;

      if (Math.abs(left - point.pos) < SNAP_THRESHOLD) {
        snappedPosX = point.pos;
        drawVerticalGuide(guideLayer, point.pos, canvasHeight);
        break;
      } else if (Math.abs(right - point.pos) < SNAP_THRESHOLD) {
        snappedPosX = point.pos - width;
        drawVerticalGuide(guideLayer, point.pos, canvasHeight);
        break;
      } else if (Math.abs(centerX - point.pos) < SNAP_THRESHOLD) {
        snappedPosX = point.pos - width / 2;
        drawVerticalGuide(guideLayer, point.pos, canvasHeight);
        break;
      }
    }

    // Y方向のスナップチェック
    for (const point of snapPoints.horizontal) {
      const top = pos.y;
      const bottom = pos.y + height;
      const centerY = pos.y + height / 2;

      if (Math.abs(top - point.pos) < SNAP_THRESHOLD) {
        snappedPosY = point.pos;
        drawHorizontalGuide(guideLayer, point.pos, canvasWidth);
        break;
      } else if (Math.abs(bottom - point.pos) < SNAP_THRESHOLD) {
        snappedPosY = point.pos - height;
        drawHorizontalGuide(guideLayer, point.pos, canvasWidth);
        break;
      } else if (Math.abs(centerY - point.pos) < SNAP_THRESHOLD) {
        snappedPosY = point.pos - height / 2;
        drawHorizontalGuide(guideLayer, point.pos, canvasWidth);
        break;
      }
    }

    // スナップ適用
    imgNode.position({
      x: snappedPosX,
      y: snappedPosY,
    });

    guideLayer.batchDraw();
  });

  imgNode.on("dragend", function () {
    // ドラッグ終了時にガイドラインをクリア
    guideLayer.destroyChildren();
    guideLayer.batchDraw();
  });
}

function getSnapPoints(currentImg, canvasWidth, canvasHeight) {
  const otherImg = images.find((img) => img !== currentImg);

  const vertical = [{ pos: 0 }, { pos: canvasWidth / 2 }, { pos: canvasWidth }];

  const horizontal = [{ pos: 0 }, { pos: canvasHeight / 2 }, { pos: canvasHeight }];

  if (otherImg) {
    const otherPos = otherImg.position();
    const otherWidth = otherImg.width() * otherImg.scaleX();
    const otherHeight = otherImg.height() * otherImg.scaleY();

    vertical.push({ pos: otherPos.x }, { pos: otherPos.x + otherWidth }, { pos: otherPos.x + otherWidth / 2 });

    horizontal.push({ pos: otherPos.y }, { pos: otherPos.y + otherHeight }, { pos: otherPos.y + otherHeight / 2 });
  }

  return { vertical, horizontal };
}

function drawGrid(gridLayer, canvasWidth, canvasHeight) {
  // 縦線
  for (let i = 0; i <= canvasWidth; i += GRID_SIZE) {
    const line = new Konva.Line({
      points: [i, 0, i, canvasHeight],
      stroke: "#e0e0e0",
      strokeWidth: 1,
    });
    gridLayer.add(line);
  }

  // 横線
  for (let i = 0; i <= canvasHeight; i += GRID_SIZE) {
    const line = new Konva.Line({
      points: [0, i, canvasWidth, i],
      stroke: "#e0e0e0",
      strokeWidth: 1,
    });
    gridLayer.add(line);
  }

  gridLayer.draw();
}

function drawVerticalGuide(guideLayer, x, height) {
  const line = new Konva.Line({
    points: [x, 0, x, height],
    stroke: "#ff6b6b",
    strokeWidth: 1,
    dash: [5, 5],
  });
  guideLayer.add(line);
}

function drawHorizontalGuide(guideLayer, y, width) {
  const line = new Konva.Line({
    points: [0, y, width, y],
    stroke: "#ff6b6b",
    strokeWidth: 1,
    dash: [5, 5],
  });
  guideLayer.add(line);
}

function downloadImage() {
  // すべての画像の境界を計算
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  images.forEach((img) => {
    const pos = img.position();
    const width = img.width() * img.scaleX();
    const height = img.height() * img.scaleY();

    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + width);
    maxY = Math.max(maxY, pos.y + height);
  });

  const cropWidth = maxX - minX;
  const cropHeight = maxY - minY;

  // 高解像度でエクスポート
  const dataURL = stage.toDataURL({
    x: minX,
    y: minY,
    width: cropWidth,
    height: cropHeight,
    pixelRatio: 4,
  });

  // file_nameで現在時刻を使用（20260101_120000）
  const now = new Date();
  const fileName = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

  const link = document.createElement("a");
  link.download = fileName;
  link.href = dataURL;
  link.click();
}
