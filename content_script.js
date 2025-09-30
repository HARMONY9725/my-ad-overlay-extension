// content_script.js
(function(){
  // 設定：差し込む画像（拡張内パス）
  const IMAGE_PATH = chrome.runtime.getURL('images/overlay-sample.png');

  // 広告候補を検出するシンプルなルール群（例）
  const selectors = [
    'iframe[src*="doubleclick"]',
    'iframe[src*="ad"]',
    'ins[data-ad-client]',
    '[data-google-query-id]',
    '[id^="google_ads"]',
    '[class*="banner"]',
    '[class*="sponsor"]',
    '[class*="ad-"]'
  ];

  // セレクタで引っかかる要素を集める（重複排除）
  const candidates = new Set();
  selectors.forEach(sel => {
    try {
      document.querySelectorAll(sel).forEach(el => candidates.add(el));
    } catch(e) {
      // 無害な例外は無視
    }
  });

  // 追加ヒューリスティック：サイズのある汎用領域（巨大な空のdivなどの誤検出を避けるため閾値あり）
  const MIN_AREA = 2000; // px^2
  document.querySelectorAll('div, section, aside').forEach(el => {
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width * rect.height >= MIN_AREA) {
        // 名前に広告っぽい単語を含むなら候補にする（ただしセレクタに比べて慎重）
        const classAndId = (el.className + ' ' + el.id).toLowerCase();
        if (classAndId.includes('ad') || classAndId.includes('banner') || classAndId.includes('sponsor')) {
          candidates.add(el);
        }
      }
    } catch(e){}
  });

  // 関数：要素にオーバーレイを被せる（元の要素は消さない）
  function attachOverlay(targetEl) {
    if (!targetEl || !(targetEl instanceof Element)) return;

    // 既に追加済みか簡易チェック
    if (targetEl.dataset.__overlayInjected === '1') return;
    targetEl.dataset.__overlayInjected = '1';

    // 親要素の位置が static なら relative にする（オーバーレイ配置のため）
    const origPosition = window.getComputedStyle(targetEl).position;
    if (origPosition === 'static') {
      targetEl.style.position = 'relative';
    }

    // オーバーレイ要素を作る
    const overlay = document.createElement('div');
    overlay.className = 'extension-overlay';
    overlay.setAttribute('aria-hidden', 'true'); // 支障を最小化

    const img = document.createElement('img');
    img.src = IMAGE_PATH;
    img.alt = ''; // 補助的な情報を入れない（ユーザーに混乱させない）

    // 必要に応じてクリックを下の広告に通す設計も可能（ここでは通さない）
    // overlay.style.pointerEvents = 'auto'; // ホバーを受ける

    overlay.appendChild(img);

    // overlay を targetEl の先頭に挿入（absoluteで全体を覆う）
    // position absolute は親を基準にするため、targetEl を relative にしている
    targetEl.insertBefore(overlay, targetEl.firstChild);

    // オプション：クリックで元コンテンツを一時表示するトグルなどを追加可能
    overlay.addEventListener('contextmenu', (e) => {
      // 右クリックでオーバーレイを除去（デバッグ用／ユーザー制御用に有用）
      e.preventDefault();
      overlay.remove();
      delete targetEl.dataset.__overlayInjected;
    });
  }

  // 初回走査で attach
  candidates.forEach(el => {
    try {
      attachOverlay(el);
    } catch(e){}
  });

  // 動的に出てくる広告要素にも対応するため MutationObserver を設置
  const observer = new MutationObserver(records => {
    for (const r of records) {
      r.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        // 簡易フィルタ：iframe や大きめの div を対象に再検出
        const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        const area = rect ? (rect.width * rect.height) : 0;
        if (node.tagName === 'IFRAME' || area >= MIN_AREA) {
          attachOverlay(node);
        } else {
          // 子要素に広告候補がある場合を考慮
          selectors.forEach(sel => {
            try {
              node.querySelectorAll && node.querySelectorAll(sel).forEach(el => attachOverlay(el));
            } catch(e){}
          });
        }
      });
    }
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });

})();
