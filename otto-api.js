/**
 * otto-api.js
 * オットー経営管理システム 共通APIクライアント（経費精算と同じ方式）
 *
 * 構成:
 *   HTML → Cloudflare Worker (otto-api) → Apps Script → Spreadsheet / Drive
 *   OCR は既存の keihi-ocr Worker を使用（オットー独自 Worker の `POST /` にも対応可）
 *
 * 使い方:
 *   <script src="otto-api.js"></script>
 *   const master = await OTTO.master.fetch();
 *   await OTTO.sales.send(staffName, records);
 */
(function (global) {
  'use strict';

  // === 設定（デプロイ後に書き換え） =====================================
  const WORKER_URL = 'https://otto-api.akirasp4.workers.dev'; // オットー Worker（新規）
  // マスタキャッシュキー
  const CACHE_MASTER = 'otto_master_cache_v1';

  // === マスタ =========================================================
  const master = {
    // ネット優先・失敗時はキャッシュにフォールバック
    async fetch() {
      try {
        const res = await fetch(WORKER_URL + '/master', { method: 'GET' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        try {
          localStorage.setItem(CACHE_MASTER, JSON.stringify({ at: Date.now(), data }));
        } catch {}
        return { data, cached: false };
      } catch (err) {
        const raw = localStorage.getItem(CACHE_MASTER);
        if (raw) {
          try {
            const { data, at } = JSON.parse(raw);
            console.warn('[otto-api] master取得失敗 → キャッシュ使用', err);
            return { data, cached: true, cachedAt: at, error: err };
          } catch {}
        }
        throw err;
      }
    },
    cachedOnly() {
      const raw = localStorage.getItem(CACHE_MASTER);
      if (!raw) return null;
      try { return JSON.parse(raw).data; } catch { return null; }
    },
  };

  // === 売上送信 =======================================================
  const sales = {
    async send(staff, records) {
      const res = await fetch(WORKER_URL + '/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff, records }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'HTTP ' + res.status);
      return data;
    },
  };

  // === 経費送信 =======================================================
  const expenses = {
    async send(staff, records) {
      const res = await fetch(WORKER_URL + '/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff, records }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'HTTP ' + res.status);
      return data;
    },
  };

  // === ヘルスチェック =================================================
  async function ping() {
    try {
      const res = await fetch(WORKER_URL + '/master', { method: 'GET' });
      return { online: res.ok };
    } catch (err) {
      return { online: false, error: err.message };
    }
  }

  // === 公開 ===========================================================
  global.OTTO = {
    WORKER_URL,
    master,
    sales,
    expenses,
    ping,
  };
})(typeof window !== 'undefined' ? window : globalThis);
