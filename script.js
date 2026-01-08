let stage;
let layer;
let images = [];
let firstImageFile = null;
let firstImageDataUrl = null;
let originalImages = []; // 元のImage要素を保持
let guideLayer = null; // ガイドラインレイヤーの参照
let currentLayout = 1; // 現在のレイアウト（1-4）
let transformer = null; // Transformerの参照
const CANVAS_ASPECT_RATIO = 4 / 3; // 4:3 aspect ratio
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

  // ガイドラインレイヤー（スナップ時に表示）
  guideLayer = new Konva.Layer();
  stage.add(guideLayer);

  // 画像レイヤー
  layer = new Konva.Layer();
  stage.add(layer);

  // Transformerを作成（リサイズ・回転機能）
  transformer = new Konva.Transformer({
    rotateEnabled: true,
    borderStroke: '#2c2c2c',
    borderStrokeWidth: 2,
    anchorStroke: '#2c2c2c',
    anchorFill: 'white',
    anchorSize: 10,
    keepRatio: false, // アスペクト比を保持しない（自由にリサイズ）
  });
  layer.add(transformer);

  // Stageの背景をクリックした時にTransformerを非表示
  stage.on('click tap', function (e) {
    // クリックした対象がStage自体の場合（画像以外の場所をクリック）
    if (e.target === stage) {
      transformer.nodes([]);
      layer.draw();
      return;
    }

    // 画像をクリックした場合は何もしない（画像側で処理）
  });

  // 画像を読み込んで配置
  const img1 = new Image();
  const img2 = new Image();

  let img1Loaded = false;
  let img2Loaded = false;

  img1.onload = function () {
    img1Loaded = true;
    if (img2Loaded) {
      originalImages = [img1, img2]; // 元画像を保存
      placeImages(currentLayout);
      setupLayoutButtons();
    }
  };

  img2.onload = function () {
    img2Loaded = true;
    if (img1Loaded) {
      originalImages = [img1, img2]; // 元画像を保存
      placeImages(currentLayout);
      setupLayoutButtons();
    }
  };

  img1.src = imageUrls[0];
  img2.src = imageUrls[1];

  // ダウンロードボタン
  document.getElementById("downloadBtn").addEventListener("click", function () {
    downloadImage();
  });

  // キーボードショートカット（⌘+S / Ctrl+S）
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault(); // ブラウザのデフォルト保存動作を防ぐ
      downloadImage();
    }
  });
}

// レイアウトボタンのセットアップ
function setupLayoutButtons() {
  const buttons = [
    { id: "layout1Btn", layout: 1 },
    { id: "layout2Btn", layout: 2 },
    { id: "layout3Btn", layout: 3 },
    { id: "layout4Btn", layout: 4 },
  ];

  buttons.forEach(({ id, layout }) => {
    document.getElementById(id).addEventListener("click", function () {
      switchLayout(layout);
    });
  });

  // 初期状態でレイアウト1をアクティブに
  updateActiveButton(1);
}

// レイアウト切り替え
function switchLayout(layoutNumber) {
  currentLayout = layoutNumber;
  updateActiveButton(layoutNumber);
  placeImages(layoutNumber);
}

// アクティブボタンの更新
function updateActiveButton(layoutNumber) {
  document.querySelectorAll(".layout-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.getElementById(`layout${layoutNumber}Btn`).classList.add("active");
}

function placeImages(layoutNumber) {
  const canvasWidth = stage.width();
  const canvasHeight = stage.height();
  const [img1, img2] = originalImages;

  // Transformerをクリア
  if (transformer) {
    transformer.nodes([]);
  }

  // 既存の画像を削除（Transformerは残す）
  const children = layer.children.filter(child => child !== transformer);
  children.forEach(child => child.destroy());

  let firstImg, secondImg;
  let scale1, scale2;
  let x1, y1, x2, y2;

  switch (layoutNumber) {
    case 1: // img1 | img2 (横並び)
      firstImg = img1;
      secondImg = img2;
      // 幅50%とCanvas高さのうち、小さい方に合わせる
      scale1 = Math.min((canvasWidth * 0.5) / img1.width, canvasHeight / img1.height);
      scale2 = Math.min((canvasWidth * 0.5) / img2.width, canvasHeight / img2.height);

      const width1Case1 = img1.width * scale1;
      const width2Case1 = img2.width * scale2;
      const totalWidthCase1 = width1Case1 + width2Case1;
      const leftMarginCase1 = (canvasWidth - totalWidthCase1) / 2;

      x1 = leftMarginCase1;
      y1 = 0;
      x2 = leftMarginCase1 + width1Case1;
      y2 = 0;
      break;

    case 2: // img2 | img1 (横並び、逆)
      firstImg = img2;
      secondImg = img1;
      scale1 = Math.min((canvasWidth * 0.5) / img2.width, canvasHeight / img2.height);
      scale2 = Math.min((canvasWidth * 0.5) / img1.width, canvasHeight / img1.height);

      const width1Case2 = img2.width * scale1;
      const width2Case2 = img1.width * scale2;
      const totalWidthCase2 = width1Case2 + width2Case2;
      const leftMarginCase2 = (canvasWidth - totalWidthCase2) / 2;

      x1 = leftMarginCase2;
      y1 = 0;
      x2 = leftMarginCase2 + width1Case2;
      y2 = 0;
      break;

    case 3: // img1 / img2 (縦並び)
      firstImg = img1;
      secondImg = img2;
      scale1 = Math.min(canvasWidth / img1.width, (canvasHeight * 0.5) / img1.height);
      scale2 = Math.min(canvasWidth / img2.width, (canvasHeight * 0.5) / img2.height);

      const height1Case3 = img1.height * scale1;
      const height2Case3 = img2.height * scale2;
      const totalHeightCase3 = height1Case3 + height2Case3;
      const topMarginCase3 = (canvasHeight - totalHeightCase3) / 2;

      x1 = 0;
      y1 = topMarginCase3;
      x2 = 0;
      y2 = topMarginCase3 + height1Case3;
      break;

    case 4: // img2 / img1 (縦並び、逆)
      firstImg = img2;
      secondImg = img1;
      scale1 = Math.min(canvasWidth / img2.width, (canvasHeight * 0.5) / img2.height);
      scale2 = Math.min(canvasWidth / img1.width, (canvasHeight * 0.5) / img1.height);

      const height1Case4 = img2.height * scale1;
      const height2Case4 = img1.height * scale2;
      const totalHeightCase4 = height1Case4 + height2Case4;
      const topMarginCase4 = (canvasHeight - totalHeightCase4) / 2;

      x1 = 0;
      y1 = topMarginCase4;
      x2 = 0;
      y2 = topMarginCase4 + height1Case4;
      break;
  }

  // Konva Image オブジェクトを作成
  const konvaImg1 = new Konva.Image({
    image: firstImg,
    x: x1,
    y: y1,
    scaleX: scale1,
    scaleY: scale1,
    draggable: true,
  });

  const konvaImg2 = new Konva.Image({
    image: secondImg,
    x: x2,
    y: y2,
    scaleX: scale2,
    scaleY: scale2,
    draggable: true,
  });

  images = [konvaImg1, konvaImg2];

  // スナップ機能を追加
  [konvaImg1, konvaImg2].forEach((img) => {
    addSnapBehavior(img, canvasWidth, canvasHeight, guideLayer);

    // 画像をクリックした時にTransformerをアタッチ
    img.on('click tap', function () {
      transformer.nodes([img]);
      layer.draw();
    });
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
