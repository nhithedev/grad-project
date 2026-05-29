// ─── helpers ────────────────────────────────────────────────────────────────

function msg(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (res) => {
      resolve(res)
    })
  })
}

function looksLikeDuration(s) {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test((s || '').trim())
}

function setStatus(id, state, resultText, detail) {
  const dot = document.getElementById('dot-' + id)
  const detailBox = document.getElementById('detail-' + id)
  const row = document.getElementById('row-' + id)

  dot.className = 'status-dot ' + state

  // find or create result span
  let resultEl = row.querySelector('.check-result')
  if (!resultEl) {
    resultEl = document.createElement('div')
    resultEl.className = 'check-result'
    row.querySelector('div:nth-child(2)').appendChild(resultEl)
  }
  resultEl.className = 'check-result ' + state
  resultEl.textContent = resultText || ''

  if (detail !== undefined && detailBox) {
    detailBox.textContent = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)
    detailBox.classList.add('open')
  }

  updateSummary()
}

function updateSummary() {
  const dots = document.querySelectorAll('.status-dot')
  const total = dots.length
  const done = [...dots].filter(d => d.classList.contains('pass') || d.classList.contains('fail') || d.classList.contains('warn')).length
  const passed = [...dots].filter(d => d.classList.contains('pass')).length
  document.getElementById('summary').textContent = `${passed} pass · ${done - passed} fail · ${total - done} pending`
}

// ─── state for multi-step checks ────────────────────────────────────────────

let createdRuleId = null

// ─── check implementations ──────────────────────────────────────────────────

const checks = {

  async manifest() {
    const id = chrome.runtime?.id
    if (id) {
      setStatus('manifest', 'pass', 'OK', `chrome.runtime.id = "${id}"`)
    } else {
      setStatus('manifest', 'fail', 'FAIL', 'chrome.runtime.id is undefined — script không chạy trong extension context')
    }
  },

  async ping() {
    const res = await msg('PING')
    if (res?.success && res?.data === 'pong') {
      setStatus('ping', 'pass', 'pong ✓')
    } else {
      setStatus('ping', 'fail', 'FAIL', JSON.stringify(res))
    }
  },

  async 'settings-read'() {
    const res = await msg('GET_SETTINGS')
    if (res?.success && typeof res.data?.enabled === 'boolean') {
      setStatus('settings-read', 'pass', 'OK', JSON.stringify(res.data, null, 2))
    } else {
      setStatus('settings-read', 'fail', 'FAIL', JSON.stringify(res))
    }
  },

  async 'settings-write'() {
    const before = await msg('GET_SETTINGS')
    const original = before?.data?.debugMode
    await msg('SAVE_SETTINGS', { debugMode: !original })
    const after = await msg('GET_SETTINGS')
    if (after?.data?.debugMode === !original) {
      await msg('SAVE_SETTINGS', { debugMode: original }) // restore
      setStatus('settings-write', 'pass', 'OK', `debugMode toggled ${original} → ${!original} → restored`)
    } else {
      setStatus('settings-write', 'fail', 'FAIL', `expected debugMode=${!original}, got ${after?.data?.debugMode}`)
    }
  },

  async 'unknown-msg'() {
    const res = await msg('__NONEXISTENT__')
    if (res?.success === false && res?.error) {
      setStatus('unknown-msg', 'pass', 'OK', `error: "${res.error}"`)
    } else {
      setStatus('unknown-msg', 'fail', 'FAIL', JSON.stringify(res))
    }
  },

  async 'tabs-perm'() {
    try {
      const tabs = await chrome.tabs.query({})
      setStatus('tabs-perm', 'pass', `${tabs.length} tabs`, 'chrome.tabs.query hoạt động — permission tabs có')
    } catch (e) {
      setStatus('tabs-perm', 'fail', 'NO PERM', `Lỗi: ${e.message}\n\nFix: thêm "tabs" vào permissions trong package.json`)
    }
  },

  async 'db-open'() {
    return new Promise((resolve) => {
      const req = indexedDB.open('youtubeFilterDB')
      req.onsuccess = () => {
        const db = req.result
        const version = db.version
        db.close()
        setStatus('db-open', 'pass', `v${version}`, `DB mở thành công, version=${version}`)
        resolve()
      }
      req.onerror = () => {
        setStatus('db-open', 'fail', 'FAIL', `Lỗi: ${req.error?.message}`)
        resolve()
      }
    })
  },

  async 'db-stores'() {
    return new Promise((resolve) => {
      const req = indexedDB.open('youtubeFilterDB')
      req.onsuccess = () => {
        const db = req.result
        const stores = [...db.objectStoreNames]
        db.close()
        const required = ['ruleLists', 'rules', 'entitiesCache']
        const missing = required.filter(s => !stores.includes(s))
        if (missing.length === 0) {
          setStatus('db-stores', 'pass', `${stores.length} stores`, `Stores: ${stores.join(', ')}`)
        } else {
          setStatus('db-stores', 'fail', `MISSING: ${missing.join(', ')}`,
            `Có: ${stores.join(', ')}\nThiếu: ${missing.join(', ')}\n\nFix: kiểm tra Dexie version(2) có khai báo entitiesCache chưa`)
        }
        resolve()
      }
      req.onerror = () => { setStatus('db-stores', 'fail', 'FAIL', req.error?.message); resolve() }
    })
  },

  async 'entities-count'() {
    const res = await msg('GET_PARSED_CANDIDATES')
    const count = res?.data?.length ?? 0
    if (count > 0) {
      setStatus('entities-count', 'pass', `${count} records`, `3 mới nhất:\n${JSON.stringify(res.data.slice(0,3), null, 2)}`)
    } else {
      setStatus('entities-count', 'warn', '0 records',
        'DB rỗng. Nguyên nhân thường gặp:\n' +
        '1. Chưa mở tab YouTube nào sau khi load extension\n' +
        '2. Content script chưa inject (kiểm tra manifest matches)\n' +
        '3. highlights.ts chưa gọi initYouTubeParser()')
    }
  },

  async 'entities-shape'() {
    const res = await msg('GET_PARSED_CANDIDATES')
    const records = res?.data || []
    if (records.length === 0) {
      setStatus('entities-shape', 'warn', 'NO DATA', 'Chạy check entities-count trước')
      return
    }
    const sample = records[0]
    const issues = []
    if (!sample.videoId) issues.push('thiếu videoId')
    if (!sample.title) issues.push('thiếu title')
    if (looksLikeDuration(sample.title)) issues.push(`title trông như duration: "${sample.title}"`)
    if (!sample.pageType) issues.push('thiếu pageType')
    if (!sample.lastSeenAt) issues.push('thiếu lastSeenAt')

    if (issues.length === 0) {
      setStatus('entities-shape', 'pass', 'OK', `Sample:\n${JSON.stringify(sample, null, 2)}`)
    } else {
      setStatus('entities-shape', 'fail', issues.join(', '), `Issues: ${issues.join(', ')}\n\nSample:\n${JSON.stringify(sample, null, 2)}`)
    }
  },

  async 'entities-title-bug'() {
    const res = await msg('GET_PARSED_CANDIDATES')
    const records = res?.data || []
    const badOnes = records.filter(r => looksLikeDuration(r.title))
    if (badOnes.length === 0) {
      setStatus('entities-title-bug', 'pass', 'OK', `${records.length} records kiểm tra — không có title nào là duration`)
    } else {
      setStatus('entities-title-bug', 'fail',
        `${badOnes.length} bad titles`,
        `${badOnes.length} record có title dạng duration (bug watch parser):\n` +
        JSON.stringify(badOnes.slice(0,5).map(r => ({ videoId: r.videoId, title: r.title, pageType: r.pageType })), null, 2) +
        '\n\nFix: thay youtube-parser.ts bằng file đã fix (resolveTitleForWatchAnchor)')
    }
  },

  async 'rules-empty'() {
    const res = await msg('GET_ALL_RULES')
    if (res?.success && Array.isArray(res.data)) {
      setStatus('rules-empty', 'pass', `${res.data.length} rules`, JSON.stringify(res.data.slice(0,3), null, 2))
    } else {
      setStatus('rules-empty', 'fail', 'FAIL', JSON.stringify(res))
    }
  },

  async 'rule-create'() {
    const payload = { type: 'keyword', targetRaw: '__debug_test__', action: 'flag' }
    const res = await msg('CREATE_RULE', payload)
    if (res?.success && Array.isArray(res.data)) {
      const found = res.data.find(r => r.targetRaw === '__debug_test__')
      if (found) {
        createdRuleId = found.id
        setStatus('rule-create', 'pass', `id=${found.id}`, JSON.stringify(found, null, 2))
      } else {
        setStatus('rule-create', 'warn', 'DUPLICATE?', 'Rule có thể đã tồn tại (targetNormalized unique)\n' + JSON.stringify(res.data.slice(0,3), null, 2))
        const existing = res.data.find(r => r.targetNormalized?.includes('debug'))
        if (existing) createdRuleId = existing.id
      }
    } else {
      setStatus('rule-create', 'fail', 'FAIL', JSON.stringify(res))
    }
  },

  async 'rule-toggle'() {
    if (!createdRuleId) {
      setStatus('rule-toggle', 'warn', 'SKIP', 'Chạy rule-create trước để có rule id')
      return
    }
    const res = await msg('SET_RULE_ENABLED', { id: createdRuleId, enabled: false })
    if (res?.success) {
      const rule = res.data?.find?.(r => r.id === createdRuleId)
      if (rule?.enabled === false) {
        setStatus('rule-toggle', 'pass', 'OK', `Rule id=${createdRuleId} disabled thành công`)
      } else {
        setStatus('rule-toggle', 'fail', 'FAIL', `enabled vẫn là ${rule?.enabled}\n` + JSON.stringify(rule))
      }
    } else {
      setStatus('rule-toggle', 'fail', 'FAIL', JSON.stringify(res))
    }
  },

  async 'rule-delete'() {
    if (!createdRuleId) {
      setStatus('rule-delete', 'warn', 'SKIP', 'Chạy rule-create trước')
      return
    }
    const res = await msg('DELETE_RULE', createdRuleId)
    if (res?.success && Array.isArray(res.data)) {
      const stillExists = res.data.find(r => r.id === createdRuleId)
      if (!stillExists) {
        setStatus('rule-delete', 'pass', 'OK', `Rule id=${createdRuleId} đã bị xóa`)
        createdRuleId = null
      } else {
        setStatus('rule-delete', 'fail', 'FAIL', 'Rule vẫn còn trong list sau khi delete')
      }
    } else {
      setStatus('rule-delete', 'fail', 'FAIL', JSON.stringify(res))
    }
  },

  async 'rule-match'() {
    const entRes = await msg('GET_PARSED_CANDIDATES')
    const entities = entRes?.data || []
    if (entities.length === 0) {
      setStatus('rule-match', 'warn', 'NO DATA', 'Cần có entity trong DB để test match')
      return
    }
    // lấy một từ từ title đầu tiên
    const sampleTitle = entities[0]?.title || ''
    const words = sampleTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const keyword = words[0]
    if (!keyword) {
      setStatus('rule-match', 'warn', 'SKIP', `Title "${sampleTitle}" không có từ dài hơn 3 ký tự để test`)
      return
    }
    // tạo rule tạm
    const createRes = await msg('CREATE_RULE', { type: 'keyword', targetRaw: keyword, action: 'flag' })
    const rule = createRes?.data?.find?.(r => r.targetRaw === keyword)
    if (!rule) {
      setStatus('rule-match', 'warn', 'SKIP', `Không tạo được rule test với keyword "${keyword}"`)
      return
    }
    // kiểm tra match thủ công
    const normalize = s => s.toLowerCase().normalize('NFC').trim()
    const matchedEntities = entities.filter(e => normalize(e.title || '').includes(normalize(keyword)))
    // dọn dẹp
    await msg('DELETE_RULE', rule.id)
    if (matchedEntities.length > 0) {
      setStatus('rule-match', 'pass', `${matchedEntities.length} match`,
        `keyword: "${keyword}"\nMatched ${matchedEntities.length}/${entities.length} entities\nSample: ${matchedEntities[0]?.title}`)
    } else {
      setStatus('rule-match', 'fail', '0 match',
        `keyword: "${keyword}" không match entity nào — kiểm tra normalizeText trong data/utils/normalize.ts`)
    }
  },

  async 'highlight-tabs'() {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' })
      if (tabs.length === 0) {
        setStatus('highlight-tabs', 'warn', 'NO YT TAB', 'Không tìm thấy tab YouTube nào đang mở. Mở youtube.com rồi chạy lại.')
        return
      }
      let sent = 0
      let failed = 0
      await Promise.all(tabs.map(tab => {
        if (!tab.id) return Promise.resolve()
        return chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_HIGHLIGHTS' })
          .then(() => sent++)
          .catch(() => failed++)
      }))
      if (sent > 0) {
        setStatus('highlight-tabs', 'pass', `sent to ${sent} tab(s)`,
          `${sent} tab nhận được REFRESH_HIGHLIGHTS, ${failed} tab không nhận (content script chưa inject)`)
      } else {
        setStatus('highlight-tabs', 'fail', `0 sent`,
          `${tabs.length} tab YouTube tìm thấy nhưng không tab nào nhận được message.\n` +
          'Nguyên nhân: content script chưa inject vào tab đó.\n' +
          'Fix: reload tab YouTube sau khi load extension.')
      }
    } catch (e) {
      setStatus('highlight-tabs', 'fail', 'ERROR', `${e.message}\n\nFix: thêm "tabs" vào permissions trong package.json`)
    }
  },

  async 'watch-title'() {
    const res = await msg('GET_PARSED_CANDIDATES')
    const records = res?.data || []
    const watchRecords = records.filter(r => r.pageType === 'watch')
    if (watchRecords.length === 0) {
      setStatus('watch-title', 'warn', 'NO WATCH DATA', 'Chưa có entity nào từ trang watch. Mở một video YouTube rồi chạy lại.')
      return
    }
    const badOnes = watchRecords.filter(r => looksLikeDuration(r.title))
    const goodOnes = watchRecords.filter(r => !looksLikeDuration(r.title))
    if (badOnes.length === 0) {
      setStatus('watch-title', 'pass', `${watchRecords.length} watch OK`,
        `${goodOnes.length} record có title hợp lệ\nSample: "${goodOnes[0]?.title}"`)
    } else {
      setStatus('watch-title', 'fail', `${badOnes.length}/${watchRecords.length} bad`,
        `${badOnes.length} record vẫn có title là duration:\n` +
        JSON.stringify(badOnes.slice(0,5).map(r => ({ videoId: r.videoId, title: r.title })), null, 2) +
        '\n\nFix: thay file youtube-parser.ts bằng version đã fix.\n' +
        'Sau đó xóa cache cũ: CLEAR_PARSED_CANDIDATES rồi reload tab watch.')
    }
  }
}

// ─── runner ──────────────────────────────────────────────────────────────────

async function run(id) {
  const dot = document.getElementById('dot-' + id)
  dot.className = 'status-dot running'
  const btn = document.querySelector(`[data-check-id="${id}"]`)
  if (btn) btn.disabled = true

  try {
    const fn = checks[id]
    if (fn) await fn()
    else setStatus(id, 'fail', 'NOT FOUND', `Check "${id}" không tồn tại`)
  } catch (e) {
    setStatus(id, 'fail', 'ERROR', `Exception: ${e.message}\n${e.stack}`)
  }

  if (btn) btn.disabled = false
}

async function runAll() {
  const ids = Object.keys(checks)
  for (const id of ids) {
    await run(id)
  }
}

// ─── event delegation for buttons ───────────────────────────────────────────

document.addEventListener('click', (event) => {
  // Handle individual check buttons (data-check-id)
  const target = event.target
  if (target.dataset?.checkId) {
    event.preventDefault()
    run(target.dataset.checkId)
    return
  }
  
  // Handle clicks inside buttons with data-check-id
  const btn = target.closest('button[data-check-id]')
  if (btn) {
    event.preventDefault()
    run(btn.dataset.checkId)
    return
  }
  
  // Handle run-all button
  if (target.id === 'run-all-btn' || target.closest('#run-all-btn')?.id === 'run-all-btn') {
    event.preventDefault()
    runAll()
  }
})

updateSummary()
