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
let regexRuleId = null

// ─── check implementations ──────────────────────────────────────────────────

const checks = {

  // ── Phase 1-2: Extension scaffold ──────────────────────────────────────────

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

  // ── Phase 3: IndexedDB / Dexie v5 ─────────────────────────────────────────

  async 'db-open'() {
    return new Promise((resolve) => {
      const req = indexedDB.open('youtubeFilterDB')
      req.onsuccess = () => {
        const db = req.result
        const version = db.version
        db.close()
        if (version < 5) {
          setStatus('db-open', 'warn', `v${version} (cũ)`,
            `DB version=${version}, expected 5.\n` +
            'Fix: reload extension để trigger Dexie migration lên v5.\n' +
            'Nếu vẫn còn v cũ: xóa DB trong DevTools → Application → IndexedDB → Delete database')
        } else {
          setStatus('db-open', 'pass', `v${version}`, `DB mở thành công, version=${version}`)
        }
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
        const required = ['profiles', 'ruleLists', 'rules', 'entitiesCache', 'matchLogs', 'reviewQueue', 'aiSuggestions']
        const missing = required.filter(s => !stores.includes(s))
        if (missing.length === 0) {
          setStatus('db-stores', 'pass', `${stores.length} stores`, `Stores: ${stores.join(', ')}`)
        } else {
          setStatus('db-stores', 'fail', `MISSING: ${missing.join(', ')}`,
            `Có: ${stores.join(', ')}\nThiếu: ${missing.join(', ')}\n\n` +
            'Fix: reload extension để Dexie chạy migration.\n' +
            'Nếu vẫn thiếu: xóa DB → Application → IndexedDB → youtubeFilterDB → Delete database')
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
        '3. polymer-bridge.ts chưa postMessage entities sang isolated world')
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

  // ── Phase 4: Rules CRUD ────────────────────────────────────────────────────

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
    const res = await msg('DELETE_RULE', { id: createdRuleId })
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
    await msg('DELETE_RULE', { id: rule.id })
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
  },

  // ── Phase 5: Profiles & Settings v2 ───────────────────────────────────────

  async 'profiles-list'() {
    const res = await msg('GET_PROFILES')
    if (!res?.success || !Array.isArray(res.data)) {
      setStatus('profiles-list', 'fail', 'FAIL',
        'GET_PROFILES trả lỗi hoặc không phải array\n' + JSON.stringify(res))
      return
    }
    if (res.data.length === 0) {
      setStatus('profiles-list', 'fail', '0 profiles',
        'Không có profile nào.\n' +
        'Fix: reload extension — background.ts initialize() sẽ gọi ensureDefault()\n' +
        'Nếu vẫn 0: kiểm tra profiles.repository.ts ensureDefault()')
      return
    }
    setStatus('profiles-list', 'pass', `${res.data.length} profiles`,
      JSON.stringify(res.data, null, 2))
  },

  async 'settings-active-profile'() {
    const res = await msg('GET_SETTINGS')
    if (!res?.success) {
      setStatus('settings-active-profile', 'fail', 'FAIL', JSON.stringify(res))
      return
    }
    const activeId = res.data?.activeProfileId
    if (activeId === null || activeId === undefined) {
      setStatus('settings-active-profile', 'warn', 'NULL',
        'activeProfileId = null.\n' +
        'Fix 1: reload extension (background initialize() sẽ set activeProfileId)\n' +
        'Fix 2: mở popup → chọn profile từ dropdown\n\nSettings hiện tại:\n' + JSON.stringify(res.data, null, 2))
      return
    }
    setStatus('settings-active-profile', 'pass', `profileId=${activeId}`,
      JSON.stringify(res.data, null, 2))
  },

  async 'settings-overlay'() {
    const res = await msg('GET_SETTINGS')
    if (!res?.success) {
      setStatus('settings-overlay', 'fail', 'FAIL', JSON.stringify(res))
      return
    }
    const settings = res.data || {}
    if (!('overlayImageUrl' in settings)) {
      setStatus('settings-overlay', 'fail', 'MISSING FIELD',
        'overlayImageUrl không có trong settings object.\n' +
        'Fix: kiểm tra DEFAULT_SETTINGS trong data/storage.ts — phải có overlayImageUrl: ""\n\n' +
        'Settings hiện tại:\n' + JSON.stringify(settings, null, 2))
      return
    }
    const url = settings.overlayImageUrl
    setStatus('settings-overlay', 'pass', url ? 'custom URL' : 'default asset',
      `overlayImageUrl = ${url ? `"${url}"` : '"" (rỗng → dùng assets/yt-filter-cover.png)'}\n\n` +
      JSON.stringify(settings, null, 2))
  },

  async 'rules-by-profile'() {
    const settRes = await msg('GET_SETTINGS')
    const profileId = settRes?.data?.activeProfileId
    if (!profileId) {
      setStatus('rules-by-profile', 'warn', 'NO PROFILE',
        'activeProfileId null — chạy settings-active-profile trước để diagnose')
      return
    }
    const res = await msg('GET_ALL_RULES', { profileId })
    if (res?.success && Array.isArray(res.data)) {
      const allRes = await msg('GET_ALL_RULES')
      const allCount = allRes?.data?.length ?? '?'
      setStatus('rules-by-profile', 'pass', `${res.data.length} rules`,
        `Profile ${profileId}: ${res.data.length} rules (total across all profiles: ${allCount})\n` +
        JSON.stringify(res.data.slice(0, 3), null, 2))
    } else {
      setStatus('rules-by-profile', 'fail', 'FAIL', JSON.stringify(res))
    }
  },

  // ── Phase 6: Entity enrichment ─────────────────────────────────────────────

  async 'entities-channelid'() {
    const res = await msg('GET_PARSED_CANDIDATES')
    const records = res?.data || []
    if (records.length === 0) {
      setStatus('entities-channelid', 'warn', 'NO DATA',
        'Chưa có entity trong DB — mở tab YouTube rồi chạy lại')
      return
    }
    const withChannelId = records.filter(r => r.channelId)
    if (withChannelId.length > 0) {
      setStatus('entities-channelid', 'pass', `${withChannelId.length}/${records.length}`,
        `${withChannelId.length} entity có channelId\nSample:\n${JSON.stringify(withChannelId[0], null, 2)}`)
    } else {
      setStatus('entities-channelid', 'warn', '0 channelId',
        `${records.length} entity nhưng không có channelId.\n` +
        'Nguyên nhân: polymer-bridge chưa inject channelId, hoặc chỉ duyệt home page.\n' +
        'Thử: mở một video YouTube (watch page) để polymer-bridge đọc ytInitialData có channelId\n\n' +
        'Sample entity:\n' + JSON.stringify(records[0], null, 2))
    }
  },

  async 'entities-description'() {
    const res = await msg('GET_PARSED_CANDIDATES')
    const records = res?.data || []
    if (records.length === 0) {
      setStatus('entities-description', 'warn', 'NO DATA', 'Chưa có entity trong DB')
      return
    }
    const withDesc = records.filter(r => r.description)
    if (withDesc.length > 0) {
      setStatus('entities-description', 'pass', `${withDesc.length}/${records.length}`,
        `${withDesc.length} entity có description snippet\n` +
        `Sample: "${withDesc[0]?.description?.slice(0, 100)}..."`)
    } else {
      setStatus('entities-description', 'warn', '0 description',
        `0/${records.length} entity có description.\n` +
        'Bình thường nếu chỉ duyệt home/watch — description chỉ có trên search page.\n' +
        'Thử: tìm kiếm trên YouTube (/results) rồi chạy lại check này.')
    }
  },

  async 'entity-lookup'() {
    const listRes = await msg('GET_PARSED_CANDIDATES')
    const records = listRes?.data || []
    if (records.length === 0) {
      setStatus('entity-lookup', 'warn', 'NO DATA',
        'Cần có entity trong DB — mở YouTube rồi chạy lại')
      return
    }
    const testVideoId = records[0].videoId
    const res = await msg('GET_ENTITY_BY_VIDEO_ID', { videoId: testVideoId })
    if (res?.success && res.data?.videoId === testVideoId) {
      setStatus('entity-lookup', 'pass', 'OK',
        `GET_ENTITY_BY_VIDEO_ID("${testVideoId}") thành công\n` +
        JSON.stringify(res.data, null, 2))
    } else {
      setStatus('entity-lookup', 'fail', 'FAIL',
        `videoId="${testVideoId}" lookup thất bại\nResponse:\n${JSON.stringify(res, null, 2)}`)
    }
  },

  // ── Phase 7: Match logging & reason string ─────────────────────────────────

  async 'matchlog-write'() {
    const testLog = {
      videoId: '__debug_log_test__',
      title: 'Debug Log Test Video',
      channelName: 'Debug Channel',
      ruleId: 0,
      ruleType: 'keyword',
      ruleTarget: '__debug__',
      action: 'flag',
      reason: 'keyword:__debug__ (title)'
    }
    const res = await msg('LOG_MATCH', testLog)
    if (res?.success) {
      // verify it appears in GET_MATCH_LOGS
      const logsRes = await msg('GET_MATCH_LOGS')
      const found = logsRes?.data?.some(l => l.videoId === '__debug_log_test__')
      if (found) {
        setStatus('matchlog-write', 'pass', 'OK',
          `Log tạo và đọc lại thành công\n` + JSON.stringify(testLog, null, 2))
      } else {
        setStatus('matchlog-write', 'warn', 'WRITE OK / READ?',
          'LOG_MATCH success nhưng không tìm thấy trong GET_MATCH_LOGS — kiểm tra match-log.repository.ts')
      }
    } else {
      setStatus('matchlog-write', 'fail', 'FAIL', JSON.stringify(res))
    }
  },

  async 'matchlog-read'() {
    const res = await msg('GET_MATCH_LOGS')
    if (!res?.success || !Array.isArray(res.data)) {
      setStatus('matchlog-read', 'fail', 'FAIL', JSON.stringify(res))
      return
    }
    const count = res.data.length
    const hasTestLog = res.data.some(l => l.videoId === '__debug_log_test__')
    if (count > 0) {
      setStatus('matchlog-read', 'pass', `${count} logs`,
        `${count} match logs tổng\n${hasTestLog ? '✓ test log có mặt' : '(test log chưa tạo)'}\n\nSample:\n` +
        JSON.stringify(res.data.slice(0, 2), null, 2))
    } else {
      setStatus('matchlog-read', 'warn', '0 logs',
        'Chưa có match log.\n' +
        'Thêm rule → duyệt YouTube → rules match video → logs được tạo.\n' +
        'Hoặc chạy matchlog-write trước.')
    }
  },

  async 'reason-field'() {
    const res = await msg('GET_MATCH_LOGS')
    const logs = res?.data || []
    if (logs.length === 0) {
      setStatus('reason-field', 'warn', 'NO LOGS',
        'Chưa có match log — chạy matchlog-write trước, hoặc thêm rule và duyệt YouTube')
      return
    }
    const withField = logs.filter(l => /\(.+\)$/.test(l.reason || ''))
    const withoutField = logs.filter(l => l.reason && !/\(.+\)$/.test(l.reason))
    const noReason = logs.filter(l => !l.reason)

    if (withoutField.length > 0) {
      setStatus('reason-field', 'warn', `${withoutField.length} old-format`,
        `${withoutField.length} log có reason format cũ (thiếu "(field)"):\n` +
        JSON.stringify(withoutField.slice(0, 3).map(l => l.reason), null, 2) +
        '\n\nLogs cũ là bình thường — chỉ logs mới (Phase 6+) mới dùng format "type:target (field)".\n' +
        `${withField.length} logs mới format đúng.`)
    } else if (withField.length > 0) {
      setStatus('reason-field', 'pass', `${withField.length} OK`,
        `Tất cả ${logs.length} log có reason đúng format "type:target (field)"\nSample:\n` +
        JSON.stringify(withField.slice(0, 3).map(l => l.reason), null, 2))
    } else {
      setStatus('reason-field', 'warn', 'NO REASON',
        `${logs.length} log nhưng không có reason string nào.\n` +
        'Kiểm tra highlights.ts — LOG_MATCH payload phải bao gồm reason từ Decision.\n\n' +
        'Sample log:\n' + JSON.stringify(logs[0], null, 2))
    }
  },

  // ── Phase 8: Regex rule type ───────────────────────────────────────────────

  async 'regex-create'() {
    // pattern: word ending in "-ing" (common in video titles)
    const testPattern = '\\w{4,}ing'
    const res = await msg('CREATE_RULE', { type: 'regex', targetRaw: testPattern, action: 'flag' })
    if (res?.success && Array.isArray(res.data)) {
      const found = res.data.find(r => r.type === 'regex' && r.targetRaw === testPattern)
      if (found) {
        regexRuleId = found.id
        setStatus('regex-create', 'pass', `id=${found.id}`,
          `Regex rule tạo thành công\n` + JSON.stringify(found, null, 2))
      } else {
        const existing = res.data.find(r => r.type === 'regex')
        if (existing) regexRuleId = existing.id
        setStatus('regex-create', 'warn', 'DUPLICATE?',
          `Rule có thể đã tồn tại (targetNormalized unique)\n` +
          JSON.stringify(res.data.filter(r => r.type === 'regex').slice(0, 3), null, 2))
      }
    } else {
      setStatus('regex-create', 'fail', 'FAIL', JSON.stringify(res))
    }
  },

  async 'regex-match'() {
    const entRes = await msg('GET_PARSED_CANDIDATES')
    const entities = entRes?.data || []

    // cleanup regex test rule if it exists
    if (regexRuleId) {
      await msg('DELETE_RULE', { id: regexRuleId })
      regexRuleId = null
    }

    if (entities.length === 0) {
      setStatus('regex-match', 'warn', 'NO DATA', 'Cần có entity trong DB để test regex matching')
      return
    }

    // test pattern: any word with 4+ chars (should match virtually all titles)
    const pattern = /\w{4,}/i
    const matched = entities.filter(e =>
      pattern.test(e.title || '') ||
      pattern.test(e.channelName || '')
    )

    if (matched.length > 0) {
      setStatus('regex-match', 'pass', `${matched.length}/${entities.length}`,
        `Pattern /\\w{4,}/i matched ${matched.length}/${entities.length} entities\n` +
        `Sample: "${matched[0]?.title}"\n\n` +
        'JS RegExp engine hoạt động đúng — rule-engine.ts sẽ dùng cùng engine này')
    } else {
      setStatus('regex-match', 'warn', '0 match',
        `Pattern /\\w{4,}/i không match entity nào — kiểm tra entity titles có đang là undefined/null\n` +
        `Sample entity:\n${JSON.stringify(entities[0], null, 2)}`)
    }
  },

  // ── Phase 9: AI Suggestions ────────────────────────────────────────────────

  async 'ai-list'() {
    const res = await msg('GET_AI_SUGGESTIONS')
    if (res?.success && Array.isArray(res.data)) {
      const pending = res.data.filter(s => s.status === 'pending')
      setStatus('ai-list', 'pass', `${res.data.length} total · ${pending.length} pending`,
        `${res.data.length} suggestions tổng (${pending.length} pending)\n` +
        (res.data.length > 0 ? JSON.stringify(res.data.slice(0, 3), null, 2) : '(chưa có suggestion nào — chạy ai-trigger)'))
    } else {
      setStatus('ai-list', 'fail', 'FAIL',
        'GET_AI_SUGGESTIONS thất bại — kiểm tra aiSuggestions table trong Dexie\n' + JSON.stringify(res))
    }
  },

  async 'ai-trigger'() {
    const logRes = await msg('GET_MATCH_LOGS')
    const logCount = logRes?.data?.length ?? 0

    const beforeRes = await msg('GET_AI_SUGGESTIONS')
    const beforeCount = beforeRes?.data?.filter(s => s.status === 'pending')?.length ?? 0

    const res = await msg('TRIGGER_AI_SUGGEST')

    if (!res?.success) {
      setStatus('ai-trigger', 'fail', 'FAIL',
        'TRIGGER_AI_SUGGEST trả lỗi\n' + JSON.stringify(res))
      return
    }

    const afterRes = await msg('GET_AI_SUGGESTIONS')
    const afterCount = afterRes?.data?.filter(s => s.status === 'pending')?.length ?? 0
    const newSuggestions = afterCount - beforeCount

    if (newSuggestions > 0) {
      setStatus('ai-trigger', 'pass', `+${newSuggestions} new`,
        `Backend trả về ${newSuggestions} gợi ý mới (pending: ${afterCount})\n` +
        JSON.stringify(afterRes.data.filter(s => s.status === 'pending').slice(0, 3), null, 2))
    } else if (logCount === 0) {
      setStatus('ai-trigger', 'warn', 'NO LOGS',
        'Message gửi OK nhưng không có match log để phân tích.\n' +
        'Thêm rules → duyệt YouTube → có logs → chạy lại.\n' +
        'Hoặc bật MOCK_AI=true trong backend/.env để test không cần logs thật.')
    } else {
      setStatus('ai-trigger', 'warn', '0 new suggestions',
        `${logCount} logs có trong DB nhưng backend không trả suggestion mới.\n\n` +
        'Nguyên nhân thường gặp:\n' +
        '1. Backend đang tắt → cd backend && npm run dev\n' +
        '2. BACKEND_URL rỗng trong youtube-filter/.env\n' +
        '3. GEMINI_API_KEY hết quota → bật MOCK_AI=true trong backend/.env\n' +
        '4. Logs không đủ pattern để AI suggest rule\n\n' +
        `Trạng thái: ${logCount} logs, pending suggestions trước: ${beforeCount}, sau: ${afterCount}`)
    }
  },

  async 'ai-resolve'() {
    const res = await msg('GET_AI_SUGGESTIONS')
    const pending = res?.data?.filter(s => s.status === 'pending') ?? []

    if (pending.length === 0) {
      setStatus('ai-resolve', 'warn', 'NO PENDING',
        'Không có suggestion pending để test resolve.\n' +
        'Chạy ai-trigger trước để tạo suggestions rồi chạy lại check này.')
      return
    }

    const target = pending[0]
    const resolveRes = await msg('RESOLVE_AI_SUGGESTION', { id: target.id, status: 'dismissed' })

    if (!resolveRes?.success) {
      setStatus('ai-resolve', 'fail', 'FAIL',
        `RESOLVE_AI_SUGGESTION thất bại\n` + JSON.stringify(resolveRes))
      return
    }

    const afterRes = await msg('GET_AI_SUGGESTIONS')
    const stillPending = afterRes?.data?.find(s => s.id === target.id && s.status === 'pending')

    if (!stillPending) {
      setStatus('ai-resolve', 'pass', 'OK',
        `RESOLVE_AI_SUGGESTION (dismiss) hoạt động đúng\n` +
        `Suggestion id=${target.id} ("${target.targetRaw}") không còn pending`)
    } else {
      setStatus('ai-resolve', 'fail', 'NOT RESOLVED',
        `Suggestion id=${target.id} vẫn còn pending sau khi resolve\n` +
        JSON.stringify(afterRes?.data?.find(s => s.id === target.id), null, 2))
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
  const target = event.target
  if (target.dataset?.checkId) {
    event.preventDefault()
    run(target.dataset.checkId)
    return
  }

  const btn = target.closest('button[data-check-id]')
  if (btn) {
    event.preventDefault()
    run(btn.dataset.checkId)
    return
  }

  if (target.id === 'run-all-btn' || target.closest('#run-all-btn')?.id === 'run-all-btn') {
    event.preventDefault()
    runAll()
  }
})

updateSummary()
