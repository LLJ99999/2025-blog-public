// ==UserScript==
// @name         BJWLXY自动评教
// @namespace    https://jwxt.bjwlxy.cn/
// @version      0.0.1
// @description  自动评教：一键全选A、填"无"、提交、确认、返回、下一个
// @author       LLJ99999
// @match        https://jwxt.bjwlxy.cn/eams/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // 只在顶层窗口运行，避免 iframe 内重复创建面板
    if (window.top !== window.self) return;

    // 防止重复加载
    if (window.__ez5_loaded) return;
    window.__ez5_loaded = true;

    // ======================== 弹窗自动确认 ========================
    window.alert = function (m) { console.log('[评教] alert自动确认:', m); };
    window.confirm = function (m) { console.log('[评教] confirm自动确认:', m); return true; };

    // ======================== 持久化 ========================
    const K = 'ez5_state';

    function save(s) { GM_setValue(K, JSON.stringify(s)); }
    function load() { try { const r = GM_getValue(K, ''); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
    function wipe() { GM_deleteValue(K); }

    // ======================== 日志 ========================
    function log(...a) { console.log('[评教]', ...a); }

    // ======================== 版本管理（升级时清理旧残留状态）========================
    const VER = '5.1.0';
    const K_VER = 'ez5_ver';
    if (GM_getValue(K_VER, '') !== VER) {
        wipe();
        GM_setValue(K_VER, VER);
        log('版本更新至', VER, '，已清理旧状态');
    }

    // ======================== UI 样式 - 简约古风 ========================
    GM_addStyle(`
#ez5 {
    position:fixed;bottom:24px;right:24px;z-index:99999;
    background:#f5f0e1;
    border:1px solid #3a3a3a;
    border-radius:2px;
    padding:14px 18px 16px;
    width:260px;
    font-family:"STSong","SimSun","Songti SC","Noto Serif SC",serif;
    font-size:13px;color:#2a2a2a;
    box-shadow:0 2px 10px rgba(0,0,0,.18);
}
#ez5 .ez5-title {
    text-align:center;font-size:15px;letter-spacing:3px;
    margin-bottom:2px;color:#1a1a1a;font-weight:600;
}
#ez5 .ez5-author {
    text-align:center;font-size:11px;color:#7a6f5c;
    margin-bottom:12px;letter-spacing:1px;
}
#ez5 .ez5-msg {
    background:#ede5d2;
    padding:7px 10px;
    border:1px solid #d4c9b0;
    border-radius:1px;
    font-size:12px;color:#3a3a3a;
    margin-bottom:10px;line-height:1.7;
    min-height:16px;
    text-align:center;
}
#ez5 .ez5-msg b {color:#9c3a3a;font-weight:600;}
#ez5 .ez5-bar-wrap {
    height:6px;background:#e6dcc4;
    border:1px solid #b8a988;
    border-radius:1px;
    margin-bottom:12px;overflow:hidden;
}
#ez5 .ez5-bar {display:block;height:100%;background:#9c3a3a;width:0;transition:width .3s;}
#ez5 .ez5-btns {display:flex;gap:10px;}
#ez5 .ez5-btns button {
    flex:1;padding:8px 0;
    border:1px solid #3a3a3a;
    border-radius:1px;
    font-size:13px;font-weight:500;
    cursor:pointer;font-family:inherit;
    letter-spacing:6px;text-indent:6px;
    transition:background .2s,color .2s;
}
#ez5 .ez5-go {
    background:#9c3a3a;color:#f5f0e1;
}
#ez5 .ez5-go:hover:not(:disabled) {background:#7d2e2e;}
#ez5 .ez5-go:disabled {
    background:#c8a9a9;color:#e5dfd0;border-color:#a89888;cursor:not-allowed;
}
#ez5 .ez5-stop {
    background:#f5f0e1;color:#3a3a3a;
}
#ez5 .ez5-stop:hover:not(:disabled) {background:#ede5d2;}
#ez5 .ez5-stop:disabled {
    color:#a89888;border-color:#c8b896;cursor:not-allowed;background:#f5f0e1;
}
`);

    // ======================== 构建面板 ========================
    function panel() {
        const d = document.createElement('div');
        d.id = 'ez5';
        d.innerHTML = `
        <div class="ez5-title">BJWLXY自动评教</div>
        <div class="ez5-author">作者：LLJ99999</div>
        <div class="ez5-msg" id="ez5-msg">就绪</div>
        <div class="ez5-bar-wrap"><i class="ez5-bar" id="ez5-bar"></i></div>
        <div class="ez5-btns">
            <button class="ez5-go" id="ez5-go">开始</button>
            <button class="ez5-stop" id="ez5-stop" disabled>暂停</button>
        </div>`;
        document.body.appendChild(d);

        document.getElementById('ez5-go').onclick = start;
        document.getElementById('ez5-stop').onclick = function () {
            window.__ez5_stop = true;
        };
    }

    function msg(html, pct) {
        const m = document.getElementById('ez5-msg');
        const b = document.getElementById('ez5-bar');
        const go = document.getElementById('ez5-go');
        const stp = document.getElementById('ez5-stop');
        if (m) m.innerHTML = html;
        if (b) b.style.width = (pct || 0) + '%';
        const busy = window.__ez5_running && !window.__ez5_stop;
        if (go) { go.disabled = busy; }
        if (stp) stp.disabled = !busy;
    }

    // ======================== 扫描链接（含同源 iframe）========================
    function scan() {
        const seen = new Set();
        const out = [];
        const docs = [document];
        // 教务系统列表常在 iframe 内，加入同源 iframe 文档
        for (const f of document.querySelectorAll('iframe')) {
            try {
                const d = f.contentDocument || f.contentWindow?.document;
                if (d) docs.push(d);
            } catch (e) { /* 跨域忽略 */ }
        }
        for (const doc of docs) {
            for (const a of doc.querySelectorAll('a')) {
                const h = a.href || '';
                if (h.indexOf('stdEvaluate!answer.action') === -1) continue;
                if (seen.has(h)) continue;
                seen.add(h);
                out.push({ url: h, txt: (a.textContent || '').trim() || '评教' });
            }
        }
        log('扫描:', out.length, '个链接');
        return out;
    }

    // 列表页动态等待链接出现（教务系统多为 AJAX 加载）
    let scanObserver = null, scanTimer = null;
    function ensureScan() {
        const tasks = scan();
        if (tasks.length > 0) {
            msg('就绪 — 共 <b>' + tasks.length + '</b> 位老师待评教');
            return;
        }
        msg('就绪 — 正在检测评教列表...');
        if (scanObserver) return; // 已在观察
        const onUpdate = () => {
            const t = scan();
            if (t.length > 0) {
                stopScanWatch();
                msg('就绪 — 共 <b>' + t.length + '</b> 位老师待评教');
            }
        };
        scanObserver = new MutationObserver(onUpdate);
        scanObserver.observe(document.documentElement, { childList: true, subtree: true });
        scanTimer = setInterval(onUpdate, 800);
        // 30 秒兜底停止
        setTimeout(stopScanWatch, 30000);
    }
    function stopScanWatch() {
        if (scanObserver) { scanObserver.disconnect(); scanObserver = null; }
        if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    }

    // ======================== 页面判断 ========================
    function onEvalPage() {
        return location.href.indexOf('stdEvaluate!answer.action') !== -1;
    }

    // ======================== 已评教 ========================
    function evaluated() {
        const t = document.body?.textContent || '';
        return /已评教|已完成评价|已评价|评教已完成|该课程已评价|无法评教/.test(t);
    }

    // ======================== 填表 ========================
    function fill() {
        let doc = document;
        for (const f of document.querySelectorAll('iframe')) {
            try {
                const d = f.contentDocument || f.contentWindow?.document;
                if (d && d.querySelectorAll('input[type="radio"]').length > 2) { doc = d; break; }
            } catch (e) { }
        }

        // 单选题选每组第一个
        const map = new Map();
        for (const r of doc.querySelectorAll('input[type="radio"]')) {
            const n = r.name || r.getAttribute('name') || '';
            if (!map.has(n)) map.set(n, []);
            map.get(n).push(r);
        }
        for (const [, arr] of map) {
            if (arr.length >= 2) {
                arr[0].checked = true;
                arr[0].click();
            }
        }

        // 下拉框选第一个有效
        for (const s of doc.querySelectorAll('select')) {
            for (const o of s.options) {
                if (o.value && o.text && o.text !== '请选择' && o.text !== '--') {
                    s.value = o.value;
                    s.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                }
            }
        }

        // 复选框全勾
        for (const c of doc.querySelectorAll('input[type="checkbox"]')) {
            if (!c.checked) { c.checked = true; }
        }

        // 文本框填"无"
        for (const t of doc.querySelectorAll('textarea')) {
            if (t.readOnly || t.disabled) continue;
            t.value = '无';
            t.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (!doc.querySelector('textarea')) {
            for (const i of doc.querySelectorAll('input[type="text"]')) {
                if (i.readOnly || i.disabled) continue;
                const n = (i.closest('tr,div,td')?.textContent || '');
                if (n.includes('意见') || n.includes('建议') || n.includes('评价')) {
                    i.value = '无';
                }
            }
        }
    }

    // ======================== 提交 ========================
    function submit() {
        for (const el of document.querySelectorAll('button, input[type="submit"], input[type="button"]')) {
            if (el.disabled) continue;
            const t = (el.textContent || el.value || '').replace(/\s/g, '');
            if (t.includes('提交') || t.includes('保存')) {
                el.click();
                log('提交:', t);
                return;
            }
        }
        const sb = document.querySelector('button[type="submit"], input[type="submit"]');
        if (sb) sb.click();
    }

    // ======================== 返回列表 ========================
    function back() {
        // 找量化评教旁的箭头
        for (const a of document.querySelectorAll('a')) {
            if ((a.textContent || '').includes('量化评教')) {
                const p = a.parentElement;
                if (p) {
                    const prev = p.previousElementSibling;
                    if (prev) {
                        const link = prev.querySelector('a') || (prev.tagName === 'A' ? prev : null);
                        if (link) { link.click(); return; }
                    }
                    const items = Array.from((p.parentElement || p).querySelectorAll('a'));
                    const idx = items.indexOf(a);
                    if (idx > 0) { items[idx - 1].click(); return; }
                }
            }
        }
        // 返回链接
        for (const a of document.querySelectorAll('a')) {
            const t = (a.textContent || '').trim();
            if (t === '返回' || t === '<<' || t === '《' || t === '←') { a.click(); return; }
        }
        // 面包屑
        const bc = document.querySelectorAll('.breadcrumb a, [class*="bread"] a');
        if (bc.length >= 2) { bc[bc.length - 2].click(); return; }
        history.back();
    }

    // ======================== 关闭自定义弹窗 ========================
    function closeDialog() {
        for (const d of document.querySelectorAll('.layui-layer-dialog, .modal, .dialog, .popup, .msgbox, [class*=dialog], [class*=modal]')) {
            if (d.offsetParent === null) continue; // 不可见
            for (const b of d.querySelectorAll('button, a')) {
                const t = (b.textContent || '').trim();
                if (t === '确定' || t === '确认' || t === 'OK' || t === '知道了') {
                    b.click();
                    return;
                }
            }
            // 任意按钮
            const any = d.querySelector('button');
            if (any) any.click();
        }
    }

    // ======================== 评教页 → 执行 ========================
    // 等待评教表单（含同源 iframe 内）加载就绪，避免首次跳转时表单未加载完就填表
    function waitForForm(cb) {
        const ready = () => {
            const docs = [document];
            for (const f of document.querySelectorAll('iframe')) {
                try {
                    const d = f.contentDocument || f.contentWindow?.document;
                    if (d) docs.push(d);
                } catch (e) { }
            }
            for (const doc of docs) {
                if (doc.querySelectorAll('input[type="radio"]').length > 2) return true;
            }
            return false;
        };
        let waited = 0;
        const step = 300;
        const tick = () => {
            if (ready() || waited >= 5000) { cb(); return; } // 就绪或超时5s兜底
            waited += step;
            setTimeout(tick, step);
        };
        tick();
    }

    function doEval() {
        log('===== 评教页 =====');
        if (evaluated()) {
            log('已评教，返回');
            setTimeout(back, 500);
            return;
        }

        const s = load();
        // idx是"下一个要评的索引"，当前正在评的是 idx-1
        const cur = s ? Math.max(0, s.idx - 1) : 0;
        const total = s ? s.tasks.length : 0;
        msg('评教中 <b>' + (cur + 1) + '/' + total + '</b>',
            total ? Math.round((cur / total) * 100) : 0);

        waitForForm(() => {
            fill();
            setTimeout(() => {
                submit();
                // 等弹窗 + 关闭自定义弹窗（可能有两次弹窗）
                setTimeout(() => {
                    closeDialog();
                    setTimeout(() => {
                        closeDialog();
                        setTimeout(back, 1500);
                    }, 1000);
                }, 1500);
            }, 600);
        });
    }

    // ======================== 列表页 → 继续/开始 ========================
    function onList() {
        const s = load();
        if (!s || !s.tasks || s.tasks.length === 0) {
            // 没有保存状态，扫描当前页面（含动态等待）
            ensureScan();
            return;
        }

        if (window.__ez5_stop) {
            window.__ez5_running = false;
            msg('已暂停', Math.round((s.idx / s.tasks.length) * 100));
            return;
        }

        // s.idx = 当前已完成的评教数量(也是下一个要评教的索引)
        const current = s.idx;

        if (current >= s.tasks.length) {
            // 全部完成
            window.__ez5_running = false;
            wipe();
            msg('<b>全部完成</b>　共 ' + s.tasks.length + ' 位老师', 100);
            setTimeout(function () {
                alert('评教全部完成！共 ' + s.tasks.length + ' 位老师。');
            }, 600);
            return;
        }

        // 继续下一个
        msg('继续 — <b>' + (current + 1) + '/' + s.tasks.length + '</b>',
            Math.round((current / s.tasks.length) * 100));

        const nextUrl = s.tasks[current].url;
        log('跳转', current + 1, '/', s.tasks.length, nextUrl);

        // ★ 先存后跳：保存下一步的索引
        const nextIdx = current + 1;
        s.idx = nextIdx;
        save(s);

        setTimeout(function () {
            location.href = nextUrl;
        }, 800);
    }

    // ======================== 开始按钮 ========================
    function start() {
        if (window.__ez5_running) return;
        window.__ez5_running = true;
        window.__ez5_stop = false;

        const tasks = scan();
        if (tasks.length === 0) {
            window.__ez5_running = false;
            msg('未检测到评教链接，请进入评教列表页后再点开始');
            log('未找到评教链接，当前页面:', location.href);
            return;
        }

        // idx=0 表示"下一个要做的是第0个"
        const s = { tasks: tasks, idx: 0 };
        save(s);
        msg('开始 — <b>1/' + tasks.length + '</b>', 0);
        log('开始, 共', tasks.length, '个 ->', tasks[0].url);

        // ★ 先存后跳
        s.idx = 1; // 跳转后当前任务index=0，下次从1开始
        save(s);

        setTimeout(function () {
            location.href = tasks[0].url;
        }, 500);
    }

    // ======================== 入口 ========================
    function init() {
        panel();

        window.__ez5_running = !!load(); // 有保存状态说明之前正在运行

        const evalPage = onEvalPage();
        log('URL:', location.href, '评教页:', evalPage);

        if (evalPage) {
            doEval();
        } else {
            onList();
        }
    }

    // 等body
    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
